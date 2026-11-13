/**
 * Bulk processing: file in, per-row results out, original rows untouched.
 *
 * Invariants:
 *  - `row_index` is the original 0-based position and is never re-sorted.
 *  - `raw_row_json` keeps every original cell value verbatim.
 *  - Derived values live in their own columns; the original address text is
 *    stored exactly as supplied in `raw_address_text`.
 *  - Only `address_line1` describes the street line.
 */
import { randomUUID } from 'node:crypto';
import { MAX_LINE_LENGTH, parseAddress } from '../engine/parse.js';
import { normalizeKey } from '../engine/text.js';
import type { BulkRowRecord, BulkRunSummary } from '../../shared/types.js';
import type { HistoryStore } from '../history/store.js';
import { parseDelimited, toCsv } from './csv.js';
import { readXlsx, writeXlsx } from './xlsx.js';

export const MAX_BULK_BYTES = 8 * 1024 * 1024;
export const MAX_BULK_ROWS = 5000;
export const PREVIEW_LIMIT = 50;

/** Header names that identify the address column, most specific first. */
const HEADER_CANDIDATES = [
  'addressline1',
  'addressline',
  'fulladdress',
  'streetaddress',
  'address',
  'street',
  'location',
  'line1',
];

export class BulkError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'BulkError';
    this.status = status;
  }
}

interface Table {
  headers: string[];
  rows: string[][];
  sourceRowNumbers: number[];
  skippedEmptyRows: number;
}

function isBlankRow(row: string[]): boolean {
  return row.every((value) => value.trim() === '');
}

function fromCsv(buffer: Buffer): Table {
  const table = parseDelimited(buffer.toString('utf8'));
  return {
    headers: table.headers,
    rows: table.rows,
    sourceRowNumbers: table.sourceRowNumbers,
    skippedEmptyRows: table.skippedEmptyRows,
  };
}

async function fromXlsx(buffer: Buffer): Promise<Table> {
  const rows = await readXlsx(buffer);
  if (rows.length === 0) {
    return { headers: [], rows: [], sourceRowNumbers: [], skippedEmptyRows: 0 };
  }

  const headers = rows[0].map((header) => header.trim());
  const dataRows: string[][] = [];
  const sourceRowNumbers: number[] = [];
  let skippedEmptyRows = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (isBlankRow(row)) {
      skippedEmptyRows += 1;
      continue;
    }
    dataRows.push(row);
    sourceRowNumbers.push(index + 1);
  }

  return { headers, rows: dataRows, sourceRowNumbers, skippedEmptyRows };
}

function detectFormat(filename: string): 'csv' | 'xlsx' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'xlsx';
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) return 'csv';
  throw new BulkError('Upload a .csv, .tsv or .xlsx file.');
}

/** Resolves which column holds the address: explicit override, then detection. */
export function resolveAddressColumn(headers: string[], override: string | null): number {
  if (override) {
    const trimmed = override.trim();
    if (/^\d+$/.test(trimmed)) {
      const index = Number(trimmed) - 1;
      if (index < 0 || index >= headers.length) {
        throw new BulkError(`Column ${trimmed} does not exist in this file.`);
      }
      return index;
    }
    const target = normalizeKey(trimmed);
    const match = headers.findIndex((header) => normalizeKey(header) === target);
    if (match === -1) {
      throw new BulkError(`No column named "${trimmed}" was found in this file.`);
    }
    return match;
  }

  const exact = headers.findIndex((header) => HEADER_CANDIDATES.includes(normalizeKey(header)));
  if (exact !== -1) return exact;

  const loose = headers.findIndex((header) => /address|street/i.test(header));
  return loose === -1 ? 0 : loose;
}

function emptyRowRecord(
  row: string[],
  rowIndex: number,
  sourceRowNumber: number,
): BulkRowRecord {
  return {
    rowIndex,
    sourceRowNumber,
    originalRow: row,
    rawAddressText: '',
    addressLine1: null,
    postcode: null,
    city: null,
    region: null,
    country: null,
    countryCode: null,
    confidence: null,
    verificationStatus: null,
    diagnostics: [],
  };
}

function buildRowRecord(
  row: string[],
  rowIndex: number,
  sourceRowNumber: number,
  columnIndex: number,
  countryHint: string | null,
): BulkRowRecord {
  const base = emptyRowRecord(row, rowIndex, sourceRowNumber);
  const rawAddressText = (row[columnIndex] ?? '').trim();
  base.rawAddressText = rawAddressText;

  if (!rawAddressText) {
    return { ...base, verificationStatus: 'not_checkable' };
  }

  if (rawAddressText.length > MAX_LINE_LENGTH) {
    return {
      ...base,
      verificationStatus: 'not_checkable',
      diagnostics: [
        {
          kind: 'conflicting',
          severity: 'error',
          component: null,
          code: 'address-too-long',
          message: `The address text is longer than ${MAX_LINE_LENGTH} characters, so this row was not parsed.`,
        },
      ],
    };
  }

  const parsed = parseAddress(rawAddressText, { countryHint });

  return {
    ...base,
    addressLine1: parsed.components.addressLine1,
    postcode: parsed.components.postcode,
    city: parsed.components.city,
    region: parsed.components.region,
    country: parsed.components.country,
    countryCode: parsed.components.countryCode,
    confidence: parsed.confidence,
    verificationStatus: parsed.verificationStatus,
    diagnostics: parsed.diagnostics,
  };
}

export interface BulkInput {
  filename: string;
  buffer: Buffer;
  column?: string | null;
  countryHint?: string | null;
}

export interface BulkOutcome {
  run: BulkRunSummary;
  /** Preview rows, in original order. */
  rows: BulkRowRecord[];
  previewLimit: number;
}

function summarize(
  runId: string,
  filename: string,
  format: 'csv' | 'xlsx',
  headers: string[],
  columnIndex: number,
  records: BulkRowRecord[],
  skippedEmptyRows: number,
  createdAt: string,
): BulkRunSummary {
  const scored = records.filter((record) => record.confidence !== null);
  const averageConfidence =
    scored.length === 0
      ? 0
      : Math.round(
          scored.reduce((total, record) => total + (record.confidence ?? 0), 0) / scored.length,
        );

  return {
    runId,
    label: null,
    sourceFilename: filename,
    sourceFormat: format,
    addressColumn: headers[columnIndex] ?? '',
    addressColumnIndex: columnIndex,
    headers,
    rowCount: records.length,
    processedCount: scored.length,
    needsAttention: records.filter(
      (record) =>
        record.verificationStatus === 'conflicting' ||
        record.diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    ).length,
    averageConfidence,
    skippedEmptyRows,
    createdAt,
  };
}

export async function processBulk(store: HistoryStore, input: BulkInput): Promise<BulkOutcome> {
  if (input.buffer.length === 0) {
    throw new BulkError('The uploaded file is empty.');
  }
  if (input.buffer.length > MAX_BULK_BYTES) {
    throw new BulkError(
      `Files must be ${Math.round(MAX_BULK_BYTES / (1024 * 1024))} MB or smaller.`,
      413,
    );
  }

  const format = detectFormat(input.filename);

  let table: Table;
  if (format === 'csv') {
    table = fromCsv(input.buffer);
  } else {
    try {
      table = await fromXlsx(input.buffer);
    } catch {
      throw new BulkError('The workbook could not be read. Save it as .xlsx and try again.');
    }
  }

  if (table.headers.length === 0 || table.headers.every((header) => header === '')) {
    throw new BulkError('No header row was found in the file.');
  }
  if (table.rows.length === 0) {
    throw new BulkError('The file has a header row but no data rows.');
  }
  if (table.rows.length > MAX_BULK_ROWS) {
    throw new BulkError(
      `Process at most ${MAX_BULK_ROWS} rows per file; this file has ${table.rows.length}.`,
      413,
    );
  }

  const columnIndex = resolveAddressColumn(table.headers, input.column ?? null);
  const countryHint = input.countryHint ?? null;
  const createdAt = new Date().toISOString();
  const runId = randomUUID();

  const records = table.rows.map((row, index) =>
    buildRowRecord(row, index, table.sourceRowNumbers[index] ?? index + 2, columnIndex, countryHint),
  );

  const run = summarize(
    runId,
    input.filename,
    format,
    table.headers,
    columnIndex,
    records,
    table.skippedEmptyRows,
    createdAt,
  );

  await store.saveRun(run, records);

  return { run, rows: records.slice(0, PREVIEW_LIMIT), previewLimit: PREVIEW_LIMIT };
}

const DERIVED_HEADERS = [
  'Address Line 1',
  'Postcode',
  'City',
  'Region',
  'Country',
  'Country Code',
  'Confidence',
  'Verification Status',
  'Diagnostics',
  'Source Row Number',
  'Original Row Index',
];

/** Builds the export matrix: original columns first, in original order. */
export function buildExportRows(headers: string[], records: BulkRowRecord[]): string[][] {
  const matrix: string[][] = [[...headers, ...DERIVED_HEADERS]];

  for (const record of records) {
    matrix.push([
      ...headers.map((_, index) => record.originalRow[index] ?? ''),
      record.addressLine1 ?? '',
      record.postcode ?? '',
      record.city ?? '',
      record.region ?? '',
      record.country ?? '',
      record.countryCode ?? '',
      record.confidence === null ? '' : String(record.confidence),
      record.verificationStatus ?? '',
      record.diagnostics.map((diagnostic) => `${diagnostic.kind}: ${diagnostic.message}`).join(' | '),
      String(record.sourceRowNumber),
      String(record.rowIndex),
    ]);
  }

  return matrix;
}

export interface ExportFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

export async function buildExport(
  store: HistoryStore,
  runId: string,
  format: 'csv' | 'xlsx',
): Promise<ExportFile | null> {
  const stored = await store.getRun(runId, Number.MAX_SAFE_INTEGER);
  if (!stored) return null;

  const matrix = buildExportRows(stored.run.headers, stored.rows);
  const safeName = `address-intelligence-${runId.slice(0, 8)}`;

  if (format === 'csv') {
    return {
      filename: `${safeName}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: Buffer.from(toCsv(matrix), 'utf8'),
    };
  }

  return {
    filename: `${safeName}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: await writeXlsx(matrix),
  };
}
