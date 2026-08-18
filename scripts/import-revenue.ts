/**
 * Import du chiffre d'affaires de l'an dernier.
 *
 *   pnpm import:ca --file data/ca-n-1.csv [--dry-run] [--actuals]
 *
 * Format attendu (séparateur `;` ou `,`) :
 *
 *   date;ca_ht;ferme
 *   2025-01-02;2840,00;0
 *   03/01/2025;3120,50;0
 *   2025-01-06;0;1
 *
 * Colonnes reconnues (insensible à la casse) :
 *   date            : date, jour, day
 *   ca_ht           : ca_ht, ca, chiffre d'affaires, revenue, montant
 *   ferme           : ferme, fermé, closed, is_closed_day, fermeture
 *   ca_midi         : ca_midi, midi, lunch (facultatif, seulement avec --actuals)
 *
 * `--actuals` charge dans `revenue_actuals` (le CA réel de cette année) au lieu
 * de `revenue_history` (la base de la prévision).
 *
 * Le script est RÉ-EXÉCUTABLE : il fait un upsert par date, sans doublon.
 */

import { readFileSync } from 'node:fs';
import { parseBoolean, parseCsv, parseDate, parseFrenchNumber, type CsvRow } from './lib/csv';
import { createImportClient, isDryRun, readArg } from './lib/client';

const DATE_HEADERS = ['date', 'jour', 'day'];
const REVENUE_HEADERS = ['ca_ht', 'ca ht', 'ca', "chiffre d'affaires", 'chiffre affaires', 'revenue', 'montant'];
const CLOSED_HEADERS = ['ferme', 'fermé', 'fermeture', 'closed', 'is_closed_day'];
const LUNCH_HEADERS = ['ca_midi', 'ca midi', 'midi', 'lunch', 'revenue_lunch_ht'];

function findHeader(headers: string[], candidates: string[]): string | null {
  return (
    headers.find((header) => candidates.includes(header.toLowerCase().trim())) ??
    headers.find((header) =>
      candidates.some((candidate) => header.toLowerCase().trim().startsWith(candidate)),
    ) ??
    null
  );
}

async function main(): Promise<void> {
  const file = readArg('--file', 'data/ca-n-1.csv')!;
  const intoActuals = process.argv.includes('--actuals');
  const dryRun = isDryRun();

  console.log(`Lecture de ${file}`);
  const { headers, rows } = parseCsv(readFileSync(file, 'utf8'));

  if (rows.length === 0) {
    console.error('Fichier vide ou illisible.');
    process.exit(1);
  }

  const dateHeader = findHeader(headers, DATE_HEADERS);
  const revenueHeader = findHeader(headers, REVENUE_HEADERS);
  const closedHeader = findHeader(headers, CLOSED_HEADERS);
  const lunchHeader = findHeader(headers, LUNCH_HEADERS);

  if (!dateHeader || !revenueHeader) {
    console.error(
      `Colonnes « date » et « ca_ht » introuvables. En-têtes lus : ${headers.join(' | ')}`,
    );
    process.exit(1);
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  const history: Array<{ date: string; revenue_ht: number; is_closed_day: boolean }> = [];
  const actuals: Array<{ date: string; revenue_ht: number; revenue_lunch_ht: number | null }> = [];

  for (const [index, row] of (rows as CsvRow[]).entries()) {
    const line = index + 2;
    const date = parseDate(row[dateHeader]);
    if (!date) {
      problems.push(`ligne ${line} : date illisible (« ${row[dateHeader]} »)`);
      continue;
    }
    if (seen.has(date)) {
      problems.push(`ligne ${line} : date ${date} en double, dernière valeur retenue`);
    }
    seen.add(date);

    const revenue = parseFrenchNumber(row[revenueHeader]);
    if (revenue === null || revenue < 0) {
      problems.push(`ligne ${line} : CA illisible ou négatif (« ${row[revenueHeader]} »)`);
      continue;
    }

    const closed = closedHeader ? parseBoolean(row[closedHeader]) : false;

    if (intoActuals) {
      const lunch = lunchHeader ? parseFrenchNumber(row[lunchHeader]) : null;
      if (lunch !== null && lunch > revenue) {
        problems.push(`ligne ${line} : CA du midi (${lunch}) supérieur au CA du jour (${revenue})`);
      }
      actuals.push({ date, revenue_ht: revenue, revenue_lunch_ht: lunch });
    } else {
      history.push({ date, revenue_ht: revenue, is_closed_day: closed });
    }
  }

  const records = intoActuals ? actuals : history;
  const table = intoActuals ? 'revenue_actuals' : 'revenue_history';

  if (problems.length > 0) {
    console.warn(`\n⚠️  ${problems.length} anomalie(s) :`);
    for (const problem of problems.slice(0, 25)) console.warn(`   - ${problem}`);
    if (problems.length > 25) console.warn(`   … et ${problems.length - 25} autres.`);
    console.warn('');
  }

  const dates = records.map((record) => record.date).sort();
  console.log(
    `${records.length} journées valides${
      dates.length > 0 ? `, du ${dates[0]} au ${dates[dates.length - 1]}` : ''
    } → table ${table}.`,
  );

  const closedCount = history.filter((record) => record.is_closed_day).length;
  if (!intoActuals) console.log(`   dont ${closedCount} jour(s) de fermeture.`);

  if (dryRun) {
    console.log('\n--dry-run : rien n’a été écrit.');
    return;
  }
  if (records.length === 0) {
    console.error('Rien à importer.');
    process.exit(1);
  }

  const supabase = createImportClient();
  const CHUNK = 500;

  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK);
    const { error } = intoActuals
      ? await supabase
          .from('revenue_actuals')
          .upsert(slice as typeof actuals, { onConflict: 'date' })
      : await supabase
          .from('revenue_history')
          .upsert(slice as typeof history, { onConflict: 'date' });

    if (error) throw new Error(`Insertion impossible : ${error.message}`);
  }

  console.log(`\n✅ ${records.length} journées importées dans ${table}.`);
}

main().catch((error: unknown) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
