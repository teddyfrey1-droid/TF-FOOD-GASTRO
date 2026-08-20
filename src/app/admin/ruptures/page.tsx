import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getProducts } from '@/lib/admin/queries';
import { todayInParis } from '@/lib/format';
import { toNullableNumber, toNumber } from '@/lib/admin/mappers';
import { suggestBaseQty } from '@/lib/mep';
import { RupturesTable, type RuptureRow } from '@/components/admin/ruptures-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Ruptures — Heiko' };

const FENETRES = [
  { jours: 14, label: '14 jours' },
  { jours: 30, label: '30 jours' },
  { jours: 90, label: '90 jours' },
];

function ilYA(isoDate: string, jours: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - jours);
  return date.toISOString().slice(0, 10);
}

export default async function RupturesPage({
  searchParams,
}: {
  searchParams: Promise<{ jours?: string }>;
}) {
  await requireManager();

  const { jours: joursParam } = await searchParams;
  const jours = FENETRES.some((f) => String(f.jours) === joursParam) ? Number(joursParam) : 30;

  const today = todayInParis();
  const supabase = await createClient();

  const [{ data }, products] = await Promise.all([
    supabase.rpc('mep_stockout_history', { d_from: ilYA(today, jours), d_to: today }),
    getProducts(false),
  ]);

  const imageById = new Map(products.map((product) => [product.id, product.image_url]));

  const rows: RuptureRow[] = (data ?? []).map((row) => {
    const baseQty = toNumber(row.base_qty, 0);
    const avgCoverage = toNullableNumber(row.avg_coverage);

    return {
      productId: row.product_id,
      productName: row.product_name,
      categoryName: row.category_name,
      imageUrl: imageById.get(row.product_id) ?? null,
      sessions: row.sessions_count,
      critical: row.critical_count,
      empty: row.empty_count,
      baseQty,
      avgCoverage,
      suggestedBase: suggestBaseQty({
        sessions: row.sessions_count,
        critical: row.critical_count,
        avgCoverage,
        baseQty,
      }),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          Ruptures <span className="text-muted-foreground">({rows.length})</span>
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Combien de fois chaque produit est passé sous son seuil critique. C&apos;est la seule
          façon de savoir si une base « VENTE POUR » est juste : trois semaines de mesures valent
          mieux qu&apos;une impression. Les propositions se comparent au réglage actuel — rien
          n&apos;est appliqué sans votre appui.
        </p>
      </header>

      <nav className="flex gap-2">
        {FENETRES.map((fenetre) => (
          <a
            key={fenetre.jours}
            href={`/admin/ruptures?jours=${fenetre.jours}`}
            className={
              fenetre.jours === jours
                ? 'bg-foreground text-background rounded-full px-4 py-2 text-sm font-bold'
                : 'bg-muted text-muted-foreground hover:text-foreground rounded-full px-4 py-2 text-sm font-bold transition-colors'
            }
          >
            {fenetre.label}
          </a>
        ))}
      </nav>

      <RupturesTable rows={rows} jours={jours} />
    </div>
  );
}
