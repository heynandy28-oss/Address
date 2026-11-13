import assert from 'node:assert/strict';
import test from 'node:test';
import { getSchemaSnapshot, openDatabase } from '../dist/server/db/index.js';

test('address_rows exposes exactly one address-line column', () => {
  const db = openDatabase(':memory:');
  const snapshot = getSchemaSnapshot(db);

  const columns = snapshot.columns.address_rows;
  assert.ok(columns, 'address_rows table must exist');

  const addressLineColumns = columns.filter((column) => /^address_line/.test(column));
  assert.deepEqual(addressLineColumns, ['address_line1']);

  const forbidden = columns.filter((column) => /(line_?2|address_?2|addr_?2)/i.test(column));
  assert.deepEqual(forbidden, []);

  db.close();
});

test('original row preservation columns and ordering constraints exist', () => {
  const db = openDatabase(':memory:');
  const snapshot = getSchemaSnapshot(db);
  const columns = snapshot.columns.address_rows;

  for (const required of ['raw_row_json', 'row_index', 'source_row_number', 'raw_address_text']) {
    assert.ok(columns.includes(required), `address_rows must keep ${required}`);
  }

  const indexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'address_rows'")
    .all()
    .map((row) => row.name);
  assert.ok(indexes.includes('idx_address_rows_run_order'));

  // A duplicate row_index inside one run must be rejected, so original order
  // can never be silently collapsed.
  db.prepare(
    'INSERT INTO processing_runs (id, source_format, row_count, status, engine_version, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('run-1', 'csv', 2, 'completed', 'test', new Date().toISOString());

  const insertRow = db.prepare(
    'INSERT INTO address_rows (id, run_id, row_index, raw_row_json, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  insertRow.run('row-1', 'run-1', 0, '{"a":"1"}', new Date().toISOString());

  assert.throws(() => insertRow.run('row-2', 'run-1', 0, '{"a":"2"}', new Date().toISOString()));

  db.close();
});

test('verification status is constrained to the documented values', () => {
  const db = openDatabase(':memory:');
  db.prepare(
    'INSERT INTO processing_runs (id, source_format, row_count, status, engine_version, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('run-2', 'single', 1, 'completed', 'test', new Date().toISOString());

  const insertRow = db.prepare(
    'INSERT INTO address_rows (id, run_id, row_index, raw_row_json, verification_status, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const now = new Date().toISOString();

  assert.throws(() => insertRow.run('row-3', 'run-2', 0, '{}', 'invented_status', 50, now));
  assert.throws(() => insertRow.run('row-4', 'run-2', 1, '{}', 'verified', 101, now));
  insertRow.run('row-5', 'run-2', 2, '{}', 'unverified', 0, now);

  db.close();
});
