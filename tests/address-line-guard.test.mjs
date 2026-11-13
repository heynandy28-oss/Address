import assert from 'node:assert/strict';
import test from 'node:test';
import { scanRepository } from '../scripts/check-address-line1-only.mjs';

// Built at runtime so this test file never contains a literal forbidden
// identifier itself (the guard scans the whole repository, tests included).
const MARKER = ['line', '2', '-guard:ignore'].join('');

test('repository contains no second address-line field or identifier', () => {
  const result = scanRepository();

  assert.deepEqual(
    result.violations,
    [],
    `Guard violations:\n${JSON.stringify(result.violations, null, 2)}`,
  );
  assert.ok(result.scannedFiles > 0, 'guard should scan repository files');
});

test('guard fails when a line-2 identifier is introduced', () => {
  const plantedIdentifier = ['address', 'Line', '2'].join('');

  const result = scanRepository({
    extraSources: [
      {
        path: 'src/server/__planted__.ts',
        content: `export interface Row {\n  ${plantedIdentifier}: string;\n}\n`,
      },
    ],
  });

  const planted = result.violations.filter((violation) => violation.file === 'src/server/__planted__.ts');
  assert.equal(planted.length, 1);
  assert.equal(planted[0].line, 2);
  assert.equal(planted[0].severity, 'error');
});

test('guard fails on a snake_case line-2 column in SQL', () => {
  const plantedColumn = ['address', 'line', '2'].join('_');

  const result = scanRepository({
    extraSources: [
      {
        path: 'db/__planted__.sql',
        content: `CREATE TABLE planted (\n  ${plantedColumn} TEXT\n);\n`,
      },
    ],
  });

  const planted = result.violations.filter((violation) => violation.file === 'db/__planted__.sql');
  assert.equal(planted.length, 1);
  assert.match(planted[0].rule, /snake_case/);
});

test('guard allows documented prose only with an explicit ignore marker', () => {
  const phrase = ['Address', 'Line', '2'].join(' ');

  const withoutMarker = scanRepository({
    extraSources: [{ path: 'docs/__planted__.md', content: `${phrase} is not supported.` }],
  });
  assert.equal(
    withoutMarker.violations.filter((violation) => violation.file === 'docs/__planted__.md').length,
    1,
  );

  const withMarker = scanRepository({
    extraSources: [
      {
        path: 'src/client/__planted__.tsx',
        content: `{/* ${MARKER} */} ${phrase} is not supported.`,
      },
    ],
  });
  assert.equal(
    withMarker.violations.filter((violation) => violation.file === 'src/client/__planted__.tsx').length,
    0,
  );
  assert.equal(
    withMarker.ignored.filter((violation) => violation.file === 'src/client/__planted__.tsx').length,
    1,
  );
});
