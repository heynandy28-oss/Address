/**
 * Phase 2: deterministic diagnostics and confidence scoring.
 *
 * Confidence is derived from the evidence that produced each component
 * (`bases`) and then reduced by defects, so every point is explainable: each
 * value is traceable to a rule or to a diagnostic. Nothing here contacts a
 * network — external evidence arrives in the verification phase and may only
 * strengthen these results, never replace the rules.
 */
import type {
  AddressDiagnostic,
  ComponentBasis,
  ParsedComponents,
  ParseNote,
  VerificationStatus,
} from '../../shared/types.js';
import { COUNTRY_FORMATS, GENERIC_POSTCODE_CORES, lookupRegion } from './countries.js';
import { normalizeKey } from './text.js';

type ComponentKey = keyof ParsedComponents;

/** Confidence contributed by each extraction rule, before any penalty. */
const BASIS_CONFIDENCE: Record<ComponentBasis, number> = {
  'country-code': 97,
  'country-name': 95,
  'country-alias': 92,
  'country-hint': 55,
  'postcode-pattern': 90,
  'postcode-pattern-generic': 55,
  'region-code': 90,
  'region-name': 85,
  'position-heuristic': 72,
  'single-segment': 45,
};

/** How much each component contributes to the overall score (regionCode folds into region). */
const COMPONENT_WEIGHT: Record<ComponentKey, number> = {
  addressLine1: 25,
  postcode: 20,
  city: 20,
  region: 8,
  regionCode: 0,
  country: 17,
  countryCode: 10,
};

const LABEL: Record<ComponentKey, string> = {
  addressLine1: 'address line 1',
  postcode: 'postcode',
  city: 'city',
  region: 'region',
  regionCode: 'region code',
  country: 'country',
  countryCode: 'country code',
};

/** Fallback when a value exists but its rule was not recorded. */
const UNKNOWN_BASIS_CONFIDENCE = 60;

function matchesCore(value: string, core: string): boolean {
  try {
    return new RegExp(`^(?:${core})$`).test(value.toUpperCase());
  } catch {
    return false;
  }
}

function penaltyFor(diagnostic: AddressDiagnostic): number {
  switch (diagnostic.kind) {
    case 'conflicting':
      return 18;
    case 'misplaced':
      return 8;
    case 'ambiguous':
      return 6;
    case 'missing':
      // Absence already lowers the weighted average; this only adds a small
      // extra cost for a component the country's format expected.
      return diagnostic.severity === 'error' ? 8 : 4;
    default:
      return 0;
  }
}

export interface AssessmentInput {
  components: ParsedComponents;
  bases: Partial<Record<ComponentKey, ComponentBasis>>;
  missingComponents: ComponentKey[];
  notes: ParseNote[];
  normalizedText: string;
}

export interface AddressAssessment {
  confidence: number;
  completeness: number;
  componentConfidence: Record<ComponentKey, number | null>;
  diagnostics: AddressDiagnostic[];
  verificationStatus: VerificationStatus;
  statusReason: string;
}

export function assessAddress(input: AssessmentInput): AddressAssessment {
  const { components, bases, missingComponents, notes } = input;
  const format = components.countryCode ? COUNTRY_FORMATS[components.countryCode] ?? null : null;
  const diagnostics: AddressDiagnostic[] = [];

  const componentConfidence = {} as Record<ComponentKey, number | null>;
  for (const key of Object.keys(COMPONENT_WEIGHT) as ComponentKey[]) {
    const basis = bases[key];
    componentConfidence[key] = components[key]
      ? basis
        ? BASIS_CONFIDENCE[basis]
        : UNKNOWN_BASIS_CONFIDENCE
      : null;
  }

  // --- missing -------------------------------------------------------------
  for (const key of missingComponents) {
    const severity = key === 'addressLine1' || key === 'country' || key === 'countryCode'
      ? 'error'
      : 'warning';
    diagnostics.push({
      kind: 'missing',
      severity,
      component: key,
      code: `missing-${key}`,
      message: `No ${LABEL[key]} could be read from the address line.`,
    });
  }

  // --- misplaced -----------------------------------------------------------
  if (!components.postcode && components.addressLine1) {
    const tokens = components.addressLine1.toUpperCase().split(/[\s,]+/).filter(Boolean);
    const stranded = tokens.find((token) =>
      GENERIC_POSTCODE_CORES.some((core) => matchesCore(token, core)),
    );
    if (stranded) {
      diagnostics.push({
        kind: 'misplaced',
        severity: 'warning',
        component: 'postcode',
        code: 'postcode-in-address-line',
        message: `"${stranded}" looks like a postcode but stayed inside address line 1.`,
      });
    }
  }

  if (components.country && components.addressLine1) {
    const countryKey = normalizeKey(components.country);
    if (countryKey && normalizeKey(components.addressLine1).includes(countryKey)) {
      diagnostics.push({
        kind: 'misplaced',
        severity: 'warning',
        component: 'country',
        code: 'country-in-address-line',
        message: `${components.country} also appears inside address line 1.`,
      });
    }
  }

  if (notes.some((note) => note.code === 'country-not-trailing')) {
    diagnostics.push({
      kind: 'misplaced',
      severity: 'warning',
      component: 'country',
      code: 'country-not-at-end',
      message:
        'The country was found before the end of the line, so later parts may have been read out of order.',
    });
  }

  // --- conflicting ---------------------------------------------------------
  if (notes.some((note) => note.code === 'country-hint-conflict')) {
    diagnostics.push({
      kind: 'conflicting',
      severity: 'error',
      component: 'country',
      code: 'country-hint-conflict',
      message: 'The address names a different country than the country hint that was supplied.',
    });
  }

  if (components.postcode && format?.postcodeCore && !matchesCore(components.postcode, format.postcodeCore)) {
    diagnostics.push({
      kind: 'conflicting',
      severity: 'error',
      component: 'postcode',
      code: 'postcode-country-mismatch',
      message: `The postcode "${components.postcode}" does not match the ${components.country} format${
        format.postcodeExample ? ` (example: ${format.postcodeExample})` : ''
      }.`,
    });
  }

  if (components.regionCode && format?.regionSet && !lookupRegion(format.regionSet, components.regionCode)) {
    diagnostics.push({
      kind: 'conflicting',
      severity: 'error',
      component: 'region',
      code: 'region-country-mismatch',
      message: `Region "${components.regionCode}" is not part of ${components.country}.`,
    });
  }

  // --- ambiguous and informational ----------------------------------------
  if (notes.some((note) => note.code === 'ambiguous-country')) {
    diagnostics.push({
      kind: 'ambiguous',
      severity: 'warning',
      component: 'country',
      code: 'ambiguous-country',
      message:
        'The country token is also a subnational name or an ambiguous code, so the country reading needs confirmation.',
    });
  }

  if (format && !format.postcodeExpected) {
    diagnostics.push({
      kind: 'informational',
      severity: 'info',
      component: 'postcode',
      code: 'postcode-not-used',
      message: `${components.country} addresses do not use postal codes, so no postcode is expected.`,
    });
  }

  if (notes.some((note) => note.code === 'components-not-separable')) {
    diagnostics.push({
      kind: 'informational',
      severity: 'info',
      component: 'addressLine1',
      code: 'single-part-address',
      message: 'The line has a single part, so it was kept intact rather than split into components.',
    });
  }

  // --- scoring -------------------------------------------------------------
  let weighted = 0;
  let weightSum = 0;
  for (const key of Object.keys(COMPONENT_WEIGHT) as ComponentKey[]) {
    const weight = COMPONENT_WEIGHT[key];
    if (weight <= 0) continue;
    weightSum += weight;
    const score = componentConfidence[key];
    if (score !== null) weighted += score * weight;
  }

  const base = weightSum > 0 ? weighted / weightSum : 0;
  const penalty = diagnostics.reduce((total, diagnostic) => total + penaltyFor(diagnostic), 0);
  const confidence = Math.max(0, Math.min(100, Math.round(base - penalty)));

  const expected: ComponentKey[] = ['addressLine1', 'city'];
  if (!format || format.postcodeExpected) expected.push('postcode');
  if (format?.regionSet) expected.push('region');
  expected.push('country', 'countryCode');
  const present = expected.filter((key) => Boolean(components[key])).length;
  const completeness = Math.round((present / expected.length) * 100);

  // --- verification status -------------------------------------------------
  const hasContent = Object.values(components).some(Boolean);
  let verificationStatus: VerificationStatus;
  let statusReason: string;

  if (!hasContent) {
    verificationStatus = 'not_checkable';
    statusReason = 'No address text was supplied, so there is nothing to check.';
  } else if (diagnostics.some((diagnostic) => diagnostic.kind === 'conflicting')) {
    verificationStatus = 'conflicting';
    statusReason =
      'The address line contradicts itself or the supplied country, so it cannot be verified until that is resolved.';
  } else if (completeness < 100) {
    verificationStatus = 'unverified';
    statusReason = 'Some expected components are missing, so the address cannot be verified yet.';
  } else {
    verificationStatus = 'unverified';
    statusReason =
      'Every expected component was read deterministically; no public evidence source has been consulted yet.';
  }

  return {
    confidence,
    completeness,
    componentConfidence,
    diagnostics,
    verificationStatus,
    statusReason,
  };
}
