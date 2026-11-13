/**
 * SQLite schema (development / Free-plan fallback storage).
 *
 * Invariants enforced here:
 *  - `address_rows.address_line1` is the ONLY address-line column.
 *  - `row_index` preserves the original input order of every row.
 *  - `raw_row_json` preserves every original column and value verbatim.
 *  - Nothing is ever inferred into these columns without a stored source.
 */
export const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processing_runs (
  id               TEXT PRIMARY KEY,
  label            TEXT,
  source_filename  TEXT,
  source_format    TEXT NOT NULL DEFAULT 'single'
                     CHECK (source_format IN ('single', 'csv', 'xlsx')),
  -- Original header row, in original column order.
  source_headers_json TEXT,
  row_count        INTEGER NOT NULL DEFAULT 0,
  processed_count  INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  engine_version   TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  completed_at     TEXT
);

CREATE TABLE IF NOT EXISTS address_rows (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES processing_runs(id) ON DELETE CASCADE,
  -- 0-based position in the original input; never reordered.
  row_index           INTEGER NOT NULL,
  -- Original spreadsheet/CSV row number for human traceability.
  source_row_number   INTEGER,
  -- Exact original row, keys in original order, values untouched.
  raw_row_json        TEXT NOT NULL,
  -- Untouched original address text as supplied by the user.
  raw_address_text    TEXT,
  -- The ONLY address-line field in the system.
  address_line1       TEXT,
  postcode            TEXT,
  city                TEXT,
  region              TEXT,
  country             TEXT,
  country_code        TEXT,
  confidence          INTEGER CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 100)),
  verification_status TEXT
                        CHECK (verification_status IS NULL OR verification_status IN
                          ('verified', 'partially_verified', 'conflicting', 'unverified', 'not_checkable')),
  diagnostics_json    TEXT,
  evidence_json       TEXT,
  created_at          TEXT NOT NULL,
  UNIQUE (run_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_address_rows_run_order
  ON address_rows (run_id, row_index);

CREATE INDEX IF NOT EXISTS idx_address_rows_status
  ON address_rows (verification_status);

CREATE TABLE IF NOT EXISTS verification_cache (
  cache_key    TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  query_json   TEXT NOT NULL,
  result_json  TEXT NOT NULL,
  evidence_url TEXT,
  fetched_at   TEXT NOT NULL,
  expires_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_verification_cache_source
  ON verification_cache (source, fetched_at);
`;
