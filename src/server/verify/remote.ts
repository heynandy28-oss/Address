/**
 * Targeted, throttled evidence lookups against public OpenStreetMap services.
 *
 * Usage policy enforced here:
 *  - at most one upstream request per MIN_INTERVAL_MS (≥1 second), serialised
 *    through a queue so parallel callers cannot exceed the limit;
 *  - an identifying User-Agent on every request;
 *  - responses cached for 24 hours, so repeated lookups never re-query;
 *  - a hard request timeout;
 *  - only ever called for a single address the user asked about. Bulk runs use
 *    the bundled GeoNames seed and never reach this module.
 */
import type { EvidenceSource } from '../../shared/types.js';

export const MIN_INTERVAL_MS = 1100;
export const USER_AGENT = 'AddressIntelligence/0.1 (deterministic address verification)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 8000;
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';

export interface RemoteCandidate {
  source: EvidenceSource;
  displayName: string;
  placeName: string | null;
  postcode: string | null;
  countryCode: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  queryUrl: string;
  evidenceUrl: string;
  license: string;
  retrievedAt: string;
}

interface CacheEntry {
  at: number;
  json: unknown;
}

const cache = new Map<string, CacheEntry>();

let lastRequestAt = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Test-only: clears throttle and cache state between cases. */
export function __resetRemoteState(): void {
  lastRequestAt = 0;
  chain = Promise.resolve();
  cache.clear();
}

/** Test-only: runs a task through the same serialisation the network uses. */
export function __scheduleForTest<T>(task: () => Promise<T>): Promise<T> {
  return schedule(task);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return task();
  });
  chain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function fetchJson(url: string): Promise<unknown> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.json;

  const json = await schedule(async () => {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).host}`);
    return response.json() as Promise<unknown>;
  });

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(url, { at: Date.now(), json });
  return json;
}

/** Nominatim search URL for a structured postcode query or a free-text query. */
export function nominatimSearchUrl(input: {
  postcode: string | null;
  countryCode: string | null;
  freeText: string;
}): string {
  const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '3' });
  if (input.postcode) params.set('postalcode', input.postcode);
  else params.set('q', input.freeText);
  if (input.countryCode) params.set('countrycodes', input.countryCode.toLowerCase());
  return `${NOMINATIM_ENDPOINT}?${params.toString()}`;
}

function openStreetMapUrl(latitude: number | null, longitude: number | null, fallback: string): string {
  if (latitude === null || longitude === null) return fallback;
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;
}

function parseNominatim(json: unknown, queryUrl: string, retrievedAt: string): RemoteCandidate[] {
  if (!Array.isArray(json)) return [];
  const candidates: RemoteCandidate[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const address = (item.address && typeof item.address === 'object' ? item.address : {}) as Record<
      string,
      unknown
    >;
    const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
    const latitude = typeof item.lat === 'string' ? Number(item.lat) : null;
    const longitude = typeof item.lon === 'string' ? Number(item.lon) : null;

    candidates.push({
      source: 'nominatim',
      displayName: text(item.display_name) ?? 'Unnamed result',
      placeName:
        text(address.city) ?? text(address.town) ?? text(address.village) ?? text(address.hamlet) ?? text(item.name),
      postcode: text(address.postcode),
      countryCode: text(address.country_code)?.toUpperCase() ?? null,
      region: text(address.state) ?? text(address.region) ?? text(address.county),
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      queryUrl,
      evidenceUrl: openStreetMapUrl(latitude, longitude, queryUrl),
      license: '© OpenStreetMap contributors, ODbL',
      retrievedAt,
    });
  }
  return candidates;
}

function parsePhoton(json: unknown, queryUrl: string, retrievedAt: string): RemoteCandidate[] {
  if (!json || typeof json !== 'object') return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const candidates: RemoteCandidate[] = [];

  for (const feature of features) {
    if (!feature || typeof feature !== 'object') continue;
    const record = feature as Record<string, unknown>;
    const properties = (record.properties && typeof record.properties === 'object'
      ? record.properties
      : {}) as Record<string, unknown>;
    const geometry = (record.geometry && typeof record.geometry === 'object'
      ? record.geometry
      : {}) as Record<string, unknown>;
    const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    const longitude = typeof coordinates[0] === 'number' ? coordinates[0] : null;
    const latitude = typeof coordinates[1] === 'number' ? coordinates[1] : null;
    const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

    candidates.push({
      source: 'photon',
      displayName: text(properties.name) ?? text(properties.street) ?? 'Unnamed result',
      placeName: text(properties.city) ?? text(properties.name),
      postcode: text(properties.postcode),
      countryCode: text(properties.countrycode)?.toUpperCase() ?? null,
      region: text(properties.state),
      latitude,
      longitude,
      queryUrl,
      evidenceUrl: openStreetMapUrl(latitude, longitude, queryUrl),
      license: '© OpenStreetMap contributors, ODbL',
      retrievedAt,
    });
  }

  return candidates;
}

/**
 * Looks up evidence for one address. Nominatim is tried first; Photon is only
 * consulted when Nominatim returns nothing usable. Both honour the throttle.
 */
export async function searchRemote(input: {
  freeText: string;
  postcode: string | null;
  countryCode: string | null;
}): Promise<RemoteCandidate[]> {
  const retrievedAt = new Date().toISOString();

  const nominatimUrl = nominatimSearchUrl(input);
  const nominatimJson = await fetchJson(nominatimUrl);
  const nominatim = parseNominatim(nominatimJson, nominatimUrl, retrievedAt);
  if (nominatim.length > 0) return nominatim;

  const photonParams = new URLSearchParams({ q: input.freeText, limit: '3', lang: 'en' });
  const photonUrl = `${PHOTON_ENDPOINT}?${photonParams.toString()}`;
  const photonJson = await fetchJson(photonUrl);
  return parsePhoton(photonJson, photonUrl, retrievedAt);
}
