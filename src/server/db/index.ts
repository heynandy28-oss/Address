import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema.js';

export type Db = DatabaseSync;

export interface SchemaSnapshot {
  schemaVersion: number;
  tables: string[];
  columns: Record<string, string[]>;
}

/**
 * Opens (and migrates) the SQLite database.
 * `:memory:` is supported for tests.
 */
export function openDatabase(file: string): Db {
  if (file !== ':memory:') {
    mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec(SCHEMA_SQL);
  migrate(db);

  return db;
}

/**
 * Idempotent upgrades for databases created by an earlier schema version.
 * `CREATE TABLE IF NOT EXISTS` cannot add a column to an existing table, so
 * new columns are added explicitly and the current version is recorded.
 */
function migrate(db: Db): void {
  const runColumns = db.prepare('PRAGMA table_info(processing_runs)').all() as Array<{
    name: string;
  }>;

  if (!runColumns.some((column) => column.name === 'source_headers_json')) {
    db.exec('ALTER TABLE processing_runs ADD COLUMN source_headers_json TEXT');
  }

  db.prepare('INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)')
    .run(SCHEMA_VERSION, new Date().toISOString());
}

/** Introspection used by /api/health and by the Address Line 1 guard test. */
export function getSchemaSnapshot(db: Db): SchemaSnapshot {
  const tableRows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as Array<{ name: string }>;

  const columns: Record<string, string[]> = {};
  for (const table of tableRows) {
    const info = db.prepare(`PRAGMA table_info(${table.name})`).all() as Array<{ name: string }>;
    columns[table.name] = info.map((column) => column.name);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    tables: tableRows.map((table) => table.name),
    columns,
  };
}
