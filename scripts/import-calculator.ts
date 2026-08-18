/**
 * Import du calculateur depuis l'export CSV du Google Sheet.
 *
 *   pnpm import:calculateur --file data/calculateur.csv [--dry-run] [--date 2026-09-01]
 *
 * Format attendu (séparateur `;` ou `,`) :
 *
 *   Produit ; Format GN ; CA 0-1500 ; CA 1500-2500 ; CA 2500-4000 ; ...
 *   Saumon  ; GN 1/3 - 65mm ; 3 ; 5 ; 8 ; ...
 *
 * Les en-têtes de colonne de CA sont reconnus sous les formes :
 *   « CA 0-1500 », « 0-1500 », « 1500 - 2500 € », « 5500+ », « > 5500 ».
 *
 * Le script est RÉ-EXÉCUTABLE : il clôt les règles en vigueur à la veille de
 * `--date` et en ouvre de nouvelles. Relancer deux fois le même fichier le même
 * jour ne duplique rien — la journée est simplement réécrite.
 */

import { readFileSync } from 'node:fs';
import { parseCsv, parseFrenchNumber, type CsvRow } from './lib/csv';
import { checkBracketCoverage, parseBracketHeader, type Bracket } from './lib/brackets';
import { createImportClient, isDryRun, normalizeName, readArg } from './lib/client';

const NAME_HEADERS = ['produit', 'product', 'nom', 'name', 'ingredient', 'ingrédient'];
const GN_HEADERS = ['format gn', 'gn', 'format', 'bac'];

function findHeader(headers: string[], candidates: string[]): string | null {
  return (
    headers.find((header) => candidates.includes(header.toLowerCase().trim())) ??
    headers.find((header) =>
      candidates.some((candidate) => header.toLowerCase().includes(candidate)),
    ) ??
    null
  );
}

function previousDay(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const file = readArg('--file', 'data/calculateur.csv')!;
  const validFrom = readArg('--date', new Date().toISOString().slice(0, 10))!;
  const dryRun = isDryRun();

  console.log(`Lecture de ${file}`);
  const { headers, rows } = parseCsv(readFileSync(file, 'utf8'));

  if (rows.length === 0) {
    console.error('Fichier vide ou illisible.');
    process.exit(1);
  }

  const nameHeader = findHeader(headers, NAME_HEADERS);
  if (!nameHeader) {
    console.error(
      `Aucune colonne de nom de produit trouvée. En-têtes lus : ${headers.join(' | ')}`,
    );
    process.exit(1);
  }
  const gnHeader = findHeader(headers, GN_HEADERS);

  const brackets = headers
    .map(parseBracketHeader)
    .filter((bracket): bracket is Bracket => bracket !== null)
    .sort((a, b) => (a.caMin ?? -Infinity) - (b.caMin ?? -Infinity));

  if (brackets.length === 0) {
    console.error(
      `Aucune colonne de tranche de CA reconnue. En-têtes lus : ${headers.join(' | ')}\n` +
        'Formats acceptés : « CA 0-1500 », « 1500-2500 », « 5500+ », « < 1000 ».',
    );
    process.exit(1);
  }

  console.log(
    `${rows.length} produits, ${brackets.length} tranches :`,
    brackets.map((b) => `${b.caMin ?? '−∞'}–${b.caMax ?? '+∞'}`).join(', '),
  );

  const coverage = checkBracketCoverage(brackets);
  if (coverage.length > 0) {
    console.warn('\n⚠️  Couverture des tranches de CA :');
    for (const problem of coverage) console.warn(`   - ${problem}`);
    console.warn('');
  }

  const supabase = createImportClient();
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name');

  if (productsError) throw new Error(`Lecture des produits impossible : ${productsError.message}`);

  const productByName = new Map((products ?? []).map((p) => [normalizeName(p.name), p]));

  const unknown: string[] = [];
  const toInsert: Array<{
    product_id: string;
    mode: 'bracket';
    ca_min: number | null;
    ca_max: number | null;
    target_qty: number;
    valid_from: string;
  }> = [];
  const touchedProducts = new Set<string>();
  const oddValues: string[] = [];

  for (const row of rows as CsvRow[]) {
    const rawName = row[nameHeader];
    if (!rawName) continue;

    const product = productByName.get(normalizeName(rawName));
    if (!product) {
      unknown.push(rawName);
      continue;
    }
    touchedProducts.add(product.id);

    for (const bracket of brackets) {
      const target = parseFrenchNumber(row[bracket.header]);
      if (target === null) continue;

      if (target < 0) {
        oddValues.push(`${rawName} / ${bracket.header} : valeur négative (${target})`);
        continue;
      }
      if (Math.abs(target * 2 - Math.round(target * 2)) > 1e-6) {
        oddValues.push(
          `${rawName} / ${bracket.header} : ${target} n'est pas un multiple de 0,5`,
        );
      }

      toInsert.push({
        product_id: product.id,
        mode: 'bracket',
        ca_min: bracket.caMin,
        ca_max: bracket.caMax,
        target_qty: target,
        valid_from: validFrom,
      });
    }

    if (gnHeader && row[gnHeader] && !dryRun) {
      await supabase.from('products').update({ gn_format: row[gnHeader] }).eq('id', product.id);
    }
  }

  if (unknown.length > 0) {
    console.warn(
      `\n⚠️  ${unknown.length} produit(s) du CSV sont introuvables en base et ont été ignorés :`,
    );
    for (const name of unknown) console.warn(`   - ${name}`);
    console.warn('   Créez-les d’abord dans le back-office, ou corrigez leur orthographe.\n');
  }

  if (oddValues.length > 0) {
    console.warn(`⚠️  ${oddValues.length} valeur(s) inhabituelle(s) :`);
    for (const message of oddValues.slice(0, 20)) console.warn(`   - ${message}`);
    if (oddValues.length > 20) console.warn(`   … et ${oddValues.length - 20} autres.`);
    console.warn('');
  }

  console.log(`${toInsert.length} règles à écrire, sur ${touchedProducts.size} produits.`);

  if (dryRun) {
    console.log('\n--dry-run : rien n’a été écrit.');
    return;
  }

  // Ré-exécutable : on clôt les versions en vigueur plutôt que de les écraser.
  // Les règles ouvertes le même jour sont supprimées, pour qu'un second passage
  // ne laisse pas deux versions valides à la même date.
  for (const productId of touchedProducts) {
    await supabase
      .from('calculator_rules')
      .delete()
      .eq('product_id', productId)
      .eq('valid_from', validFrom);

    await supabase
      .from('calculator_rules')
      .update({ valid_to: previousDay(validFrom) })
      .eq('product_id', productId)
      .lt('valid_from', validFrom)
      .is('valid_to', null);
  }

  const CHUNK = 200;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const { error } = await supabase.from('calculator_rules').insert(toInsert.slice(i, i + CHUNK));
    if (error) throw new Error(`Insertion impossible : ${error.message}`);
  }

  console.log(`\n✅ Calculateur importé, en vigueur à partir du ${validFrom}.`);
  console.log('   Les règles antérieures restent en base : l’historique reste lisible.');
}

main().catch((error: unknown) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
