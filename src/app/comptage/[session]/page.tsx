import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Clock } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { getCountHours } from '@/lib/admin/queries';
import { ouvertureAVenir, todayInParis } from '@/lib/format';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { openSession } from '@/app/comptage/actions';
import { CountingScreen, type CountProduct } from '@/components/comptage/counting-screen';
import type { CountState } from '@/components/comptage/product-row';
import { SESSION_SLUGS, type SessionSlug } from '../slugs';
import { toNumber } from '@/lib/admin/mappers';

export const dynamic = 'force-dynamic';

export default async function CountPage({ params }: { params: Promise<{ session: string }> }) {
  await requireUser();

  const { session } = await params;
  const config = SESSION_SLUGS[session as SessionSlug];
  if (!config) notFound();

  // L'heure d'ouverture se vérifie AVANT d'ouvrir quoi que ce soit :
  // griser la carte de l'accueil ne suffit pas, l'adresse reste tapable
  // et l'onglet Comptage y mène directement. Un comptage déjà validé
  // reste consultable — c'est son rapport qu'on vient voir.
  const heures = await getCountHours();
  const ouvreA = ouvertureAVenir(
    config.kind === 'morning' ? heures?.morning : heures?.afternoon,
  );

  if (ouvreA) {
    const supabaseVerif = await createClient();
    const { data: dejaValide } = await supabaseVerif
      .from('count_sessions')
      .select('id')
      .eq('date', todayInParis())
      .eq('session', config.kind)
      .eq('status', 'submitted')
      .maybeSingle();

    if (!dejaValide) {
      return (
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
          <div className="bg-card rounded-3xl border p-8 text-center">
            <span
              aria-hidden
              className="bg-muted text-muted-foreground mx-auto flex size-14 items-center justify-center rounded-2xl"
            >
              <Clock className="size-7" strokeWidth={2.4} />
            </span>
            <h1 className="mt-4 text-xl font-black tracking-tight">
              {config.title} — pas encore ouvert
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Il ouvre à <span className="text-foreground font-black">{ouvreA}</span>. Compter
              avant l&apos;heure décrirait des frigos qui n&apos;ont pas encore vécu la journée.
            </p>
            <Link
              href="/"
              className={buttonVariants({
                variant: 'outline',
                className: 'mt-6 h-12 w-full rounded-2xl font-bold',
              })}
            >
              Retour à l&apos;accueil
            </Link>
          </div>
        </main>
      );
    }
  }

  const opened = await openSession(config.kind);
  if (!opened.sessionId) {
    return (
      <main className="mx-auto w-full max-w-md px-5 py-10">
        <p role="alert" className="text-destructive text-sm font-medium">
          {opened.error ?? 'Impossible d’ouvrir le comptage.'}
        </p>
      </main>
    );
  }

  const supabase = await createClient();

  const { data: countSession } = await supabase
    .from('count_sessions')
    .select('id, status, note')
    .eq('id', opened.sessionId)
    .maybeSingle();

  // Un comptage déjà validé n'est pas rejoué : on montre son rapport.
  if (countSession?.status === 'submitted') {
    redirect(`/comptage/${session}/rapport`);
  }

  const [{ data: productRows }, { data: categories }, { data: lines }] = await Promise.all([
    supabase
      .from('products_for_count')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase.from('product_categories').select('id, name, sort_order'),
    supabase
      .from('count_lines')
      // Colonnes explicites : les cibles et seuils figés ne sont plus
      // lisibles par un compte connecté, et `*` échouerait.
      .select(
        'product_id, qty_saladbar, qty_fridge, qty_desserts, is_not_applicable, not_applicable_reason, counted_saladbar_at, counted_fridge_at, counted_desserts_at, deferred_at, deferred_reason',
      )
      .eq('session_id', opened.sessionId),
  ]);

  const categoryById = new Map(
    (categories ?? []).map((category) => [category.id, category] as const),
  );

  const products: CountProduct[] = (productRows ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      categoryName: categoryById.get(row.category_id)?.name ?? 'Autres',
      unit: row.unit,
      countStep: toNumber(row.count_step, 1),
      inSaladbar: row.in_saladbar,
      inFridge: row.in_fridge,
    inDesserts: row.in_desserts,
      notes: row.notes,
      imageUrl: row.image_url,
    }))
    .sort((a, b) => {
      const orderA = categoryById.get(a.categoryId)?.sort_order ?? 0;
      const orderB = categoryById.get(b.categoryId)?.sort_order ?? 0;
      return orderA - orderB || a.name.localeCompare(b.name, 'fr');
    });

  const initial: Record<string, CountState> = {};
  for (const product of products) {
    const line = (lines ?? []).find((candidate) => candidate.product_id === product.id);
    initial[product.id] = {
      qtySaladbar: toNumber(line?.qty_saladbar, 0),
      qtyFridge: toNumber(line?.qty_fridge, 0),
      qtyDesserts: toNumber(line?.qty_desserts, 0),
      isNotApplicable: line?.is_not_applicable ?? false,
      notApplicableReason: line?.not_applicable_reason ?? null,
      countedSaladbar: Boolean(line?.counted_saladbar_at),
      countedFridge: Boolean(line?.counted_fridge_at),
      countedDesserts: Boolean(line?.counted_desserts_at),
      isDeferred: Boolean(line?.deferred_at),
      deferredReason: line?.deferred_reason ?? null,
    };
  }

  return (
    <main className="mx-auto w-full max-w-md">
      <CountingScreen
        sessionId={opened.sessionId}
        title={config.title}
        products={products}
        initial={initial}
        noteInitiale={countSession?.note ?? null}
      reportHref={`/comptage/${session}/rapport`}
      />
    </main>
  );
}
