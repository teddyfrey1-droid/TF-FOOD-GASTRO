/**
 * Génération de CSV lisibles par Excel en français.
 *
 * Excel FR attend le point-virgule comme séparateur et la virgule comme
 * séparateur décimal ; le BOM lui évite de massacrer les accents.
 */

const BOM = '﻿';

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value).replace('.', ',');
  }

  const text = String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly unknown[][]): string {
  const lines = [headers.join(';'), ...rows.map((row) => row.map(escapeCell).join(';'))];
  return BOM + lines.join('\r\n') + '\r\n';
}

/** Réponse HTTP prête à télécharger. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
