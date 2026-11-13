import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const PORT = 34777;
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

test('health, system metadata and 404 behaviour on the built server', async (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'address-intel-'));
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

  const health = await waitForHealth();

  assert.equal(health.status, 'ok', stderr);
  assert.equal(health.service, 'address-intelligence');
  assert.deepEqual(health.addressModel.addressLineFields, ['addressLine1']);
  assert.equal(health.addressModel.line2Supported, false);
  assert.equal(health.storage.backend, 'sqlite');
  assert.equal(health.storage.ready, true);
  assert.equal(health.storage.schemaVersion, 2);
  assert.ok(health.storage.tables.includes('address_rows'));
  assert.ok(health.storage.tables.includes('processing_runs'));
  assert.ok(health.storage.tables.includes('verification_cache'));
  assert.equal(typeof health.uptimeSeconds, 'number');

  const systemResponse = await fetch(`${BASE_URL}/api/system`);
  assert.equal(systemResponse.status, 200);
  const system = await systemResponse.json();

  assert.deepEqual(system.addressModel.addressLineFields, ['addressLine1']);
  assert.equal(system.addressModel.line2Supported, false);
  assert.equal(system.engine.llmRequired, false);
  assert.ok(system.dataSources.length >= 3);
  assert.ok(system.dataSources.some((source) => /GeoNames/i.test(source.name)));
  assert.ok(system.roadmap.some((phase) => phase.phase === 0 && phase.status === 'done'));

  const missing = await fetch(`${BASE_URL}/api/does-not-exist`);
  assert.equal(missing.status, 404);
});
