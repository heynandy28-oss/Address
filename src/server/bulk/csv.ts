/**
 * RFC 4180 style delimited-text reader and writer.
 *
 * Hand-written on purpose: bulk upload must work on the Free plan without a
 * parsing dependency, and the rules are small enough to state exactly.
 *  - Quoted fields may contain delimiters, quotes ("") and line breaks.
 *  - Values are preserved verbatim; nothing is trimmed or re-cased here.
 *  - Row order is the file order, always.
 */

const DELIMITERS = [',', ';', '\t', '|'] as const;
export type Delimiter = (typeof DELIMITERS)[number];

export interface ParsedTable {
  headers: string[];
  /** Data rows only, in file order. */
  rows: string[][];
  /** 1-based row number in the file, header included (header is row 1). */
  sourceRowNumbers: number[];
  /** Rows that contained nothing but empty cells and were therefore not kept. */
  skippedEmptyRows: number;
  delimiter: Delimiter;
}

function isDelimiter(char: string): char is Delimiter {
  return (DELIMITERS as readonly string[]).includes(char);
}

/** Picks the delimiter used by the header line, ignoring quoted sections. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          i += 1;
        } else {
          inQuotes = false;
        }
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === '\n') break;
    if (char === '\r') continue;
    if (isDelimiter(char)) counts[char] += 1;
  }

  let best: Delimiter = ',';
  for (const candidate of DELIMITERS) {
    if (counts[candidate] > counts[best]) best = candidate;
  }
  return best;
}

function splitRecords(text: string, delimiter: Delimiter): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = (): void => {
    record.push(field);
    field = '';
  };
  const endRecord = (): void => {
    endField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      endField();
      continue;
    }
    if (char === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRecord();
      continue;
    }
    if (char === '\n') {
      endRecord();
      continue;
    }
    field += char;
  }

  if (field.length > 0 || record.length > 0) endRecord();

  return records;
}

/**
 * True when the text ends inside an open quoted field, which means the file
 * was truncated or mis-quoted and cannot be read reliably.
 */
export function hasUnbalancedQuotes(text: string): boolean {
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '"') continue;
    if (inQuotes && text[i + 1] === '"') {
      i += 1;
      continue;
    }
    inQuotes = !inQuotes;
  }

  return inQuotes;
}

function isEmptyRecord(record: string[]): boolean {
  return record.every((value) => value.trim() === '');
}

/** Parses CSV/TSV/semicolon text into headers plus data rows. */
export function parseDelimited(input: string): ParsedTable {
  const text = input.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const records = splitRecords(text, delimiter);

  // A trailing newline produces one final empty record; drop it so the row
  // count reflects the data the user actually supplied.
  while (records.length > 0 && isEmptyRecord(records[records.length - 1])) {
    records.pop();
  }

  if (records.length === 0) {
    return { headers: [], rows: [], sourceRowNumbers: [], skippedEmptyRows: 0, delimiter };
  }

  const headers = records[0].map((header) => header.trim());
  const rows: string[][] = [];
  const sourceRowNumbers: number[] = [];
  let skippedEmptyRows = 0;

  for (let index = 1; index < records.length; index += 1) {
    const record = records[index];
    if (isEmptyRecord(record)) {
      skippedEmptyRows += 1;
      continue;
    }
    rows.push(record);
    sourceRowNumbers.push(index + 1);
  }

  return { headers, rows, sourceRowNumbers, skippedEmptyRows, delimiter };
}

function escapeValue(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serializes rows to RFC 4180 CSV with CRLF line endings. */
export function toCsv(rows: string[][]): string {
  return `${rows.map((row) => row.map(escapeValue).join(',')).join('\r\n')}\r\n`;
}
