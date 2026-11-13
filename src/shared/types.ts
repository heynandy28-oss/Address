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

export type DiagnosticKind = 'missing' | 'misplaced' | 'conflicting' | 'ambiguous' | 'informational';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/** One explainable defect found in a parsed address. */
export interface AddressDiagnostic {
  kind: DiagnosticKind;
  severity: DiagnosticSeverity;
  component: keyof ParsedComponents | null;
  code: string;
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
  /** 0-100 overall score derived from extraction rules minus diagnostics. */
  confidence: number;
  /** 0-100 share of the components this country's format expects that were found. */
  completeness: number;
  componentConfidence: Record<keyof ParsedComponents, number | null>;
  diagnostics: AddressDiagnostic[];
  verificationStatus: VerificationStatus;
  statusReason: string;
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
  /** True when the durable backend is failing and the local fallback is in use. */
  degraded: boolean;
  /** Last backend error, kept for diagnosis. Null while healthy. */
  lastError: string | null;
  lastErrorAt: string | null;
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
    supabase: {
      configured: boolean;
      purpose: string;
      required: boolean;
      /** Cached reachability probe; null when Supabase is not configured. */
      reachable: boolean | null;
    };
    llm: { configured: boolean; purpose: string; required: boolean };
  };
  limits: {
    bulk: { maxBytes: number; maxRows: number; maxColumns: number };
    usage: UsageSnapshot;
  };
}

/** Free-plan allowance counters, reported by /api/usage and /api/health. */
export interface UsageSnapshot {
  day: string;
  limits: { maxRowsPerDay: number; maxRunsPerDay: number };
  rowsUsed: number;
  rowsRemaining: number;
  runsUsed: number;
  runsRemaining: number;
  resetsAt: string;
}

export interface UsageResponse {
  ok: true;
  usage: UsageSnapshot;
  rateLimits: Record<string, { windowMs: number; max: number }>;
  upload: { maxBytes: number; maxRows: number; maxColumns: number };
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

/* ------------------------------------------------------------------ *
 * Bulk processing (Phase 3)
 * ------------------------------------------------------------------ */

/** One processed input row. The original cells are kept exactly as supplied. */
export interface BulkRowRecord {
  /** 0-based position in the original file; never re-ordered. */
  rowIndex: number;
  /** 1-based row number in the file, header included. */
  sourceRowNumber: number;
  /** Every original cell value, in the original column order. */
  originalRow: string[];
  /** The address text exactly as supplied in the address column. */
  rawAddressText: string;
  addressLine1: string | null;
  postcode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  confidence: number | null;
  verificationStatus: VerificationStatus | null;
  diagnostics: AddressDiagnostic[];
}

export interface BulkRunSummary {
  runId: string;
  label: string | null;
  sourceFilename: string | null;
  sourceFormat: 'csv' | 'xlsx';
  /** Header of the column that was parsed as the address. */
  addressColumn: string;
  addressColumnIndex: number;
  headers: string[];
  rowCount: number;
  processedCount: number;
  needsAttention: number;
  averageConfidence: number;
  skippedEmptyRows: number;
  createdAt: string;
}

export interface BulkUploadResponse {
  ok: true;
  run: BulkRunSummary;
  rows: BulkRowRecord[];
  previewLimit: number;
  exports: { csv: string; xlsx: string };
}

export interface BulkRunDetail {
  ok: true;
  run: BulkRunSummary;
  rows: BulkRowRecord[];
}

export interface BulkRunListResponse {
  ok: true;
  runs: BulkRunSummary[];
}

/** Free public sources this system is allowed to consult. */
export type EvidenceSource = 'geonames-postal' | 'nominatim' | 'photon';

/**
 * One piece of real, openable evidence behind a verification decision.
 * Records are only ever produced from an actual lookup; nothing is synthesised.
 */
export interface EvidenceRecord {
  source: EvidenceSource;
  sourceLabel: string;
  /** Human-openable page that proves the match. */
  evidenceUrl: string;
  /** Exact upstream request, when a live service was queried. */
  queryUrl: string | null;
  matchedOn: 'postcode' | 'place' | 'country';
  detail: string;
  license: string;
  retrievedAt: string;
}

/** How closely the supplied components agree with the evidence found. */
export type VerificationAgreement = 'full' | 'partial' | 'conflict' | 'none' | 'not_applicable';

export interface VerificationResult {
  verificationStatus: VerificationStatus;
  statusReason: string;
  agreement: VerificationAgreement;
  evidence: EvidenceRecord[];
  checkedSources: EvidenceSource[];
  /** True when a throttled public API was called for this single address. */
  remoteAttempted: boolean;
  /** Populated only when the remote lookup could not be completed. */
  remoteError: string | null;
  checkedAt: string;
}

export interface VerifyResponse {
  ok: true;
  result: ParsedAddress;
  verification: VerificationResult;
}
