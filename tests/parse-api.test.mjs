import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const PORT = 34778;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForHealth(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (cause) {
      lastError = cause;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Server did not become healthy: ${lastError}`);
}

async function postParse(body) {
  const response = await fetch(`${BASE_URL}/api/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

test('parse and capability endpoints on the built server', async (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'address-intel-parse-'));
  const child = spawn(process.execPath, ['dist/server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  t.after(() => {
    child.kill('SIGKILL');
    rmSync(dataDir, { recursive: true, force: true });
  });

  await waitForHealth();

  const parsed = await postParse({
    line: '1600 Amphitheatre Parkway, Mountain View, CA 94043, USA',
  });
  assert.equal(parsed.status, 200, stderr);
  assert.equal(parsed.json.ok, true);
  assert.equal(parsed.json.result.components.addressLine1, '1600 Amphitheatre Parkway');
  assert.equal(parsed.json.result.components.postcode, '94043');
  assert.equal(parsed.json.result.components.city, 'Mountain View');
  assert.equal(parsed.json.result.components.regionCode, 'CA');
  assert.equal(parsed.json.result.components.countryCode, 'US');
  assert.equal(parsed.json.result.rawText.startsWith('1600 Amphitheatre'), true);

  const hinted = await postParse({
    line: '10 Downing Street, London, SW1A 2AA',
    countryHint: 'gb',
  });
  assert.equal(hinted.status, 200);
  assert.equal(hinted.json.result.components.countryCode, 'GB');

  const empty = await postParse({ line: '   ' });
  assert.equal(empty.status, 400);
  assert.equal(empty.json.ok, false);

  const tooLong = await postParse({ line: 'A'.repeat(401) });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.json.ok, false);

  const badHint = await postParse({ line: '1 Rue de Rivoli, 75001 Paris', countryHint: 'Atlantis' });
  assert.equal(badHint.status, 400);
  assert.equal(badHint.json.ok, false);

  const capabilitiesResponse = await fetch(`${BASE_URL}/api/engine/capabilities`);
  assert.equal(capabilitiesResponse.status, 200);
  const capabilities = await capabilitiesResponse.json();

  assert.equal(capabilities.ok, true);
  assert.deepEqual(capabilities.addressLineFields, ['addressLine1']);
  assert.ok(capabilities.countries >= 190);
  assert.ok(capabilities.postcodeFormats >= 60);
  assert.ok(capabilities.regionSets.length >= 10);
});
