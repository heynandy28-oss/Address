import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../dist/server/app.js';
import { COUNTRY_FORMATS } from '../dist/server/engine/countries.js';
import { parseAddress } from '../dist/server/engine/parse.js';
import { FallbackHistoryStore, sqliteStore } from '../dist/server/history/store.js';
import { UploadGate } from '../dist/server/hardening/upload-gate.js';
import { openDatabase } from '../dist/server/db/index.js';

const CSV = [
  'Reference,Address,Notes',
  'A-1,"10 Downing Street, London, SW1A 2AA, United Kingdom",first',
  'A-2,"350 Fifth Avenue, New York, NY 10118, USA",second',
  'A-3,"12 Rue de Rivoli, 75004 Paris, France",third',
].join('\r\n');

function startServer(options = {}) {
  const db = openDatabase(':memory:');
  const app = createApp(db, options);
  return new Promise((resolve) => {
    const server = app.listen(0, '0.0.0.0', () => {
      const address = server.address();
      resolve({ server, db, base: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function withServer(options, run) {
  const context = await startServer(options);
  try {
    await run(context);
  } finally {
    await new Promise((resolve) => context.server.close(resolve));
  }
}

function upload(base, body, filename = 'addresses.csv', headers = {}) {
  return fetch(`${base}/api/bulk`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-filename': encodeURIComponent(filename),
      ...headers,
    },
    body,
  });
}

/* ------------------------------------------------------------ rate limiting */

test('rate limiting returns 429 with Retry-After once the window is exhausted', async () => {
  const rules = { default: { windowMs: 60_000, max: 2 } };
  await withServer({ rateLimits: rules }, async ({ base }) => {
    const body = JSON.stringify({ line: '10 Downing Street, London, SW1A 2AA, UK' });

    const first = await fetch(`${base}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const second = await fetch(`${base}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.headers.get('x-ratelimit-limit'), '2');
    assert.equal(second.headers.get('x-ratelimit-remaining'), '0');

    const third = await fetch(`${base}/api/parse`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers.get('retry-after')) >= 1);

    const payload = await third.json();
    assert.equal(payload.ok, false);
    assert.match(payload.error, /Too many requests/i);
    assert.match(payload.error, /Retry in/i);
    assert.ok(payload.retryAfterSeconds >= 1);
  });
});

test('the health endpoint is never rate limited', async () => {
  const rules = { default: { windowMs: 60_000, max: 1 } };
  await withServer({ rateLimits: rules }, async ({ base }) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await fetch(`${base}/api/health`);
      assert.equal(response.status, 200, `health probe ${attempt + 1} must always answer`);
    }
  });
});

test('rate limits are per client, so one caller cannot throttle another', async () => {
  const rules = { default: { windowMs: 60_000, max: 1 } };
  await withServer({ rateLimits: rules }, async ({ base }) => {
    const call = (client) =>
      fetch(`${base}/api/parse`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': client },
        body: JSON.stringify({ line: '10 Downing Street, London, SW1A 2AA, UK' }),
      });

    assert.equal((await call('203.0.113.10')).status, 200);
    assert.equal((await call('203.0.113.10')).status, 429, 'same client is throttled');
    assert.equal((await call('203.0.113.11')).status, 200, 'a different client is unaffected');
  });
});

/* ------------------------------------------------------- free-plan allowance */

test('the daily row allowance is enforced with a clear message', async () => {
  const usageLimits = { maxRowsPerDay: 5, maxRunsPerDay: 10 };
  await withServer({ usageLimits }, async ({ base }) => {
    const first = await upload(base, CSV);
    assert.equal(first.status, 201);

    const usage = await (await fetch(`${base}/api/usage`)).json();
    assert.equal(usage.ok, true);
    assert.equal(usage.usage.rowsUsed, 3);
    assert.equal(usage.usage.rowsRemaining, 2);
    assert.equal(usage.usage.runsUsed, 1);
    assert.equal(usage.usage.limits.maxRowsPerDay, 5);
    assert.match(usage.usage.resetsAt, /^\d{4}-\d{2}-\d{2}T/);

    const second = await upload(base, CSV);
    assert.equal(second.status, 429);
    const payload = await second.json();
    assert.match(payload.error, /only 2 of today's 5-row/i);
    assert.equal(payload.usage.rowsRemaining, 2);
    assert.ok(Number(second.headers.get('retry-after')) >= 1);

    // A rejected upload must not create a run.
    const runs = await (await fetch(`${base}/api/bulk/runs`)).json();
    assert.equal(runs.runs.length, 1);
  });
});

test('the daily run allowance is enforced separately from the row allowance', async () => {
  const usageLimits = { maxRowsPerDay: 1_000, maxRunsPerDay: 1 };
  await withServer({ usageLimits }, async ({ base }) => {
    assert.equal((await upload(base, CSV)).status, 201);

    const blocked = await upload(base, CSV);
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /1 bulk runs per day is used up/i);
  });
});

test('a rejected upload never consumes allowance', async () => {
  const usageLimits = { maxRowsPerDay: 3, maxRunsPerDay: 5 };
  await withServer({ usageLimits }, async ({ base }) => {
    const rejected = await upload(base, '');
    assert.equal(rejected.status, 400);

    const usage = await (await fetch(`${base}/api/usage`)).json();
    assert.equal(usage.usage.rowsUsed, 0);
    assert.equal(usage.usage.runsUsed, 0);
    assert.equal(usage.usage.rowsRemaining, 3);
  });
});

test('the allowance resets on the next UTC day', async () => {
  let current = new Date('2026-11-13T10:00:00.000Z');
  const options = {
    clock: () => current,
    usageLimits: { maxRowsPerDay: 3, maxRunsPerDay: 1 },
  };

  await withServer(options, async ({ base }) => {
    assert.equal((await upload(base, CSV)).status, 201);
    assert.equal((await upload(base, CSV)).status, 429);

    const used = await (await fetch(`${base}/api/usage`)).json();
    assert.equal(used.usage.rowsUsed, 3);
    assert.equal(used.usage.day, '2026-11-13');

    current = new Date('2026-11-14T00:00:05.000Z');

    const reset = await (await fetch(`${base}/api/usage`)).json();
    assert.equal(reset.usage.rowsUsed, 0);
    assert.equal(reset.usage.runsUsed, 0);
    assert.equal(reset.usage.day, '2026-11-14');

    assert.equal((await upload(base, CSV)).status, 201, 'allowance is available again');
  });
});

test('/api/usage discloses the configured upload and rate limits', async () => {
  await withServer({}, async ({ base }) => {
    const usage = await (await fetch(`${base}/api/usage`)).json();
    assert.equal(usage.upload.maxRows > 0, true);
    assert.equal(usage.upload.maxBytes > 0, true);
    assert.equal(usage.upload.maxColumns > 0, true);
    assert.equal(typeof usage.rateLimits.bulkUpload.max, 'number');
    assert.equal(usage.rateLimits.bulkUpload.windowMs, 3_600_000);
  });
});

/* --------------------------------------------------------------- upload caps */

test('oversized files are rejected before parsing', async () => {
  await withServer({ bulkLimits: { maxBytes: 40 } }, async ({ base }) => {
    const response = await upload(base, CSV);
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /or smaller/i);
  });
});

test('the per-file row cap is enforced with the actual counts', async () => {
  await withServer({ bulkLimits: { maxRows: 2 } }, async ({ base }) => {
    const response = await upload(base, CSV);
    assert.equal(response.status, 413);
    assert.match((await response.json()).error, /at most 2 rows per file; this file has 3/i);
  });
});

test('the per-file column cap is enforced', async () => {
  await withServer({ bulkLimits: { maxColumns: 2 } }, async ({ base }) => {
    const response = await upload(base, CSV);
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /at most 2 columns; this file has 3/i);
  });
});

test('one upload at a time: the gate admits a single holder and frees it again', () => {
  const gate = new UploadGate();
  assert.equal(gate.isBusy, false);

  const release = gate.tryAcquire();
  assert.equal(typeof release, 'function');
  assert.equal(gate.isBusy, true);
  assert.equal(gate.tryAcquire(), null, 'a second concurrent upload is refused');

  release();
  assert.equal(gate.isBusy, false);
  assert.equal(typeof gate.tryAcquire(), 'function');
});

/* --------------------------------------------- file type and content checks */

test('malformed files are rejected with actionable messages', async () => {
  await withServer({}, async ({ base }) => {
    const unterminated = await upload(base, 'Reference,Address\nA-1,"10 Downing Street, London\n');
    assert.equal(unterminated.status, 422);
    assert.match((await unterminated.json()).error, /quoting/i);

    const renamedBinary = await upload(base, Buffer.from([0x41, 0x00, 0x42, 0x43, 0x0a]));
    assert.equal(renamedBinary.status, 415);
    assert.match((await renamedBinary.json()).error, /binary/i);

    const workbookAsCsv = await upload(base, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]));
    assert.equal(workbookAsCsv.status, 415);
    assert.match((await workbookAsCsv.json()).error, /spreadsheet/i);

    const fakeWorkbook = await upload(base, Buffer.from('this is not a workbook'), 'x.xlsx');
    assert.equal(fakeWorkbook.status, 415);
    assert.match((await fakeWorkbook.json()).error, /container header/i);

    const wrongExtension = await upload(base, CSV, 'addresses.docx');
    assert.equal(wrongExtension.status, 415);
    assert.match((await wrongExtension.json()).error, /\.csv/i);
  });
});

test('a byte-order mark does not corrupt the header row', async () => {
  await withServer({}, async ({ base }) => {
    const bom = `\uFEFF${CSV}`;
    const response = await upload(base, bom);
    assert.equal(response.status, 201);

    const payload = await response.json();
    assert.equal(payload.run.rowCount, 3);
    assert.equal(payload.run.addressColumn, 'Address');
    assert.equal(payload.rows[0].countryCode, 'GB');
  });
});

/* ------------------------------------------------- per-country address data */

const COUNTRY_FIXTURES = [
  { code: 'US', input: '1600 Amphitheatre Parkway, Mountain View, CA 94043, USA', postcode: '94043' },
  { code: 'GB', input: '10 Downing Street, London, SW1A 2AA, United Kingdom', postcode: 'SW1A 2AA' },
  { code: 'DE', input: 'Unter den Linden 77, 10117 Berlin, Germany', postcode: '10117' },
  { code: 'FR', input: '123 Rue de la Paix, 75002 Paris, France', postcode: '75002' },
  { code: 'NL', input: 'Damrak 1, 1012 JS Amsterdam, Netherlands', postcode: '1012 JS' },
  { code: 'ES', input: 'Carrer de Mallorca 401, 08013 Barcelona, Spain', postcode: '08013' },
  { code: 'IT', input: 'Via del Corso 12, 00186 Roma, Italy', postcode: '00186' },
  { code: 'CA', input: '290 Bremner Boulevard, Toronto, ON M5V 3L9, Canada', postcode: 'M5V 3L9' },
  { code: 'AU', input: '1 Macquarie Street, Sydney NSW 2000, Australia', postcode: '2000' },
  { code: 'JP', input: '1-1 Chiyoda, Chiyoda City, Tokyo 100-0001, Japan', postcode: '100-0001' },
  { code: 'PL', input: 'ul. Marszalkowska 1, 00-001 Warszawa, Poland', postcode: '00-001' },
];

test('every fixture country parses and its postcode matches the country pattern', () => {
  for (const fixture of COUNTRY_FIXTURES) {
    const format = COUNTRY_FORMATS[fixture.code];
    assert.ok(format, `${fixture.code} must have a postcode format`);

    const parsed = parseAddress(fixture.input, { countryHint: fixture.code });
    const components = parsed.components;

    assert.equal(components.countryCode, fixture.code, `${fixture.code} country code`);
    assert.ok(components.addressLine1, `${fixture.code} street line`);
    assert.ok(components.postcode, `${fixture.code} postcode`);

    // Spacing conventions differ by country (1012 JS vs 1012JS); compare loosely.
    assert.equal(
      (components.postcode ?? '').replace(/\s+/g, ' ').toUpperCase(),
      fixture.postcode.toUpperCase(),
      `${fixture.code} postcode value`,
    );

    const pattern = new RegExp(`^(?:${format.postcodeCore})$`);
    assert.ok(
      pattern.test((components.postcode ?? '').toUpperCase()),
      `${fixture.code} postcode must satisfy its own national pattern`,
    );
    assert.ok(
      !parsed.diagnostics.some(
        (diagnostic) => diagnostic.code === 'postcode-format' && diagnostic.severity === 'error',
      ),
      `${fixture.code} postcode must not be reported as malformed`,
    );
  }
});

/* -------------------------------------------------------- sqlite fallback */

function sampleRun(runId) {
  return {
    runId,
    label: null,
    sourceFilename: 'addresses.csv',
    sourceFormat: 'csv',
    addressColumn: 'Address',
    addressColumnIndex: 1,
    headers: ['Reference', 'Address'],
    rowCount: 1,
    processedCount: 1,
    needsAttention: 0,
    averageConfidence: 82,
    skippedEmptyRows: 0,
    createdAt: new Date('2026-11-13T10:00:00.000Z').toISOString(),
  };
}

function sampleRow() {
  return {
    rowIndex: 0,
    sourceRowNumber: 2,
    originalRow: ['A-1', '10 Downing Street, London, SW1A 2AA, United Kingdom'],
    rawAddressText: '10 Downing Street, London, SW1A 2AA, United Kingdom',
    addressLine1: '10 Downing Street',
    postcode: 'SW1A 2AA',
    city: 'London',
    region: null,
    country: 'United Kingdom',
    countryCode: 'GB',
    confidence: 82,
    verificationStatus: 'unverified',
    diagnostics: [],
  };
}

test('a failing durable backend falls back to SQLite instead of losing the run', async () => {
  const db = openDatabase(':memory:');
  const local = sqliteStore(db);
  const failing = {
    backend: 'supabase',
    durable: true,
    describe: () => ({
      backend: 'supabase',
      durable: true,
      degraded: false,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: null,
    }),
    probe: async () => ({ ok: false, error: 'Supabase 503' }),
    saveRun: async () => {
      throw new Error('Supabase 503');
    },
    listRuns: async () => {
      throw new Error('Supabase 503');
    },
    getRun: async () => {
      throw new Error('Supabase 503');
    },
  };

  const store = new FallbackHistoryStore(failing, local);

  await store.saveRun(sampleRun('run-fallback'), [sampleRow()]);

  const stored = await store.getRun('run-fallback', 10);
  assert.ok(stored, 'the run is still readable after the durable write failed');
  assert.equal(stored.run.runId, 'run-fallback');
  assert.equal(stored.rows[0].originalRow[0], 'A-1');

  const status = store.describe();
  assert.equal(status.degraded, true, 'degraded state is reported');
  assert.match(status.lastError ?? '', /Supabase 503/);
  assert.ok(status.lastErrorAt, 'the failure time is recorded');

  const listed = await store.listRuns(10);
  assert.equal(listed.length, 1, 'listing also falls back');
});
