/**
 * Evidence-based verification.
 *
 * Rules this module must never break:
 *  - evidence is only ever produced by an actual lookup; nothing is synthesised;
 *  - a source that returns nothing yields "no evidence", never a guess;
 *  - public APIs are only consulted for a single address the user asked about,
 *    through the throttled client in ./remote.ts. Bulk runs stay local.
 */
import type {
  AddressComponents,
  EvidenceRecord,
  EvidenceSource,
  ParsedAddress,
  VerificationAgreement,
  VerificationResult,
  VerificationStatus,
} from '../../shared/types.js';
import { COUNTRY_FORMATS } from '../engine/countries.js';
import {
  POSTAL_SEED_LICENSE,
  lookupPostal,
  normalizePostcode,
  postalEvidenceUrl,
  postalSeedSize,
  samePlace,
} from './geonames.js';
import { searchRemote, type RemoteCandidate } from './remote.js';

export { postalSeedSize };

export interface VerifyOptions {
  /** Enables the throttled Nominatim/Photon lookup for this single address. */
  allowRemote?: boolean;
  /** Injectable for tests so the suite never touches the network. */
  remoteSearch?: (input: {
    freeText: string;
    postcode: string | null;
    countryCode: string | null;
  }) => Promise<RemoteCandidate[]>;
}

interface Decision {
  status: VerificationStatus;
  agreement: VerificationAgreement;
  reason: string;
}

function decideFromLocal(
  components: AddressComponents,
  entry: { postcode: string; placeName: string; adminName1: string | null },
): Decision {
  const cityAgrees = samePlace(components.city, entry.placeName);
  const regionAgrees = samePlace(components.region, entry.adminName1);

  if (cityAgrees === false) {
    return {
      status: 'conflicting',
      agreement: 'conflict',
      reason: `The bundled GeoNames data lists postcode ${components.postcode} for ${entry.placeName}${
        entry.adminName1 ? `, ${entry.adminName1}` : ''
      }, which contradicts the city "${components.city}".`,
    };
  }

  if (cityAgrees === true && regionAgrees === false) {
    return {
      status: 'partially_verified',
      agreement: 'partial',
      reason: `The postcode and city match ${entry.placeName}, but the region "${components.region}" differs from ${entry.adminName1}.`,
    };
  }

  if (cityAgrees === true) {
    return {
      status: 'verified',
      agreement: 'full',
      reason: `Postcode and city agree with the bundled GeoNames record for ${entry.placeName}${
        entry.adminName1 ? `, ${entry.adminName1}` : ''
      }.`,
    };
  }

  return {
    status: 'partially_verified',
    agreement: 'partial',
    reason: `The postcode is listed for ${entry.placeName}, but the address supplied no city to compare against it.`,
  };
}

function decideFromRemote(components: AddressComponents, candidate: RemoteCandidate): Decision {
  const postcodeAgrees =
    components.postcode && candidate.postcode
      ? normalizePostcode(components.postcode) === normalizePostcode(candidate.postcode)
      : null;
  const cityAgrees = samePlace(components.city, candidate.placeName);
  const countryAgrees =
    components.countryCode && candidate.countryCode
      ? components.countryCode.toUpperCase() === candidate.countryCode.toUpperCase()
      : null;

  if (countryAgrees === false) {
    return {
      status: 'conflicting',
      agreement: 'conflict',
      reason: `The matching public record is in ${candidate.countryCode}, not ${components.countryCode}.`,
    };
  }

  if (postcodeAgrees === false) {
    return {
      status: 'conflicting',
      agreement: 'conflict',
      reason: `The public record for this place carries postcode ${candidate.postcode}, which differs from ${components.postcode}.`,
    };
  }

  if (cityAgrees === false) {
    return {
      status: 'conflicting',
      agreement: 'conflict',
      reason: `The public record matching this postcode is ${candidate.placeName}, which differs from the supplied city "${components.city}".`,
    };
  }

  if (cityAgrees === true) {
    return {
      status: 'verified',
      agreement: 'full',
      reason: `A public OpenStreetMap record confirms ${candidate.placeName}${
        candidate.postcode ? ` (${candidate.postcode})` : ''
      }.`,
    };
  }

  return {
    status: 'partially_verified',
    agreement: 'partial',
    reason: 'A public record matches the postcode, but the address supplied no city to compare against it.',
  };
}

function remoteEvidence(candidate: RemoteCandidate): EvidenceRecord {
  return {
    source: candidate.source,
    sourceLabel: candidate.source === 'nominatim' ? 'Nominatim (OpenStreetMap)' : 'Photon (OpenStreetMap)',
    evidenceUrl: candidate.evidenceUrl,
    queryUrl: candidate.queryUrl,
    matchedOn: candidate.postcode ? 'postcode' : 'place',
    detail: candidate.displayName,
    license: candidate.license,
    retrievedAt: candidate.retrievedAt,
  };
}

/**
 * Verifies one parsed address against permitted free sources.
 * Returns a status plus the evidence that produced it; never a guess.
 */
export async function verifyAddress(
  parsed: ParsedAddress,
  options: VerifyOptions = {},
): Promise<VerificationResult> {
  const checkedAt = new Date().toISOString();
  const components = parsed.components;
  const evidence: EvidenceRecord[] = [];
  const checkedSources: EvidenceSource[] = [];
  const remoteSearch = options.remoteSearch ?? searchRemote;
  const allowRemote = options.allowRemote === true;

  let status: VerificationStatus = 'unverified';
  let agreement: VerificationAgreement = 'none';
  let reason = '';
  let remoteAttempted = false;
  let remoteError: string | null = null;

  const finish = (): VerificationResult => ({
    verificationStatus: status,
    statusReason: reason,
    agreement,
    evidence,
    checkedSources,
    remoteAttempted,
    remoteError,
    checkedAt,
  });

  if (!parsed.normalizedText) {
    status = 'not_checkable';
    agreement = 'not_applicable';
    reason = 'No address text was supplied, so there is nothing to verify.';
    return finish();
  }

  if (!components.postcode && !components.city) {
    status = 'not_checkable';
    agreement = 'not_applicable';
    reason =
      'The address carries neither a postcode nor a city, so no permitted free source can confirm it. Nothing was invented.';
    return finish();
  }

  // 1. Local, bundled GeoNames matching — the only source used for bulk runs.
  if (components.postcode && components.countryCode) {
    checkedSources.push('geonames-postal');
    const entry = lookupPostal(components.postcode, components.countryCode);

    if (entry) {
      const decision = decideFromLocal(components, entry);
      status = decision.status;
      agreement = decision.agreement;
      reason = decision.reason;
      evidence.push({
        source: 'geonames-postal',
        sourceLabel: 'GeoNames postal codes',
        evidenceUrl: postalEvidenceUrl(entry.postcode, entry.countryCode),
        queryUrl: null,
        matchedOn: 'postcode',
        detail: `${entry.postcode} → ${entry.placeName}${entry.adminName1 ? `, ${entry.adminName1}` : ''} (${entry.countryCode})`,
        license: POSTAL_SEED_LICENSE,
        retrievedAt: checkedAt,
      });
    } else {
      reason = `The bundled GeoNames seed has no record for postcode ${components.postcode} in ${components.countryCode}.`;
    }
  } else if (!components.postcode) {
    reason = 'The address has no postcode, so only a place-name lookup could confirm it.';
  }

  // 2. Optional targeted public lookup for a single address.
  if (allowRemote && status !== 'verified') {
    remoteAttempted = true;
    try {
      const candidates = await remoteSearch({
        freeText: parsed.normalizedText,
        postcode: components.postcode,
        countryCode: components.countryCode,
      });

      const usable = components.countryCode
        ? candidates.filter(
            (candidate) =>
              !candidate.countryCode ||
              candidate.countryCode.toUpperCase() === components.countryCode?.toUpperCase(),
          )
        : candidates;

      const best = usable[0];
      if (best) {
        if (!checkedSources.includes(best.source)) checkedSources.push(best.source);
        const decision = decideFromRemote(components, best);
        status = decision.status;
        agreement = decision.agreement;
        reason = decision.reason;
        evidence.push(remoteEvidence(best));
      } else if (status === 'unverified') {
        reason = 'A throttled public lookup returned no matching record, so nothing was invented.';
      }
    } catch (error) {
      remoteError = error instanceof Error ? error.message : 'The public lookup could not be completed.';
    }
  }

  if (status === 'unverified') {
    const suffix = remoteError ? ` The public source was unreachable (${remoteError}).` : '';
    reason = `${reason || 'No permitted free source matched this address.'}${suffix} Nothing was invented.`;
  }

  return finish();
}

/** Capability summary shown by the API and the dashboard. */
export function verificationCapabilities(): {
  localSeedRows: number;
  sources: Array<{ id: EvidenceSource; label: string; license: string; mode: string }>;
  remotePolicy: string;
} {
  return {
    localSeedRows: postalSeedSize(),
    sources: [
      {
        id: 'geonames-postal',
        label: 'GeoNames postal codes (bundled seed)',
        license: POSTAL_SEED_LICENSE,
        mode: 'local, used for single and bulk runs',
      },
      {
        id: 'nominatim',
        label: 'Nominatim / OpenStreetMap',
        license: '© OpenStreetMap contributors, ODbL',
        mode: 'single address only, ≥1s between requests, 24h cache',
      },
      {
        id: 'photon',
        label: 'Photon / OpenStreetMap',
        license: '© OpenStreetMap contributors, ODbL',
        mode: 'single address fallback, throttled and cached',
      },
    ],
    remotePolicy:
      'Public APIs are never bulk-queried. They are called only when you verify one address and enable the remote lookup.',
  };
}
