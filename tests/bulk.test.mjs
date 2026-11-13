import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../dist/server/app.js';
import { writeXlsx } from '../dist/server/bulk/xlsx.js';
import { openDatabase } from '../dist/server/db/index.js';

const CSV = [
  'Reference,Address,Notes',
  'A-1,"10 Downing Street, London, SW1A 2AA, United Kingdom",first',
  'A-2,"350 Fifth Avenue, New York, NY 10118, USA",second',
  'A-3,"Flat 3/2, 12 Rue de Rivoli, 75004 Paris, France","has, comma"',
].join('\r\n');

function startServer() {
  const db = openDatabase(':memory:');
  const app = createApp(db);
  return new Promise((resolve) => {
    // Bind all interfaces: container-safe, and still reachable via the loopback URL below.
    const server = app.listen(0, '0.0.0.0', () => {
      const address = server.address();
      resolve({ server, db, base: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function withServer(run) {
  const context = await startServer();
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

test('CSV upload keeps every original row, value and position', async () => {
  await withServer(async ({ base }) => {
    const response = await upload(base, CSV);
    assert.equal(response.status, 201);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.run.sourceFormat, 'csv');
    assert.equal(payload.run.addressColumn, 'Address');
    assert.equal(payload.run.addressColumnIndex, 1);
    assert.equal(payload.run.rowCount, 3);
    assert.deepEqual(payload.run.headers, ['Reference', 'Address', 'Notes']);

    assert.deepEqual(
      payload.rows.map((row) => row.originalRow[0]),
      ['A-1', 'A-2', 'A-3'],
      'original row order must be preserved',
    );
    assert.deepEqual(payload.rows.map((row) => row.rowIndex), [0, 1, 2]);
    assert.deepEqual(payload.rows.map((row) => row.sourceRowNumber), [2, 3, 4]);

    assert.deepEqual(payload.rows[0].originalRow, [
      'A-1',
      '10 Downing Street, London, SW1A 2AA, United Kingdom',
      'first',
    ]);
    // A quoted field containing a comma survives untouched.
    assert.equal(payload.rows[2].originalRow[2], 'has, comma');

    assert.equal(payload.rows[0].postcode, 'SW1A 2AA');
    assert.equal(payload.rows[0].countryCode, 'GB');
    assert.equal(payload.rows[1].countryCode, 'US');
    assert.equal(payload.rows[1].postcode, '10118');

    // Only Address Line 1 describes the street line.
    assert.ok('addressLine1' in payload.rows[0]);
    const forbiddenKey = ['line', '2'].join('');
    assert.ok(!Object.keys(payload.rows[0]).some((key) => key.toLowerCase() === forbiddenKey));
  });
});

test('export returns original columns first, in original order, then derived values', async () => {
  await withServer(async ({ base }) => {
    const payload = await (await upload(base, CSV)).json();
    const response = await fetch(`${base}${payload.exports.csv}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(response.headers.get('content-disposition'), /attachment/);

    const text = await response.text();
    const forbiddenHeader = new RegExp(['line', '\\s*', '2'].join(''), 'i');
    assert.ok(!forbiddenHeader.test(text), 'exports must not carry an extra street-line field');

    const lines = text.trim().split(/\r?\n/);
    assert.equal(lines.length, 4, 'header plus three original rows');
    assert.match(lines[0], /^Reference,Address,Notes,Address Line 1,Postcode,City,Region,Country,Country Code/);
    assert.ok(lines[1].startsWith('A-1,'));
    assert.ok(lines[2].startsWith('A-2,'));
    assert.ok(lines[3].startsWith('A-3,'));
  });
});

test('Excel upload and Excel export both work', async () => {
  await withServer(async ({ base }) => {
    const workbook = await writeXlsx([
      ['Ref', 'Full Address'],
      ['X-1', 'Unter den Linden 77, 10117 Berlin, Germany'],
      ['X-2', 'Carrer de Mallorca 401, 08013 Barcelona, Spain'],
    ]);

    const response = await upload(base, workbook, 'addresses.xlsx');
    assert.equal(response.status, 201);
    const payload = await response.json();

    assert.equal(payload.run.sourceFormat, 'xlsx');
    assert.equal(payload.run.addressColumn, 'Full Address');
    assert.equal(payload.run.rowCount, 2);
    assert.equal(payload.rows[0].countryCode, 'DE');
    assert.equal(payload.rows[1].postcode, '08013');

    const exported = await fetch(`${base}${payload.exports.xlsx}`);
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type'), /spreadsheetml/);
    const bytes = Buffer.from(await exported.arrayBuffer());
    assert.equal(bytes.subarray(0, 2).toString('utf8'), 'PK', 'xlsx is a zip container');
  });
});

test('a column override selects the address column explicitly', async () => {
  await withServer(async ({ base }) => {
    const payload = await (
      await upload(base, CSV, 'addresses.csv', { 'x-column': encodeURIComponent('Notes') })
    ).json();
    assert.equal(payload.run.addressColumn, 'Notes');
    assert.equal(payload.run.addressColumnIndex, 2);
  });
});

test('invalid uploads are rejected with a clear message', async () => {
  await withServer(async ({ base }) => {
    const empty = await upload(base, '');
    assert.equal(empty.status, 400);
    assert.match((await empty.json()).error, /empty/i);

    const wrongType = await upload(base, CSV, 'addresses.pdf');
    // A rejected file type is reported as unsupported media (415), not a generic
    // bad request: the body is fine, the container format is not.
    assert.equal(wrongType.status, 415);
    assert.match((await wrongType.json()).error, /\.csv/i);

    const noName = await fetch(`${base}/api/bulk`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: CSV,
    });
    assert.equal(noName.status, 400);

    const headerOnly = await upload(base, 'Reference,Address,Notes');
    assert.equal(headerOnly.status, 400);
    assert.match((await headerOnly.json()).error, /no data rows/i);
  });
});

test('processing history lists runs and replays rows in original order', async () => {
  await withServer(async ({ base }) => {
    const payload = await (await upload(base, CSV)).json();

    const list = await (await fetch(`${base}/api/bulk/runs`)).json();
    assert.equal(list.ok, true);
    assert.equal(list.runs.length, 1);
    assert.equal(list.runs[0].runId, payload.run.runId);
    assert.equal(list.runs[0].rowCount, 3);

    const detail = await (await fetch(`${base}/api/bulk/${payload.run.runId}`)).json();
    assert.equal(detail.ok, true);
    assert.deepEqual(
      detail.rows.map((row) => row.rowIndex),
      [0, 1, 2],
    );
    assert.deepEqual(
      detail.rows.map((row) => row.originalRow[0]),
      ['A-1', 'A-2', 'A-3'],
    );
    assert.deepEqual(detail.run.headers, ['Reference', 'Address', 'Notes']);

    const missing = await fetch(`${base}/api/bulk/does-not-exist`);
    assert.equal(missing.status, 404);
  });
});
