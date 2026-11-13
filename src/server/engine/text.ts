/**
 * Text normalisation helpers shared by the parsing engine.
 *
 * Everything here is pure and deterministic: the same input always produces
 * the same output, with no network access and no external model.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const DASH_VARIANTS = /[\u2010-\u2015\u2212]/g;
const MULTI_SPACE = /\s+/g;

/** Removes diacritics: "São Paulo" -> "Sao Paulo", "Zürich" -> "Zurich". */
export function unaccent(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC');
}

export function collapseWhitespace(value: string): string {
  return value.replace(MULTI_SPACE, ' ').trim();
}

/**
 * Canonical display form of a free-form address line.
 *
 * Diacritics are preserved ("São Paulo" stays readable) because matching uses
 * `normalizeKey`, which removes them. Newlines are folded into commas so that
 * a multi-line address collapses into the single address line the model allows.
 */
export function normalizeLine(value: string): string {
  if (typeof value !== 'string') return '';
  const canonical = value
    .normalize('NFC')
    .replace(DASH_VARIANTS, '-')
    .replace(/\r?\n+/g, ', ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  return collapseWhitespace(canonical).replace(/^[,;.\s]+/, '').replace(/[,;.\s]+$/, '');
}

/** Comparison key: accent-free, lowercase, alphanumeric words only. */
export function normalizeKey(value: string): string {
  return unaccent(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:\s]+$/, '').trim();
}

export function hasDigit(value: string): boolean {
  return /\d/.test(value);
}

/** True when the text contains letters and no digits (a place name, not a street number). */
export function isPlaceLike(value: string): boolean {
  return /[a-z]/i.test(value) && !/\d/.test(value);
}

/** Splits an address line into ordered segments on commas, semicolons and newlines. */
export function splitSegments(value: string): string[] {
  return value
    .split(/\r?\n|[,;]+/)
    .map((segment) => stripTrailingPunctuation(collapseWhitespace(segment)))
    .filter((segment) => segment.length > 0);
}

/** Uppercase form used only for pattern matching, never for stored values. */
export function matchForm(value: string): string {
  return value.toUpperCase();
}
