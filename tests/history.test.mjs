/**
 * Processing-history storage tests.
 *
 * They cover both backends without touching a network or a real project:
 *  - the SQLite store round-trips a run with the original rows and order intact;
 *  - the Supabase store writes exactly one address-line column, keeps the
 *    original row verbatim, and reads rows back in file order.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { openDatabase } from '../dist/server/db/index.js';
import { SupabaseHistoryStore, createHistoryStore } from '../dist/server/history/store.js';

function sample() {
  const runId = randomUUID();
  const createdAt = '2026-11-13T09:00:00.000Z';
  const headers = ['Name', 'Address'];
  const records = [
    {
      rowIndex: 0,
      sourceRowNumber: 2,
      originalRow: ['Ada', '10 Downing Street, London, SW1A 2AA'],
      rawAddressText: '10 Downing Street, London, SW1A 2AA',
      addressLine1: '10 Downing Street',
      postcode: 'SW1A 2AA',
      city: 'London',
      region: null,
      country: 'United Kingdom',
      countryCode: 'GB',
      confidence: 90,
      verificationStatus: 'verified',
      diagnostics: [],
    },
    {
      rowIndex: 1,
      sourceRowNumber: 3,
      originalRow: ['Lin', '5 Avenue Anatole France, 75007 Paris'],
      rawAddressText: '5 Avenue Anatole France, 75007 Paris',
      addressLine1: '5 Avenue Anatole France',
      postcode: '75007',
      city: 'Paris',
      region: null,
      country: 'France',
      countryCode: 'FR',
      confidence: 82,
      verificationStatus: 'unverified',
      diagnostics: [{ kind: 'missing', message: 'Region not supplied', severity: 'warning' }],
    },
  ];

  const run = {
    runId,
    label: null,
    sourceFilename: 'in.csv',
    sourceFormat: 'csv',
    addressColumn: 'Address',
    addressColumnIndex: 1,
    headers,
    rowCount: records.length,
    processedCount: records.length,
    needsAttention: 0,
    averageConfidence: 86,
    skippedEmptyRows: 0,
    createdAt,
  };

  return { run, records };
}

test('sqlite history keeps the original rows and their order', async () => {
  const db = openDatabase(':memory:');
  const history = createHistoryStore(db);

  assert.equal(history.backend, 'sqlite');
  assert.equal(history.durable, false);

  const { run, records } = sample();
  await history.saveRun(run, records);

  const stored = await history.getRun(run.runId);
  assert.ok(stored);
  assert.deepEqual(
    stored.rows.map((row) => row.rowIndex),
    [0, 1],
  );
  assert.deepEqual(stored.rows[0].originalRow, records[0].originalRow);
  assert.deepEqual(stored.rows[1].originalRow, records[1].originalRow);
  assert.equal(stored.rows[0].addressLine1, '10 Downing Street');
  assert.equal(stored.rows[0].rawAddressText, records[0].rawAddressText);
  assert.deepEqual(stored.run.headers, run.headers);
  assert.equal(stored.run.averageConfidence, 86);
  assert.equal(stored.run.needsAttention, 0);

  const runs = await history.listRuns(5);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].runId, run.runId);
  assert.deepEqual(runs[0].headers, run.headers);
});

test('supabase history writes one address line and the untouched original row', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if ((init.method ?? 'GET') === 'POST') return new Response('', { status: 201 });
    return new Response('[]', { status: 200 });
  };

  const store = new SupabaseHistoryStore({
    url: 'https://demo.supabase.co/',
    serviceKey: 'test-key',
    fetchImpl: fakeFetch,
  });

  const { run, records } = sample();
  await store.saveRun(run, records);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://demo.supabase.co/rest/v1/processing_runs');
  assert.equal(calls[1].url, 'https://demo.supabase.co/rest/v1/address_rows');
  assert.equal(calls[0].init.headers.apikey, 'test-key');
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-key');

  const runBody = JSON.parse(calls[0].init.body);
  assert.equal(runBody.length, 1);
  assert.deepEqual(runBody[0].source_headers, run.headers);
  assert.equal(runBody[0].id, run.runId);

  const rowBody = JSON.parse(calls[1].init.body);
  assert.deepEqual(
    rowBody.map((row) => row.row_index),
    [0, 1],
  );
  assert.deepEqual(rowBody[0].raw_row, records[0].originalRow);
  assert.equal(rowBody[0].raw_address_text, records[0].rawAddressText);

  // The stored column set is fixed: exactly one address-line column, no other.
  const allowed = new Set([
    'run_id',
    'row_index',
    'source_row_number',
    'raw_row',
    'raw_address_text',
    'address_line1',
    'postcode',
    'city',
    'region',
    'country',
    'country_code',
    'confidence',
    'verification_status',
    'diagnostics',
    'evidence',
  ]);
  for (const row of rowBody) {
    const keys = Object.keys(row);
    assert.ok(keys.includes('address_line1'));
    for (const key of keys) {
      assert.ok(allowed.has(key), `unexpected column ${key}`);
    }
  }
});

test('supabase history reads rows back in file order with scores recomputed', async () => {
  const runId = randomUUID();
  const urls = [];

  const fakeFetch = async (url) => {
    urls.push(url);
    if (url.includes('processing_runs?select=')) {
      return new Response(
        JSON.stringify([
          {
            id: runId,
            label: null,
            source_filename: 'in.csv',
            source_format: 'csv',
            source_headers: ['Name', 'Address'],
            row_count: 2,
            processed_count: 2,
            created_at: '2026-11-13T09:00:00.000Z',
          },
        ]),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify([
        {
          row_index: 0,
          source_row_number: 2,
          raw_row: ['Ada', '10 Downing Street, London, SW1A 2AA'],
          raw_address_text: '10 Downing Street, London, SW1A 2AA',
          address_line1: '10 Downing Street',
          postcode: 'SW1A 2AA',
          city: 'London',
          region: null,
          country: 'United Kingdom',
          country_code: 'GB',
          confidence: 90,
          verification_status: 'verified',
          diagnostics: [],
        },
        {
          row_index: 1,
          source_row_number: 3,
          raw_row: ['Lin', '5 Avenue Anatole France, 75007 Paris'],
          raw_address_text: '5 Avenue Anatole France, 75007 Paris',
          address_line1: '5 Avenue Anatole France',
          postcode: '75007',
          city: 'Paris',
          region: null,
          country: 'France',
          country_code: 'FR',
          confidence: 82,
          verification_status: 'conflicting',
          diagnostics: [{ kind: 'conflicting', message: 'City disagrees', severity: 'error' }],
        },
      ]),
      { status: 200 },
    );
  };

  const store = new SupabaseHistoryStore({
    url: 'https://demo.supabase.co',
    serviceKey: 'test-key',
    fetchImpl: fakeFetch,
  });

  const stored = await store.getRun(runId, 100);
  assert.ok(stored);
  assert.deepEqual(
    stored.rows.map((row) => row.rowIndex),
    [0, 1],
  );
  assert.deepEqual(stored.rows[1].originalRow, ['Lin', '5 Avenue Anatole France, 75007 Paris']);
  assert.equal(stored.rows[1].diagnostics.length, 1);
  assert.equal(stored.run.averageConfidence, 86);
  assert.equal(stored.run.needsAttention, 1);
  assert.deepEqual(stored.run.headers, ['Name', 'Address']);
  assert.ok(urls.some((url) => url.includes('order=row_index.asc')));
  assert.ok(urls.some((url) => url.includes(`run_id=eq.${runId}`)));
});

test('supabase history reports a failed write instead of pretending it saved', async () => {
  const store = new SupabaseHistoryStore({
    url: 'https://demo.supabase.co',
    serviceKey: 'test-key',
    fetchImpl: async () => new Response('permission denied', { status: 403 }),
  });

  const { run, records } = sample();
  await assert.rejects(() => store.saveRun(run, records), /Supabase 403/);
});
