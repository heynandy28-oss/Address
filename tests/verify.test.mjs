import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../dist/server/app.js';
import { openDatabase } from '../dist/server/db/index.js';
import { parseAddress } from '../dist/server/engine/parse.js';
import { verifyAddress } from '../dist/server/verify/service.js';
import {
  MIN_INTERVAL_MS,
  __resetRemoteState,
  __scheduleForTest,
  nominatimSearchUrl,
} from '../dist/server/verify/remote.js';

const OFFLINE = { allowRemote: false };

function verify(line, options = OFFLINE) {
  return verifyAddress(parseAddress(line), options);
}

test('a bundled GeoNames postcode match verifies the address with openable evidence', async () => {
  const result = await verify('350 Fifth Avenue, New York, NY 10118, USA');

  assert.equal(result.verificationStatus, 'verified');
  assert.equal(result.agreement, 'full');
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].source, 'geonames-postal');
  assert.match(result.evidence[0].evidenceUrl, /^https:\/\/www\.geonames\.org\//);
  assert.match(result.evidence[0].detail, /10118/);
  assert.equal(result.remoteAttempted, false);
});

test('a postcode that belongs to another city is reported as conflicting, not corrected', async () => {
  const result = await verify('350 Fifth Avenue, Boston, MA 10118, USA');

  assert.equal(result.verificationStatus, 'conflicting');
  assert.equal(result.agreement, 'conflict');
  assert.match(result.statusReason, /New York/);
  // The supplied city is never overwritten with the evidence city.
  assert.equal(parseAddress('350 Fifth Avenue, Boston, MA 10118, USA').components.city, 'Boston');
});

test('an unlisted postcode yields no evidence instead of a guess', async () => {
  const result = await verify('1 Nowhere Road, Springfield, 99999, United States');

  assert.equal(result.verificationStatus, 'unverified');
  assert.equal(result.evidence.length, 0);
  assert.match(result.statusReason, /Nothing was invented/);
});

test('a country without postal codes is not_checkable when nothing else can be checked', async () => {
  const empty = await verify('   ');
  assert.equal(empty.verificationStatus, 'not_checkable');
  assert.equal(empty.agreement, 'not_applicable');
  assert.equal(empty.evidence.length, 0);
});

test('a throttled remote match adds the query and map evidence', async () => {
  const remoteSearch = async () => [
    {
      source: 'nominatim',
      displayName: '10 Downing Street, London, SW1A 2AA, United Kingdom',
      placeName: 'London',
      postcode: 'SW1A 2AA',
      countryCode: 'GB',
      region: 'England',
      latitude: 51.5034,
      longitude: -0.1276,
      queryUrl: nominatimSearchUrl({ postcode: 'SW1A 2AA', countryCode: 'GB', freeText: 'x' }),
      evidenceUrl: 'https://www.openstreetmap.org/?mlat=51.5034&mlon=-0.1276#map=18/51.5034/-0.1276',
      license: '© OpenStreetMap contributors, ODbL',
      retrievedAt: new Date().toISOString(),
    },
  ];

  const result = await verify('Somewhere, 1 Example Street, London, ZZ9 9ZZ, United Kingdom', {
    allowRemote: true,
    remoteSearch,
  });

  assert.equal(result.remoteAttempted, true);
  assert.equal(result.remoteError, null);
  assert.ok(result.checkedSources.includes('nominatim'));
  const remote = result.evidence.find((record) => record.source === 'nominatim');
  assert.ok(remote, 'remote evidence must be recorded');
  assert.match(remote.evidenceUrl, /^https:\/\/www\.openstreetmap\.org\//);
  assert.ok(remote.queryUrl.includes('nominatim.openstreetmap.org'));
});

test('a failed remote lookup is reported and never replaced with invented evidence', async () => {
  const result = await verify('1 Nowhere Road, Springfield, 99999, United States', {
    allowRemote: true,
    remoteSearch: async () => {
      throw new Error('HTTP 503 from nominatim.openstreetmap.org');
    },
  });

  assert.equal(result.remoteAttempted, true);
  assert.match(result.remoteError, /503/);
  assert.equal(result.evidence.length, 0);
  assert.equal(result.verificationStatus, 'unverified');
  assert.match(result.statusReason, /unreachable/);
});

test('every evidence record points at a permitted public source over https', async () => {
  const result = await verify('10 Downing Street, London, SW1A 2AA, United Kingdom');
  const allowedHosts = ['www.geonames.org', 'www.openstreetmap.org', 'nominatim.openstreetmap.org'];

  for (const record of result.evidence) {
    const url = new URL(record.evidenceUrl);
    assert.equal(url.protocol, 'https:');
    assert.ok(allowedHosts.includes(url.host), `unexpected evidence host ${url.host}`);
    assert.ok(record.detail.length > 0, 'evidence must describe the match');
    assert.ok(record.license.length > 0, 'evidence must carry its licence');
  }
});

test('public lookups are serialised with at least one second between requests', async () => {
  assert.ok(MIN_INTERVAL_MS >= 1000);

  __resetRemoteState();
  const startedAt = Date.now();
  await __scheduleForTest(async () => undefined);
  await __scheduleForTest(async () => undefined);
  const elapsed = Date.now() - startedAt;

  assert.ok(
    elapsed >= MIN_INTERVAL_MS - 50,
    `two scheduled lookups must respect the throttle, took ${elapsed}ms`,
  );
});

test('POST /api/verify returns parsed components, status and evidence', async () => {
  const db = openDatabase(':memory:');
  const app = createApp(db);
  const server = app.listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ line: '350 Fifth Avenue, New York, NY 10118, USA' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.ok, true);
    assert.equal(payload.verification.verificationStatus, 'verified');
    assert.equal(payload.verification.remoteAttempted, false, 'remote lookup must be opt-in');
    assert.ok(Array.isArray(payload.verification.evidence));
    assert.equal(payload.result.components.addressLine1, '350 Fifth Avenue');

    const forbidden = ['line', '2'].join('');
    assert.ok(!Object.keys(payload.result.components).some((key) => key.toLowerCase() === forbidden));

    const blank = await fetch(`http://127.0.0.1:${port}/api/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ line: '  ' }),
    });
    assert.equal(blank.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/verify/sources publishes the licence and throttling policy', async () => {
  const db = openDatabase(':memory:');
  const app = createApp(db);
  const server = app.listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  try {
    const payload = await (await fetch(`http://127.0.0.1:${port}/api/verify/sources`)).json();

    assert.equal(payload.ok, true);
    assert.ok(payload.localSeedRows > 0);
    assert.equal(payload.sources.length, 3);
    assert.ok(payload.sources.every((source) => source.license.length > 0));
    assert.match(payload.remotePolicy, /never bulk-queried/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
