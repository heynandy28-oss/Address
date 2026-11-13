/**
 * Processing-history storage.
 *
 * One contract, two backends:
 *  - SQLite (`node:sqlite`): always available. Used for local development and as
 *    the safety net when Supabase cannot be reached. It lives inside the
 *    container, so it does not survive a redeploy.
 *  - Supabase (PostgREST over plain `fetch`, no extra dependency): durable
 *    history. Activated only when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are
 *    present in the environment.
 *
 * Both backends keep the same invariants: `address_line1` is the only
 * address-line column, `row_index` preserves the original file order, and the
 * original row is stored verbatim so an export reproduces the input exactly.
 */
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { ENGINE_VERSION, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from '../config.js';
import type {
  AddressDiagnostic,
  BulkRowRecord,
  BulkRunSummary,
  VerificationStatus,
} from '../../shared/types.js';

export interface StoredRun {
  run: BulkRunSummary;
  rows: BulkRowRecord[];
}

export interface HistoryStatus {
  backend: 'sqlite' | 'supabase';
  durable: boolean;
  /** True when the durable backend is failing and the local fallback is in use. */
  degraded: boolean;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
}

export interface HistoryProbe {
  ok: boolean;
  error: string | null;
}

export interface HistoryStore {
  backend: 'sqlite' | 'supabase';
  /** True when history survives a redeploy. */
  durable: boolean;
  /** Last backend error, surfaced by /api/health. Null while healthy. */
  lastError: string | null;
  saveRun(run: BulkRunSummary, records: BulkRowRecord[]): Promise<void>;
  listRuns(limit?: number): Promise<BulkRunSummary[]>;
  getRun(runId: string, limit?: number): Promise<StoredRun | null>;
  /** Current health, including whether the durable backend is degraded. */
  describe(): HistoryStatus;
  /** Cheap reachability probe for the durable backend. */
  probe(): Promise<HistoryProbe>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asDiagnostics(value: unknown): AddressDiagnostic[] {
  if (Array.isArray(value)) return value as AddressDiagnostic[];
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as AddressDiagnostic[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Recomputes the attention count and average confidence from the stored rows. */
function scoreRun(summary: BulkRunSummary, records: BulkRowRecord[]): BulkRunSummary {
  const scored = records.filter((record) => record.confidence !== null);
  return {
    ...summary,
    needsAttention: records.filter(
      (record) =>
        record.verificationStatus === 'conflicting' ||
        record.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    ).length,
    averageConfidence:
      scored.length === 0
        ? 0
        : Math.round(
            scored.reduce((total, record) => total + (record.confidence ?? 0), 0) / scored.length,
          ),
  };
}

/* ------------------------------------------------------------------ SQLite -- */

interface SqliteRunRow {
  id: string;
  label: string | null;
  source_filename: string | null;
  source_format: string;
  source_headers_json: string | null;
  row_count: number;
  processed_count: number;
  status: string;
  created_at: string;
}

interface SqliteRowRow {
  row_index: number;
  source_row_number: number | null;
  raw_row_json: string;
  raw_address_text: string | null;
  address_line1: string | null;
  postcode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  confidence: number | null;
  verification_status: string | null;
  diagnostics_json: string | null;
}

function summaryFromSqlite(row: SqliteRunRow): BulkRunSummary {
  const headers = asStringArray(row.source_headers_json);
  return {
    runId: row.id,
    label: row.label,
    sourceFilename: row.source_filename,
    sourceFormat: row.source_format === 'xlsx' ? 'xlsx' : 'csv',
    addressColumn: '',
    addressColumnIndex: -1,
    headers,
    rowCount: row.row_count,
    processedCount: row.processed_count,
    needsAttention: 0,
    averageConfidence: 0,
    skippedEmptyRows: 0,
    createdAt: row.created_at,
  };
}

function recordFromSqlite(row: SqliteRowRow): BulkRowRecord {
  return {
    rowIndex: row.row_index,
    sourceRowNumber: row.source_row_number ?? row.row_index + 2,
    originalRow: asStringArray(row.raw_row_json),
    rawAddressText: row.raw_address_text ?? '',
    addressLine1: row.address_line1,
    postcode: row.postcode,
    city: row.city,
    region: row.region,
    country: row.country,
    countryCode: row.country_code,
    confidence: row.confidence,
    verificationStatus: (row.verification_status as VerificationStatus | null) ?? null,
    diagnostics: asDiagnostics(row.diagnostics_json),
  };
}

function sqliteStore(db: DatabaseSync): HistoryStore {
  return {
    backend: 'sqlite',
    durable: false,
    lastError: null,
    describe() {
      return {
        backend: 'sqlite' as const,
        durable: false,
        degraded: false,
        lastError: null,
        lastErrorAt: null,
        lastSuccessAt: null,
      };
    },
    async probe() {
      // Local storage is in-process; a successful prepare is proof it is usable.
      db.prepare('SELECT 1').get();
      return { ok: true, error: null };
    },
    async saveRun(run, records) {
      const insertRun = db.prepare(
        `INSERT INTO processing_runs
          (id, label, source_filename, source_format, source_headers_json, row_count,
           processed_count, status, engine_version, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      const insertRow = db.prepare(
        `INSERT INTO address_rows
          (id, run_id, row_index, source_row_number, raw_row_json, raw_address_text,
           address_line1, postcode, city, region, country, country_code, confidence,
           verification_status, diagnostics_json, evidence_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      db.exec('BEGIN');
      try {
        insertRun.run(
          run.runId,
          run.label,
          run.sourceFilename,
          run.sourceFormat,
          JSON.stringify(run.headers),
          records.length,
          run.processedCount,
          'completed',
          ENGINE_VERSION,
          run.createdAt,
          run.createdAt,
        );

        for (const record of records) {
          insertRow.run(
            randomUUID(),
            run.runId,
            record.rowIndex,
            record.sourceRowNumber,
            JSON.stringify(record.originalRow),
            record.rawAddressText,
            record.addressLine1,
            record.postcode,
            record.city,
            record.region,
            record.country,
            record.countryCode,
            record.confidence,
            record.verificationStatus,
            JSON.stringify(record.diagnostics),
            null,
            run.createdAt,
          );
        }

        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async listRuns(limit = 20) {
      const rows = db
        .prepare('SELECT * FROM processing_runs ORDER BY created_at DESC LIMIT ?')
        .all(limit) as unknown as SqliteRunRow[];
      return rows.map(summaryFromSqlite);
    },
    async getRun(runId, limit = 200) {
      const runRow = db.prepare('SELECT * FROM processing_runs WHERE id = ?').get(runId) as
        | SqliteRunRow
        | undefined;
      if (!runRow) return null;

      const rows = db
        .prepare('SELECT * FROM address_rows WHERE run_id = ? ORDER BY row_index ASC LIMIT ?')
        .all(runId, limit) as unknown as SqliteRowRow[];

      const records = rows.map(recordFromSqlite);
      return { run: scoreRun(summaryFromSqlite(runRow), records), rows: records };
    },
  };
}

/* ---------------------------------------------------------------- Supabase -- */

export interface SupabaseHistoryConfig {
  url: string;
  serviceKey: string;
  /** Injected in tests; defaults to the runtime fetch. */
  fetchImpl?: typeof fetch;
}

interface SupabaseRunRow {
  id: string;
  label: string | null;
  source_filename: string | null;
  source_format: string;
  source_headers?: unknown;
  row_count: number;
  processed_count: number;
  created_at: string;
}

interface SupabaseRowRow {
  row_index: number;
  source_row_number: number | null;
  raw_row: unknown;
  raw_address_text: string | null;
  address_line1: string | null;
  postcode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  confidence: number | null;
  verification_status: string | null;
  diagnostics: unknown;
}

function runRowFrom(run: BulkRunSummary, includeHeaders: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: run.runId,
    label: run.label,
    source_filename: run.sourceFilename,
    source_format: run.sourceFormat,
    row_count: run.rowCount,
    processed_count: run.processedCount,
    status: 'completed',
    engine_version: ENGINE_VERSION,
    created_at: run.createdAt,
    completed_at: run.createdAt,
  };
  if (includeHeaders) row.source_headers = run.headers;
  return row;
}

function rowRowFrom(runId: string, record: BulkRowRecord): Record<string, unknown> {
  return {
    run_id: runId,
    row_index: record.rowIndex,
    source_row_number: record.sourceRowNumber,
    raw_row: record.originalRow,
    raw_address_text: record.rawAddressText,
    address_line1: record.addressLine1,
    postcode: record.postcode,
    city: record.city,
    region: record.region,
    country: record.country,
    country_code: record.countryCode,
    confidence: record.confidence,
    verification_status: record.verificationStatus,
    diagnostics: record.diagnostics,
    evidence: [],
  };
}

function summaryFromSupabase(row: SupabaseRunRow): BulkRunSummary {
  return {
    runId: row.id,
    label: row.label,
    sourceFilename: row.source_filename,
    sourceFormat: row.source_format === 'xlsx' ? 'xlsx' : 'csv',
    addressColumn: '',
    addressColumnIndex: -1,
    headers: asStringArray(row.source_headers),
    rowCount: row.row_count,
    processedCount: row.processed_count,
    needsAttention: 0,
    averageConfidence: 0,
    skippedEmptyRows: 0,
    createdAt: row.created_at,
  };
}

function recordFromSupabase(row: SupabaseRowRow): BulkRowRecord {
  return {
    rowIndex: row.row_index,
    sourceRowNumber: row.source_row_number ?? row.row_index + 2,
    originalRow: asStringArray(row.raw_row),
    rawAddressText: row.raw_address_text ?? '',
    addressLine1: row.address_line1,
    postcode: row.postcode,
    city: row.city,
    region: row.region,
    country: row.country,
    countryCode: row.country_code,
    confidence: row.confidence,
    verificationStatus: (row.verification_status as VerificationStatus | null) ?? null,
    diagnostics: asDiagnostics(row.diagnostics),
  };
}

const ROW_CHUNK = 500;

export class SupabaseHistoryStore implements HistoryStore {
  readonly backend = 'supabase' as const;
  readonly durable = true;
  lastError: string | null = null;

  private readonly base: string;
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;
  private probeCache: { at: number; ok: boolean; error: string | null } | null = null;

  constructor(config: SupabaseHistoryConfig) {
    this.base = `${config.url.replace(/\/+$/, '')}/rest/v1`;
    this.key = config.serviceKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  describe(): HistoryStatus {
    return {
      backend: 'supabase',
      durable: true,
      degraded: this.lastError !== null,
      lastError: this.lastError,
      lastErrorAt: null,
      lastSuccessAt: null,
    };
  }

  /**
   * Cached reachability check (30 s), so /api/health can report a real
   * Supabase state without issuing a request on every probe.
   */
  async probe(): Promise<HistoryProbe> {
    const now = Date.now();
    if (this.probeCache && now - this.probeCache.at < 30_000) {
      return { ok: this.probeCache.ok, error: this.probeCache.error };
    }

    try {
      await this.request('processing_runs?select=id&limit=1', {
        signal: AbortSignal.timeout(2_500),
      });
      this.probeCache = { at: now, ok: true, error: null };
      return { ok: true, error: null };
    } catch (error) {
      const message = errorMessage(error);
      this.probeCache = { at: now, ok: false, error: message };
      return { ok: false, error: message };
    }
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await this.fetchImpl(`${this.base}/${path}`, {
      ...init,
      headers: {
        apikey: this.key,
        authorization: `Bearer ${this.key}`,
        'content-type': 'application/json',
        ...((init?.headers as Record<string, string> | undefined) ?? {}),
      },
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
    }
    return text ? (JSON.parse(text) as unknown) : null;
  }

  async saveRun(run: BulkRunSummary, records: BulkRowRecord[]): Promise<void> {
    try {
      await this.request('processing_runs', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify([runRowFrom(run, true)]),
      });
    } catch (error) {
      // A project created before the headers column existed still records runs;
      // exports then fall back to the derived columns only.
      if (!errorMessage(error).includes('source_headers')) throw error;
      await this.request('processing_runs', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify([runRowFrom(run, false)]),
      });
    }

    for (let index = 0; index < records.length; index += ROW_CHUNK) {
      const chunk = records.slice(index, index + ROW_CHUNK);
      await this.request('address_rows', {
        method: 'POST',
        headers: { prefer: 'return=minimal' },
        body: JSON.stringify(chunk.map((record) => rowRowFrom(run.runId, record))),
      });
    }
  }

  async listRuns(limit = 20): Promise<BulkRunSummary[]> {
    const rows = (await this.request(
      `processing_runs?select=*&order=created_at.desc&limit=${limit}`,
    )) as SupabaseRunRow[] | null;
    return (rows ?? []).map(summaryFromSupabase);
  }

  async getRun(runId: string, limit = 200): Promise<StoredRun | null> {
    const runs = (await this.request(
      `processing_runs?select=*&id=eq.${encodeURIComponent(runId)}`,
    )) as SupabaseRunRow[] | null;
    const runRow = runs?.[0];
    if (!runRow) return null;

    const rows = (await this.request(
      `address_rows?select=*&run_id=eq.${encodeURIComponent(runRow.id)}` +
        `&order=row_index.asc&limit=${limit}`,
    )) as SupabaseRowRow[] | null;

    const records = (rows ?? []).map(recordFromSupabase);
    return { run: scoreRun(summaryFromSupabase(runRow), records), rows: records };
  }
}

/* ---------------------------------------------------------------- Fallback -- */

/**
 * Prefers durable storage, but never loses a run because of a backend outage:
 * writes fall back to SQLite and reads fall through to it when Supabase is
 * unreachable or does not know the run. Every fallback is logged, and the
 * degraded state is reported through /api/health.
 */
export class FallbackHistoryStore implements HistoryStore {
  lastError: string | null = null;
  lastErrorAt: string | null = null;
  lastSuccessAt: string | null = null;
  private consecutiveFailures = 0;

  constructor(
    private readonly primary: HistoryStore,
    private readonly fallback: HistoryStore,
  ) {}

  get backend(): 'sqlite' | 'supabase' {
    return this.primary.backend;
  }

  get durable(): boolean {
    return this.primary.durable;
  }

  private noteFailure(operation: string, error: unknown): void {
    const message = `${operation}: ${errorMessage(error)}`;
    this.lastError = message;
    this.lastErrorAt = new Date().toISOString();
    this.consecutiveFailures += 1;

    // Log the first failure, then periodically: a long outage must not flood
    // the container logs.
    if (this.consecutiveFailures === 1 || this.consecutiveFailures % 25 === 0) {
      console.error(
        `[address-intelligence] durable history unavailable ` +
          `(${this.consecutiveFailures} consecutive failure(s)); serving from local fallback: ${message}`,
      );
    }
  }

  private noteSuccess(): void {
    if (this.consecutiveFailures > 0) {
      console.info(
        '[address-intelligence] durable history recovered; new runs are stored in Supabase again',
      );
    }
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.lastSuccessAt = new Date().toISOString();
  }

  describe(): HistoryStatus {
    return {
      backend: this.primary.backend,
      durable: this.primary.durable,
      degraded: this.lastError !== null,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  async probe(): Promise<HistoryProbe> {
    try {
      return await this.primary.probe();
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  async saveRun(run: BulkRunSummary, records: BulkRowRecord[]): Promise<void> {
    try {
      await this.primary.saveRun(run, records);
      this.noteSuccess();
      return;
    } catch (error) {
      this.noteFailure('durable history write failed', error);
      console.error(
        `[address-intelligence] run ${run.runId} was kept in local fallback storage only and ` +
          'will not survive a redeploy; re-upload it once Supabase is reachable.',
      );
      await this.fallback.saveRun(run, records);
    }
  }

  async listRuns(limit?: number): Promise<BulkRunSummary[]> {
    try {
      const runs = await this.primary.listRuns(limit);
      this.noteSuccess();
      return runs;
    } catch (error) {
      this.noteFailure('durable history list failed', error);
      const local = await this.fallback.listRuns(limit);
      console.warn(
        `[address-intelligence] listing ${local.length} run(s) from local fallback storage`,
      );
      return local;
    }
  }

  async getRun(runId: string, limit?: number): Promise<StoredRun | null> {
    try {
      const stored = await this.primary.getRun(runId, limit);
      if (stored) {
        this.noteSuccess();
        return stored;
      }
    } catch (error) {
      this.noteFailure('durable history read failed', error);
    }

    const local = await this.fallback.getRun(runId, limit);
    if (local) {
      console.warn(
        `[address-intelligence] run ${runId} was served from local fallback storage`,
      );
    }
    return local;
  }
}

/**
 * Picks the durable backend when Supabase credentials exist, otherwise local
 * SQLite. No paid service and no mandatory key: the app is fully usable with
 * neither.
 */
export function createHistoryStore(db: DatabaseSync): HistoryStore {
  const local = sqliteStore(db);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.info(
      '[address-intelligence] history backend: sqlite (local only — runs do not survive a redeploy). ' +
        'Connect Supabase and provide SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for durable history.',
    );
    return local;
  }

  console.info('[address-intelligence] history backend: supabase (durable) with sqlite fallback');
  return new FallbackHistoryStore(
    new SupabaseHistoryStore({ url: SUPABASE_URL, serviceKey: SUPABASE_SERVICE_ROLE_KEY }),
    local,
  );
}
