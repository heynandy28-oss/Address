/**
 * Types shared by the server and the client.
 *
 * Address model rule (non-negotiable): a postal address is described by
 * `addressLine1` only. There is no second address-line field in the type
 * system, the database, the API or the exports.
 */

export type VerificationStatus =
  | 'verified'
  | 'partially_verified'
  | 'conflicting'
  | 'unverified'
  | 'not_checkable';

export interface AddressComponents {
  addressLine1: string | null;
  postcode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
}

export type ComponentBasis =
  | 'country-name'
  | 'country-code'
  | 'country-alias'
  | 'country-hint'
  | 'postcode-pattern'
  | 'postcode-pattern-generic'
  | 'region-code'
  | 'region-name'
  | 'position-heuristic'
  | 'single-segment';

/** Result of parsing one address line. Every value is extracted, never inferred. */
export interface ParsedComponents {
  addressLine1: string | null;
  postcode: string | null;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  country: string | null;
  countryCode: string | null;
}

export type ParseNoteSeverity = 'info' | 'warning';

export interface ParseNote {
  code: string;
  severity: ParseNoteSeverity;
  message: string;
}

export interface ParsedAddress {
  rawText: string;
  normalizedText: string;
  standardizedText: string;
  components: ParsedComponents;
  bases: Partial<Record<keyof ParsedComponents, ComponentBasis>>;
  missingComponents: (keyof ParsedComponents)[];
  notes: ParseNote[];
  parserVersion: string;
  parsedAt: string;
}

export interface ParseResponse {
  ok: true;
  result: ParsedAddress;
}

export interface ApiError {
  ok: false;
  error: string;
}

export interface StorageInfo {
  backend: 'sqlite' | 'supabase';
  ready: boolean;
  schemaVersion: number;
  tables: string[];
  durable: boolean;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  phase: number;
  engineVersion: string;
  time: string;
  uptimeSeconds: number;
  addressModel: {
    addressLineFields: string[];
    line2Supported: boolean;
    enforcedBy: string;
  };
  storage: StorageInfo;
  integrations: {
    supabase: { configured: boolean; purpose: string; required: boolean };
    llm: { configured: boolean; purpose: string; required: boolean };
  };
}

export interface DataSourceInfo {
  name: string;
  role: string;
  access: string;
  attribution: string;
}

export interface RoadmapPhase {
  phase: number;
  title: string;
  summary: string;
  status: 'done' | 'in_progress' | 'planned';
}

export interface SystemInfoResponse {
  service: string;
  version: string;
  phase: number;
  engine: {
    name: string;
    version: string;
    strategy: string;
    llmRequired: boolean;
  };
  addressModel: {
    addressLineFields: string[];
    line2Supported: boolean;
    enforcement: string[];
  };
  dataSources: DataSourceInfo[];
  roadmap: RoadmapPhase[];
  guarantees: string[];
}
