#!/usr/bin/env node
/**
 * Address Line 1 guard.
 *
 * The product rule is absolute: an address has exactly one address-line field.
 * A second address line must never exist in the database, the API, the
 * interface or the exports. This script scans the repository for any attempt to
 * introduce one and fails the build when it finds one.
 *
 * Two classes of match exist:
 *  - identifiers (camelCase, snake_case, bare `line2`, `address2`, `addr2`)
 *    are never allowed, under any circumstance;
 *  - prose (a human sentence naming the second line) is allowed only on a line
 *    that carries an explicit `line2-guard:ignore` marker, so documentation and
 *    UI copy can explain the rule without tripping the guard. Every ignored
 *    line is printed so the allowance stays auditable.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');

const SCANNED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sql',
  '.json',
  '.html',
  '.css',
]);

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'data',
  'coverage',
  '.vite',
  '.cache',
  '.next',
]);

const SKIPPED_FILES = new Set(['package-lock.json', path.basename(SCRIPT_PATH)]);

const IGNORE_MARKER = 'line2-guard:ignore';

const IDENTIFIER_PATTERNS = [
  { label: 'camelCase address line identifier', re: /\baddressLine2\b/i },
  { label: 'snake_case address line identifier', re: /\baddress_line_?2\b/i },
  { label: 'address2 identifier', re: /\baddress_?2\b/i },
  { label: 'addr2 identifier', re: /\baddr_?2\b/i },
  { label: 'bare line2 identifier', re: /\bline_?2\b/i },
  { label: 'lineTwo identifier', re: /\blineTwo\b/ },
];

const PROSE_PATTERNS = [
  { label: 'prose mention of the second address line', re: /\baddress\s+line\s+(?:2|two)\b/i },
  { label: 'prose mention of a second address line', re: /\bsecond\s+address\s+line\b/i },
];

function walk(directory, root, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      walk(path.join(directory, entry.name), root, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIPPED_FILES.has(entry.name)) continue;
    if (!SCANNED_EXTENSIONS.has(path.extname(entry.name))) continue;

    const fullPath = path.join(directory, entry.name);
    if (statSync(fullPath).size > 2_000_000) continue;
    files.push(fullPath);
  }
  return files;
}

function scanContent(relativePath, content) {
  const violations = [];
  const ignored = [];

  content.split(/\r?\n/).forEach((line, index) => {
    const hasMarker = line.includes(IGNORE_MARKER);
    // The marker token itself contains a forbidden fragment, so it is removed
    // before identifier matching. Everything else on the line stays enforced.
    const inspected = hasMarker ? line.split(IGNORE_MARKER).join('') : line;

    const identifier = IDENTIFIER_PATTERNS.find((pattern) => pattern.re.test(inspected));
    if (identifier) {
      violations.push({
        file: relativePath,
        line: index + 1,
        rule: identifier.label,
        severity: 'error',
        excerpt: line.trim().slice(0, 200),
      });
      return;
    }

    const prose = PROSE_PATTERNS.find((pattern) => pattern.re.test(inspected));
    if (!prose) return;

    if (hasMarker) {
      ignored.push({ file: relativePath, line: index + 1, rule: prose.label });
      return;
    }

    violations.push({
      file: relativePath,
      line: index + 1,
      rule: prose.label,
      severity: 'error',
      excerpt: line.trim().slice(0, 200),
    });
  });

  return { violations, ignored };
}

/**
 * Scans the repository (optionally adding in-memory sources used by tests).
 */
export function scanRepository(options = {}) {
  const root = options.root ?? DEFAULT_ROOT;
  const files = walk(root, root);

  const violations = [];
  const ignored = [];

  for (const file of files) {
    const relativePath = path.relative(root, file).split(path.sep).join('/');
    const result = scanContent(relativePath, readFileSync(file, 'utf8'));
    violations.push(...result.violations);
    ignored.push(...result.ignored);
  }

  for (const extra of options.extraSources ?? []) {
    const result = scanContent(extra.path, extra.content);
    violations.push(...result.violations);
    ignored.push(...result.ignored);
  }

  return { root, scannedFiles: files.length, violations, ignored };
}

function main() {
  const result = scanRepository();

  if (result.violations.length > 0) {
    console.error('Address Line 1 guard FAILED.');
    console.error('A second address-line field is not allowed anywhere in this repository.\n');
    for (const violation of result.violations) {
      console.error(`  ${violation.file}:${violation.line}  [${violation.rule}]`);
      console.error(`    ${violation.excerpt}`);
    }
    console.error(`\n${result.violations.length} violation(s) found.`);
    process.exit(1);
  }

  console.log('Address Line 1 guard passed.');
  console.log(`  scanned files: ${result.scannedFiles}`);
  console.log('  address-line fields allowed: addressLine1');
  console.log(`  documented exceptions: ${result.ignored.length}`);
  for (const entry of result.ignored) {
    console.log(`    ${entry.file}:${entry.line}  [${entry.rule}]`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
