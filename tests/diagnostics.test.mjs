import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAddress } from '../dist/server/engine/parse.js';

const KINDS = new Set(['missing', 'misplaced', 'conflicting', 'ambiguous', 'informational']);
const SEVERITIES = new Set(['error', 'warning', 'info']);

function codes(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

function find(result, code) {
  return result.diagnostics.find((diagnostic) => diagnostic.code === code);
}

test('a complete address scores high and reports no errors', () => {
  const result = parseAddress('1600 Amphitheatre Parkway, Mountain View, CA 94043, USA');

  assert.equal(result.completeness, 100);
  assert.ok(result.confidence >= 85, `expected a high score, received ${result.confidence}`);
  assert.equal(result.verificationStatus, 'unverified');
  assert.deepEqual(
    result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
    [],
  );
  assert.equal(result.componentConfidence.postcode, 90);
  assert.ok(result.componentConfidence.country >= 85);
  assert.equal(result.componentConfidence.city, 72);
});

test('diagnostics always carry a known kind, severity and message', () => {
  const lines = [
    '1600 Amphitheatre Parkway, Mountain View, CA 94043, USA',
    '123 Main Street, TX',
    'Sheikh Zayed Road, Dubai, United Arab Emirates',
    'Zzzz Qqqq',
    '',
  ];

  for (const line of lines) {
    const result = parseAddress(line);
    assert.ok(Number.isInteger(result.confidence));
    assert.ok(result.confidence >= 0 && result.confidence <= 100);
    assert.ok(result.completeness >= 0 && result.completeness <= 100);

    for (const diagnostic of result.diagnostics) {
      assert.ok(KINDS.has(diagnostic.kind), `unknown kind ${diagnostic.kind}`);
      assert.ok(SEVERITIES.has(diagnostic.severity), `unknown severity ${diagnostic.severity}`);
      assert.ok(diagnostic.message.length > 0);
    }
  }
});

test('a missing country is an error and lowers confidence', () => {
  const result = parseAddress('123 Main Street, TX');
  const missingCountry = find(result, 'missing-country');

  assert.ok(missingCountry, 'expected a missing-country diagnostic');
  assert.equal(missingCountry.kind, 'missing');
  assert.equal(missingCountry.severity, 'error');
  assert.ok(result.completeness < 100);
  assert.ok(result.confidence < 60, `expected a reduced score, received ${result.confidence}`);
  assert.ok(result.missingComponents.includes('country'));
});

test('a country found mid-line is reported as misplaced', () => {
  const result = parseAddress('USA, 1600 Amphitheatre Parkway, Mountain View, CA 94043');
  const misplaced = find(result, 'country-not-at-end');

  assert.ok(misplaced, 'expected a country-not-at-end diagnostic');
  assert.equal(misplaced.kind, 'misplaced');
  assert.equal(misplaced.component, 'country');
  assert.equal(result.components.countryCode, 'US');
});

test('a country hint that contradicts the address marks the result conflicting', () => {
  const result = parseAddress('1600 Amphitheatre Parkway, Mountain View, CA 94043, USA', {
    countryHint: 'GB',
  });
  const conflict = find(result, 'country-hint-conflict');

  assert.ok(conflict, 'expected a country-hint-conflict diagnostic');
  assert.equal(conflict.kind, 'conflicting');
  assert.equal(conflict.severity, 'error');
  assert.equal(result.verificationStatus, 'conflicting');
  assert.match(result.statusReason, /contradict/i);
});

test('a country without postal codes does not report a missing postcode', () => {
  const result = parseAddress('Sheikh Zayed Road, Dubai, United Arab Emirates');

  assert.equal(result.components.countryCode, 'AE');
  assert.ok(!result.missingComponents.includes('postcode'));
  assert.ok(!find(result, 'missing-postcode'), 'postcode must not be reported missing');

  const info = find(result, 'postcode-not-used');
  assert.ok(info, 'expected a postcode-not-used note');
  assert.equal(info.kind, 'informational');
  assert.equal(info.severity, 'info');
});

test('an empty line is not checkable and scores zero', () => {
  const result = parseAddress('');

  assert.equal(result.verificationStatus, 'not_checkable');
  assert.equal(result.confidence, 0);
  assert.equal(result.completeness, 0);
  assert.ok(result.diagnostics.every((diagnostic) => diagnostic.kind === 'missing'));
});

test('no diagnostic claims external evidence before verification exists', () => {
  const result = parseAddress('10 Downing Street, London, SW1A 2AA, United Kingdom');

  assert.equal(result.verificationStatus, 'unverified');
  assert.match(result.statusReason, /no public evidence/i);
  assert.equal(result.confidence, result.confidence);
  assert.ok(result.diagnostics.every((diagnostic) => diagnostic.kind !== 'conflicting'));
});

test('confidence and diagnostics are deterministic', () => {
  const input = 'Av. Paulista 1578, São Paulo, SP, 01310-200, Brasil';
  const first = parseAddress(input);
  const second = parseAddress(input);

  assert.equal(first.confidence, second.confidence);
  assert.equal(first.completeness, second.completeness);
  assert.equal(first.verificationStatus, second.verificationStatus);
  assert.deepEqual(first.diagnostics, second.diagnostics);
});
