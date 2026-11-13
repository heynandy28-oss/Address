/**
 * Deterministic address parsing engine.
 *
 * The engine extracts what the supplied text actually contains and never
 * invents a value: when a component cannot be justified from the input, the
 * field stays null and a note explains why. Every extracted value records the
 * rule that produced it in `bases`, so later phases can score confidence from
 * evidence instead of guesswork.
 */
import type {
  ComponentBasis,
  ParsedAddress,
  ParsedComponents,
  ParseNote,
} from '../../shared/types.js';
import {
  AMBIGUOUS_CODES,
  COUNTRY_FORMATS,
  GENERIC_POSTCODE_CORES,
  lookupCountry,
  lookupRegion,
  REGIONS,
  type CountryFormat,
} from './countries.js';
import {
  collapseWhitespace,
  hasDigit,
  isPlaceLike,
  normalizeKey,
  normalizeLine,
  splitSegments,
  stripTrailingPunctuation,
} from './text.js';

export const PARSER_VERSION = '0.1.0-phase1';

/** Longest address line accepted by the API, in characters. */
export const MAX_LINE_LENGTH = 400;

export interface ParseOptions {
  countryHint?: string | null;
}

interface CountryResolution {
  code: string;
  name: string;
  basis: ComponentBasis;
  rest: string;
  ambiguous: boolean;
}

/** Region names that are also plausible country names ("Georgia", "Delhi"). */
const REGION_NAME_KEYS = new Set(
  Object.values(REGIONS)
    .flat()
    .map((region) => normalizeKey(region.name)),
);

/**
 * ISO 3166-2 codes that belong to exactly one country. A unique code is real
 * evidence of a region even when the country itself is absent, so it is used
 * instead of guessing a country.
 */
const UNIQUE_REGION_CODES = new Map<string, { code: string; name: string } | null>();
for (const regions of Object.values(REGIONS)) {
  for (const region of regions) {
    const key = normalizeKey(region.code);
    const existing = UNIQUE_REGION_CODES.get(key);
    UNIQUE_REGION_CODES.set(key, existing === undefined ? { code: region.code, name: region.name } : null);
  }
}

function uniqueRegionForCode(token: string): { code: string; name: string } | null {
  return UNIQUE_REGION_CODES.get(normalizeKey(token)) ?? null;
}

/**
 * Matches a country at the END of a segment, longest candidate first, so
 * "United States of America" wins over "America".
 */
function resolveTrailingCountry(segment: string): CountryResolution | null {
  const words = collapseWhitespace(segment).split(' ').filter(Boolean);
  for (let count = words.length; count >= 1; count -= 1) {
    const candidate = words.slice(words.length - count).join(' ');
    const key = normalizeKey(candidate);
    if (!key) continue;
    const entry = lookupCountry(key);
    if (!entry) continue;
    const bareIsoCode = count === 1 && key === entry.code.toLowerCase();
    return {
      code: entry.code,
      name: entry.name,
      basis: entry.basis,
      rest: words.slice(0, words.length - count).join(' '),
      ambiguous:
        (bareIsoCode && AMBIGUOUS_CODES.has(entry.code)) || REGION_NAME_KEYS.has(key),
    };
  }
  return null;
}

function standardize(components: ParsedComponents): string {
  return [components.addressLine1, components.city, components.region, components.postcode, components.country]
    .filter((value): value is string => Boolean(value))
    .join(', ');
}

function computeMissing(
  components: ParsedComponents,
  format: CountryFormat | null,
): (keyof ParsedComponents)[] {
  const missing: (keyof ParsedComponents)[] = [];
  if (!components.addressLine1) missing.push('addressLine1');
  if (!components.city) missing.push('city');
  const postcodeExpected = format ? format.postcodeExpected : true;
  if (!components.postcode && postcodeExpected) missing.push('postcode');
  if (!components.region && format?.regionSet) missing.push('region');
  if (!components.country) missing.push('country');
  if (!components.countryCode) missing.push('countryCode');
  return missing;
}

export function parseAddress(rawLine: string, options: ParseOptions = {}): ParsedAddress {
  const parsedAt = new Date().toISOString();
  const rawText = typeof rawLine === 'string' ? rawLine : '';
  const normalizedText = normalizeLine(rawText);
  const notes: ParseNote[] = [];
  const bases: Partial<Record<keyof ParsedComponents, ComponentBasis>> = {};

  const components: ParsedComponents = {
    addressLine1: null,
    postcode: null,
    city: null,
    region: null,
    regionCode: null,
    country: null,
    countryCode: null,
  };

  let format: CountryFormat | null = null;

  const finish = (): ParsedAddress => ({
    rawText,
    normalizedText,
    standardizedText: standardize(components),
    components,
    bases,
    missingComponents: computeMissing(components, format),
    notes,
    parserVersion: PARSER_VERSION,
    parsedAt,
  });

  if (!normalizedText) {
    notes.push({
      code: 'empty-input',
      severity: 'warning',
      message: 'No address text was supplied.',
    });
    return finish();
  }

  let segments = splitSegments(normalizedText);
  if (segments.length === 0) segments = [normalizedText];

  // --- country -------------------------------------------------------------
  const hintKey = options.countryHint ? normalizeKey(options.countryHint) : '';
  const hint = hintKey ? lookupCountry(hintKey) : null;

  if (options.countryHint && !hint) {
    notes.push({
      code: 'invalid-country-hint',
      severity: 'warning',
      message: `The country hint "${options.countryHint}" is not a recognised country name or ISO code.`,
    });
  }

  if (hint) {
    components.country = hint.name;
    components.countryCode = hint.code;
    bases.country = 'country-hint';
    bases.countryCode = 'country-hint';
  }

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const resolution = resolveTrailingCountry(segments[index]);
    if (!resolution) continue;

    const wasTrailing = index === segments.length - 1;

    if (hint && hint.code !== resolution.code) {
      notes.push({
        code: 'country-hint-conflict',
        severity: 'warning',
        message: `The address names ${resolution.name} but the country hint is ${hint.name}; the hint was kept.`,
      });
    } else if (!hint) {
      components.country = resolution.name;
      components.countryCode = resolution.code;
      bases.country = resolution.basis;
      bases.countryCode = resolution.basis;
    }

    if (resolution.ambiguous) {
      notes.push({
        code: 'ambiguous-country',
        severity: 'info',
        message: `"${resolution.name}" is also used as a subnational name or code, so the country reading may need confirmation.`,
      });
    }

    if (!wasTrailing) {
      notes.push({
        code: 'country-not-trailing',
        severity: 'warning',
        message: 'The country appeared before the end of the address line.',
      });
    }

    if (resolution.rest) segments[index] = resolution.rest;
    else segments.splice(index, 1);
    break;
  }

  if (!components.countryCode) {
    notes.push({
      code: 'country-not-detected',
      severity: 'warning',
      message: 'No country name or ISO code was found in the address line.',
    });
  }

  format = components.countryCode ? COUNTRY_FORMATS[components.countryCode] ?? null : null;

  // --- postcode ------------------------------------------------------------
  const postcodeCores = format
    ? format.postcodeCore
      ? [format.postcodeCore]
      : []
    : GENERIC_POSTCODE_CORES;

  if (format && !format.postcodeExpected) {
    notes.push({
      code: 'postcode-not-used',
      severity: 'info',
      message: `${components.country} addresses do not use postal codes, so none was expected.`,
    });
  }

  for (let index = segments.length - 1; index >= 0 && !components.postcode; index -= 1) {
    const segment = segments[index];
    const upper = segment.toUpperCase();

    for (const core of postcodeCores) {
      const whole = upper.match(new RegExp(`^${core}$`));
      if (whole) {
        components.postcode = whole[0];
        bases.postcode = format ? 'postcode-pattern' : 'postcode-pattern-generic';
        segments.splice(index, 1);
        break;
      }

      if (index > 0) {
        const prefix = upper.match(new RegExp(`^(${core})\\s+(.+)$`));
        if (prefix && isPlaceLike(prefix[2])) {
          components.postcode = prefix[1];
          bases.postcode = format ? 'postcode-pattern' : 'postcode-pattern-generic';
          const rest = stripTrailingPunctuation(segment.slice(prefix[1].length));
          if (rest) segments[index] = rest;
          else segments.splice(index, 1);
          break;
        }
      }

      const suffix = upper.match(new RegExp(`^(.+?)\\s+(${core})$`));
      if (suffix) {
        components.postcode = suffix[2];
        bases.postcode = format ? 'postcode-pattern' : 'postcode-pattern-generic';
        const rest = stripTrailingPunctuation(segment.slice(0, segment.length - suffix[2].length));
        if (rest) segments[index] = rest;
        else segments.splice(index, 1);
        break;
      }
    }
  }

  // --- region --------------------------------------------------------------
  const regionSet = format?.regionSet;
  if (regionSet) {
    for (let index = segments.length - 1; index >= 1; index -= 1) {
      const segment = segments[index];
      const direct = lookupRegion(regionSet, segment);
      // A region name is only taken when another locality part remains to be
      // the city, otherwise a city-state such as Berlin would be swallowed.
      const otherLocality = segments.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index && candidateIndex >= 1 && !hasDigit(candidate),
      );
      if (direct && (direct.matchedBy === 'code' || otherLocality)) {
        components.region = direct.name;
        components.regionCode = direct.code;
        bases.region = direct.matchedBy === 'code' ? 'region-code' : 'region-name';
        bases.regionCode = bases.region;
        segments.splice(index, 1);
        break;
      }

      const dashed = segment.match(/^(.*\S)\s+-\s+([A-Za-z]{2,3})$/);
      if (dashed) {
        const match = lookupRegion(regionSet, dashed[2]);
        if (match) {
          components.region = match.name;
          components.regionCode = match.code;
          bases.region = 'region-code';
          bases.regionCode = 'region-code';
          segments[index] = stripTrailingPunctuation(dashed[1]);
          break;
        }
      }
    }
  }

  // --- city and address line ----------------------------------------------
  const contextEstablished = Boolean(
    components.postcode || components.regionCode || components.countryCode,
  );

  if (segments.length === 0) {
    notes.push({
      code: 'no-locality',
      severity: 'info',
      message: 'Only locality information was found; no street text was supplied.',
    });
  } else if (segments.length === 1) {
    const only = segments[0];
    if (contextEstablished && !hasDigit(only)) {
      components.city = only;
      bases.city = 'position-heuristic';
    } else if (/^[A-Z]{2,3}$/.test(only)) {
      components.addressLine1 = only;
      bases.addressLine1 = 'single-segment';
      notes.push({
        code: 'region-code-without-country',
        severity: 'warning',
        message: `"${only}" looks like a region code but no country was identified; it was kept in the address line.`,
      });
    } else {
      components.addressLine1 = only;
      bases.addressLine1 = 'single-segment';
      notes.push({
        code: 'components-not-separable',
        severity: 'info',
        message: 'The address line has a single part, so it was kept intact and no components were separated.',
      });
    }
  } else {
    let cityCandidate = segments[segments.length - 1];

    if (regionSet && !components.region) {
      const words = cityCandidate.split(' ');
      if (words.length > 1) {
        const maybe = lookupRegion(regionSet, words[words.length - 1]);
        if (maybe) {
          components.region = maybe.name;
          components.regionCode = maybe.code;
          bases.region = maybe.matchedBy === 'code' ? 'region-code' : 'region-name';
          bases.regionCode = bases.region;
          cityCandidate = words.slice(0, -1).join(' ');
        }
      }
    }

    if (!regionSet && !components.region) {
      const uniqueRegion = uniqueRegionForCode(cityCandidate);
      if (uniqueRegion) {
        components.region = uniqueRegion.name;
        components.regionCode = uniqueRegion.code;
        bases.region = 'region-code';
        bases.regionCode = 'region-code';
        notes.push({
          code: 'region-from-unique-code',
          severity: 'info',
          message: `"${cityCandidate}" is an ISO 3166-2 region code used by exactly one country, so it was read as a region; the country itself was not determined.`,
        });
        segments = segments.slice(0, -1);
        cityCandidate = segments[segments.length - 1];
      }
    }

    if (segments.length <= 1) {
      components.addressLine1 = segments[0];
      bases.addressLine1 = 'position-heuristic';
      notes.push({
        code: 'city-not-detected',
        severity: 'warning',
        message: 'No separate city could be identified in the address line.',
      });
    } else if (!regionSet && /^[A-Z]{2,3}$/.test(cityCandidate)) {
      components.addressLine1 = segments.join(', ');
      bases.addressLine1 = 'position-heuristic';
      notes.push({
        code: 'region-code-without-country',
        severity: 'warning',
        message: `"${cityCandidate}" looks like a region code but no country was identified; it was kept in the address line.`,
      });
    } else {
      components.city = cityCandidate;
      bases.city = 'position-heuristic';
      components.addressLine1 = segments.slice(0, -1).join(', ');
      bases.addressLine1 = 'position-heuristic';
    }
  }

  if (components.addressLine1) bases.addressLine1 = bases.addressLine1 ?? 'position-heuristic';

  return finish();
}
