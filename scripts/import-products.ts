/**
 * Import du référentiel produits depuis l'export CSV du Google Sheet.
 *
 *   pnpm import:produits --file data/produits.csv [--dry-run]
 *
 * Colonnes attendues (insensible à la casse, séparateur `;` ou `,`) :
 *
 *   Produit ; VENTE POUR ; DLC ; Famille ; Catégorie ; Unité
 *
 * Seules « Produit » et « VENTE POUR » sont obligatoires.
 *
 * ⚠️ Le Sheet exprime « VENTE POUR » pour 2 000 € en mise en place et pour
 * 1 000 € pour les plus. L'application, elle, ne connaît qu'une échelle : la
 * quantité PAR TRANCHE DE 1 000 €. Les valeurs de la mise en place sont donc
 * divisées par deux à l'import, sans quoi toutes les cibles doubleraient.
 *
 * ⚠️ La colonne « conso/1000 » du Sheet est IGNORÉE volontairement : elle
 * vaut la base divisée par deux et fausserait le calcul du minimum. Le script
 * le signale si elle est présente dans le fichier.
 *
 * Le script est RÉ-EXÉCUTABLE : il fait un upsert par nom de produit.
 */

import { readFileSync } from 'node:fs';
import { parseCsv, parseFrenchNumber, type CsvRow } from './lib/csv';
import { createImportClient, isDryRun, normalizeName, readArg } from './lib/client';

const NAME_HEADERS = ['produit', 'product', 'nom', 'name', 'article'];
const BASE_HEADERS = ['vente pour', 'vente_pour', 'base', 'base_qty', 'ventepour'];
const DLC_HEADERS = ['dlc', 'shelf_life', 'conservation'];
const FAMILY_HEADERS = ['famille', 'family'];
const CATEGORY_HEADERS = ['categorie', 'catégorie', 'category'];
const UNIT_HEADERS = ['unite', 'unité', 'unit'];

/** La colonne à ne surtout pas importer. */
const FORBIDDEN_HEADERS = ['conso/1000', 'conso 1000', 'conso_1000', 'conso/1000€'];

function findHeader(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((header) => [header, header.toLowerCase().trim()] as const);
  return (
    normalized.find(([, lower]) => candidates.includes(lower))?.[0] ??
    normalized.find(([, lower]) => candidates.some((candidate) => lower.includes(candidate)))?.[0] ??
    null
  );
}

function parseFamily(raw: string | undefined): 'mise_en_place' | 'les_plus' {
  const text = (raw ?? '').toLowerCase();
  return text.includes('plus') || text.includes('dessert') ? 'les_plus' : 'mise_en_place';
}

function parseUnit(raw: string | undefined, family: string): 'gastro' | 'piece' {
  const text = (raw ?? '').toLowerCase();
  if (text.includes('piece') || text.includes('pièce') || text.includes('pce')) return 'piece';
  if (text.includes('gastro')) return 'gastro';
  // À défaut, l'unité découle de la famille : la mise en place se compte au
  // gastro, les plus et les desserts à la pièce.
  return family === 'les_plus' ? 'piece' : 'gastro';
}

async function main(): Promise<void> {
  const file = readArg('--file', 'data/produits.csv')!;
  const dryRun = isDryRun();

  console.log(`Lecture de ${file}`);
  const { headers, rows } = parseCsv(readFileSync(file, 'utf8'));

  if (rows.length === 0) {
    console.error('Fichier vide ou illisible.');
    process.exit(1);
  }

  const forbidden = headers.filter((header) =>
    FORBIDDEN_HEADERS.some((candidate) => header.toLowerCase().replace(/\s/g, '').includes(candidate.replace(/\s/g, ''))),
  );
  if (forbidden.length > 0) {
    console.warn(
      `\n⚠️  Colonne(s) ignorée(s) volontairement : ${forbidden.join(', ')}\n` +
        "   « conso/1000 » vaut la base divisée par deux et fausserait le minimum.\n",
    );
  }

  const nameHeader = findHeader(headers, NAME_HEADERS);
  const baseHeader = findHeader(headers, BASE_HEADERS);

  if (!nameHeader || !baseHeader) {
    console.error(
      `Colonnes « Produit » et « VENTE POUR » introuvables.\n` +
        `En-têtes lus : ${headers.join(' | ')}`,
    );
    process.exit(1);
  }

  const dlcHeader = findHeader(headers, DLC_HEADERS);
  const familyHeader = findHeader(headers, FAMILY_HEADERS);
  const categoryHeader = findHeader(headers, CATEGORY_HEADERS);
  const unitHeader = findHeader(headers, UNIT_HEADERS);

  const supabase = createImportClient();
  const [{ data: existing }, { data: categories }] = await Promise.all([
    supabase.from('products').select('id, name'),
    supabase.from('product_categories').select('id, name'),
  ]);

  const productByName = new Map((existing ?? []).map((p) => [normalizeName(p.name), p]));
  const categoryByName = new Map((categories ?? []).map((c) => [normalizeName(c.name), c]));
  const fallbackCategory = (categories ?? [])[0];

  let created = 0;
  let updated = 0;
  const problems: string[] = [];

  for (const [index, row] of (rows as CsvRow[]).entries()) {
    const line = index + 2;
    const name = row[nameHeader]?.trim();
    if (!name) continue;

    const baseQty = parseFrenchNumber(row[baseHeader]);
    if (baseQty === null || baseQty < 0) {
      problems.push(`ligne ${line} — ${name} : « VENTE POUR » illisible (« ${row[baseHeader]} »)`);
      continue;
    }

    const family = parseFamily(familyHeader ? row[familyHeader] : undefined);
    const unit = parseUnit(unitHeader ? row[unitHeader] : undefined, family);
    // Mise à l'échelle « par tranche de 1 000 € » (voir l'en-tête du fichier).
    const basePour1000 =
      family === 'mise_en_place' ? Math.round((baseQty / 2) * 1000) / 1000 : baseQty;
    const categoryName = categoryHeader ? row[categoryHeader] : undefined;
    const category = categoryName
      ? categoryByName.get(normalizeName(categoryName))
      : undefined;

    const payload = {
      name,
      base_qty: basePour1000,
      family,
      unit,
      shelf_life_label: dlcHeader ? (row[dlcHeader]?.trim() || null) : null,
      category_id: category?.id ?? fallbackCategory?.id,
    };

    if (!payload.category_id) {
      problems.push(`ligne ${line} — ${name} : aucune catégorie disponible en base`);
      continue;
    }

    const found = productByName.get(normalizeName(name));

    if (dryRun) {
      if (found) updated += 1;
      else created += 1;
      continue;
    }

    const { error } = found
      ? await supabase.from('products').update(payload).eq('id', found.id)
      : await supabase.from('products').insert(payload);

    if (error) {
      problems.push(`ligne ${line} — ${name} : ${error.message}`);
      continue;
    }

    if (found) updated += 1;
    else created += 1;
  }

  if (problems.length > 0) {
    console.warn(`\n⚠️  ${problems.length} anomalie(s) :`);
    for (const problem of problems.slice(0, 25)) console.warn(`   - ${problem}`);
    if (problems.length > 25) console.warn(`   … et ${problems.length - 25} autres.`);
  }

  console.log(
    `\n${dryRun ? '--dry-run : ' : ''}${created} produit(s) à créer, ${updated} à mettre à jour.`,
  );

  if (dryRun) {
    console.log('Rien n’a été écrit.');
    return;
  }

  console.log('\n✅ Référentiel produits importé.');
  console.log('   Priorités, planchers et plafonds restent à saisir dans le back-office.');
}

main().catch((error: unknown) => {
  console.error(`\n❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
