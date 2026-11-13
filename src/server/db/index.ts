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

  const existing = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number };
  if (!existing || existing.n === 0) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
      .run(SCHEMA_VERSION, new Date().toISOString());
  }

  return db;
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
