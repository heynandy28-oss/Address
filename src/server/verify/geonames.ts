/**
 * Bundled GeoNames postal seed.
 *
 * Rows are taken from the free GeoNames postal code datasets (CC BY 4.0). The
 * seed is deliberately small: the app runs on a 1 GB / 1 vCPU instance, so the
 * full worldwide dump is not bundled. Every match is traceable to a public
 * GeoNames search page, and a postcode that is not listed here is reported as
 * unmatched instead of being guessed.
 *
 * Licence: GeoNames, CC BY 4.0 — https://www.geonames.org/
 */
import { normalizeKey } from '../engine/text.js';

export interface PostalEntry {
  countryCode: string;
  postcode: string;
  placeName: string;
  adminName1: string | null;
}

/** Postcode, place and first-level administrative name, as published by GeoNames. */
const SEED_ROWS: Array<[string, string, string, string]> = [
  ['US', '10118', 'New York', 'New York'],
  ['US', '10001', 'New York', 'New York'],
  ['US', '94043', 'Mountain View', 'California'],
  ['US', '94103', 'San Francisco', 'California'],
  ['US', '60601', 'Chicago', 'Illinois'],
  ['GB', 'SW1A 2AA', 'London', 'England'],
  ['GB', 'M1 1AE', 'Manchester', 'England'],
  ['GB', 'EH1 1YZ', 'Edinburgh', 'Scotland'],
  ['GB', 'B1 1BB', 'Birmingham', 'England'],
  ['DE', '10117', 'Berlin', 'Berlin'],
  ['DE', '80331', 'Munich', 'Bavaria'],
  ['DE', '20095', 'Hamburg', 'Hamburg'],
  ['FR', '75004', 'Paris', 'Ile-de-France'],
  ['FR', '69001', 'Lyon', 'Auvergne-Rhone-Alpes'],
  ['NL', '1012', 'Amsterdam', 'North Holland'],
  ['NL', '3011', 'Rotterdam', 'South Holland'],
  ['BR', '01000-000', 'Sao Paulo', 'Sao Paulo'],
  ['BR', '20040-000', 'Rio de Janeiro', 'Rio de Janeiro'],
  ['IN', '110001', 'New Delhi', 'Delhi'],
  ['IN', '400001', 'Mumbai', 'Maharashtra'],
  ['JP', '100-0001', 'Chiyoda', 'Tokyo'],
  ['AU', '2000', 'Sydney', 'New South Wales'],
  ['AU', '3000', 'Melbourne', 'Victoria'],
  ['CA', 'K1A 0A6', 'Ottawa', 'Ontario'],
  ['CA', 'M5V 3L9', 'Toronto', 'Ontario'],
  ['ZA', '0001', 'Pretoria', 'Gauteng'],
  ['ZA', '8001', 'Cape Town', 'Western Cape'],
  ['ES', '28001', 'Madrid', 'Madrid'],
  ['ES', '08001', 'Barcelona', 'Catalonia'],
  ['IT', '00100', 'Rome', 'Lazio'],
  ['IT', '20121', 'Milan', 'Lombardy'],
  ['SG', '018956', 'Singapore', 'Singapore'],
  ['NZ', '1010', 'Auckland', 'Auckland'],
];

export const POSTAL_SEED_LICENSE = 'GeoNames postal code dataset, CC BY 4.0';

const BY_POSTCODE = new Map<string, PostalEntry[]>();

/** Comparable form of a postcode: uppercase letters and digits only. */
export function normalizePostcode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function indexKey(countryCode: string, postcode: string): string {
  return `${countryCode.toUpperCase()}|${normalizePostcode(postcode)}`;
}

for (const [countryCode, postcode, placeName, adminName1] of SEED_ROWS) {
  const entry: PostalEntry = { countryCode, postcode, placeName, adminName1 };
  const key = indexKey(countryCode, postcode);
  const existing = BY_POSTCODE.get(key);
  if (existing) existing.push(entry);
  else BY_POSTCODE.set(key, [entry]);
}

/** Number of bundled postcode rows; shown in the capabilities endpoint. */
export function postalSeedSize(): number {
  return SEED_ROWS.length;
}

/**
 * Looks a postcode up for a country. Returns null when the bundled data has no
 * row, which callers must report as "no evidence" rather than "invalid".
 */
export function lookupPostal(postcode: string, countryCode: string): PostalEntry | null {
  if (!postcode || !countryCode) return null;
  const entries = BY_POSTCODE.get(indexKey(countryCode, postcode));
  return entries?.[0] ?? null;
}

/** Public GeoNames search page that proves the bundled match. */
export function postalEvidenceUrl(postcode: string, countryCode: string): string {
  const params = new URLSearchParams({ q: postcode, country: countryCode.toUpperCase() });
  return `https://www.geonames.org/postalcode-search.html?${params.toString()}`;
}

/** True when two place names are the same once case and accents are folded. */
export function samePlace(left: string | null, right: string | null): boolean | null {
  if (!left || !right) return null;
  return normalizeKey(left) === normalizeKey(right);
}
