import { notFound, redirect } from 'next/navigation';
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
    .select('id, status')
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
    supabase.from('count_lines').select('*').eq('session_id', opened.sessionId),
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
      isNotApplicable: line?.is_not_applicable ?? false,
      notApplicableReason: line?.not_applicable_reason ?? null,
      countedSaladbar: Boolean(line?.counted_saladbar_at),
      countedFridge: Boolean(line?.counted_fridge_at),
    };
  }

  return (
    <main className="mx-auto w-full max-w-md">
      <CountingScreen
        sessionId={opened.sessionId}
        title={config.title}
        products={products}
        initial={initial}
        reportHref={`/comptage/${session}/rapport`}
      />
    </main>
  );
}
