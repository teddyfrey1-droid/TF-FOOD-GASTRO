import { getCalculatorRules, getProducts, getRevenueSettings } from '@/lib/admin/queries';
import { todayInParis } from '@/lib/format';
import { CalculatorWorkbench } from '@/components/admin/calculator-workbench';
import { toNullableNumber } from '@/lib/admin/mappers';

export const dynamic = 'force-dynamic';

export interface BracketColumn {
  caMin: number | null;
  caMax: number | null;
  label: string;
}

function bracketKey(caMin: number | null, caMax: number | null): string {
  return `${caMin ?? '-'}|${caMax ?? '-'}`;
}

function bracketLabel(caMin: number | null, caMax: number | null): string {
  const format = (value: number) => value.toLocaleString('fr-FR');
  if (caMin === null && caMax === null) return 'Tous CA';
  if (caMin === null) return `< ${format(caMax!)} €`;
  if (caMax === null) return `≥ ${format(caMin)} €`;
  return `${format(caMin)} – ${format(caMax)} €`;
}

export default async function CalculatorPage() {
  const today = todayInParis();
  const [products, rules, settings] = await Promise.all([
    getProducts(false),
    getCalculatorRules(),
    getRevenueSettings(),
  ]);

  // Seules les règles en vigueur aujourd'hui alimentent le tableau : les
  // versions expirées restent en base pour l'historique, sans polluer l'écran.
  const current = rules.filter(
    (rule) => rule.valid_from <= today && (rule.valid_to === null || rule.valid_to >= today),
  );

  const columnsMap = new Map<string, BracketColumn>();
  for (const rule of current) {
    if (rule.mode !== 'bracket') continue;
    const caMin = toNullableNumber(rule.ca_min);
    const caMax = toNullableNumber(rule.ca_max);
    columnsMap.set(bracketKey(caMin, caMax), {
      caMin,
      caMax,
      label: bracketLabel(caMin, caMax),
    });
  }

  const columns = [...columnsMap.values()].sort(
    (a, b) => (a.caMin ?? -Infinity) - (b.caMin ?? -Infinity),
  );

  const cells: Record<string, number | null> = {};
  const ratios: Record<string, number | null> = {};
  for (const rule of current) {
    if (rule.mode === 'ratio') {
      ratios[rule.product_id] = toNullableNumber(rule.qty_per_1000_eur);
    } else {
      const key = `${rule.product_id}::${bracketKey(
        toNullableNumber(rule.ca_min),
        toNullableNumber(rule.ca_max),
      )}`;
      cells[key] = toNullableNumber(rule.target_qty);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Calculateur</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Combien de gastros faut-il selon le chiffre d&apos;affaires. Toute modification est
          horodatée et versionnée : changer un palier aujourd&apos;hui ne réécrit pas les comptages
          d&apos;hier.
        </p>
      </header>

      <CalculatorWorkbench
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          categoryName: product.category?.name ?? '—',
          gnFormat: product.gn_format,
        }))}
        columns={columns}
        cells={cells}
        ratios={ratios}
        settings={settings}
      />
    </div>
  );
}
