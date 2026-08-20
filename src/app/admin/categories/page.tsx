import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CategoriesManager, type CategoryRow } from '@/components/admin/categories-manager';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Catégories — Heiko' };

export default async function CategoriesPage() {
  await requireManager();
  const supabase = await createClient();

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('product_categories').select('id, name').order('sort_order'),
    supabase.from('products').select('category_id, in_saladbar, in_fridge').eq('is_active', true),
  ]);

  const rows: CategoryRow[] = (categories ?? []).map((category) => {
    const own = (products ?? []).filter((product) => product.category_id === category.id);
    return {
      id: category.id,
      name: category.name,
      productCount: own.length,
      saladbarCount: own.filter((product) => product.in_saladbar).length,
      fridgeCount: own.filter((product) => product.in_fridge).length,
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          Catégories <span className="text-muted-foreground">({rows.length})</span>
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Leur ordre est celui des rayons à l&apos;écran de comptage : rangez-les dans l&apos;ordre
          où l&apos;on traverse la cuisine.
        </p>
      </header>

      <CategoriesManager categories={rows} />
    </div>
  );
}
