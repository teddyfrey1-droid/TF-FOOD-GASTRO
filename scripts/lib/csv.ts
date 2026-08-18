/**
 * Lecteur CSV minimal, sans dépendance.
 *
 * Gère le séparateur `;` (Excel français) comme `,`, les guillemets, les
 * guillemets doublés, les retours à la ligne dans les champs, et le BOM UTF-8
 * qu'Excel ajoute systématiquement.
 */

export type CsvRow = Record<string, string>;

/** Devine le séparateur d'après la première ligne. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [';', ',', '\t'].map(
    (candidate) => [candidate, firstLine.split(candidate).length - 1] as const,
  );
  const best = counts.sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ';';
}

function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

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
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((cell) => cell.trim() !== ''));
}

export function parseCsv(raw: string): { headers: string[]; rows: CsvRow[] } {
  const text = raw.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const matrix = parseRows(text, delimiter);

  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = matrix[0].map((header) => header.trim());
  const rows = matrix.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()])),
  );

  return { headers, rows };
}

/** « 1 234,50 » ou « 1234.50 » -> 1234.5. Chaîne vide -> null. */
export function parseFrenchNumber(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const text = raw
    .replace(/\s/g, '')
    .replace(/ /g, '')
    .replace(/€/g, '')
    .replace(',', '.')
    .trim();
  if (text === '') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Accepte 2025-01-31, 31/01/2025 et 31-01-2025. */
export function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const text = raw.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return text;

  const french = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (french) {
    const [, day, month, year] = french;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

/** « 1 », « oui », « true », « x » -> true. */
export function parseBoolean(raw: string | undefined | null): boolean {
  if (!raw) return false;
  return ['1', 'oui', 'o', 'true', 'vrai', 'x', 'yes', 'y'].includes(raw.trim().toLowerCase());
}
