/**
 * Excel (.xlsx) adapter.
 *
 * Only tabular text matters for address processing, so the workbook is reduced
 * to a matrix of strings immediately. Cell values are stringified exactly as
 * they were read; nothing is reformatted, reordered or guessed.
 */
import readXlsxFile from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';

export function cellToText(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (typeof cell === 'number') return String(cell);
  if (typeof cell === 'boolean') return cell ? 'true' : 'false';
  return String(cell);
}

/** Reads the first worksheet of a workbook into string rows, in file order. */
export async function readXlsx(buffer: Buffer): Promise<string[][]> {
  const rows = (await readXlsxFile(buffer)) as unknown[][];
  return rows.map((row) => row.map(cellToText));
}

type ExcelCell = { value: string; type: typeof String } | null;

/** Writes rows to an .xlsx workbook, keeping every value as text. */
export async function writeXlsx(rows: string[][]): Promise<Buffer> {
  const data: ExcelCell[][] = rows.map((row) =>
    row.map((value) => (value === '' ? null : { value, type: String })),
  );
  const buffer = await writeXlsxFile(data, { buffer: true });
  return buffer as Buffer;
}
