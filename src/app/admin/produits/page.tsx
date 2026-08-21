import { requireDroit } from '@/lib/auth';
import { getCategories, getProducts } from '@/lib/admin/queries';
import { ProductsManager } from '@/components/admin/products-manager';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  await requireDroit('carte');
  const [products, categories] = await Promise.all([getProducts(true), getCategories()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          Produits <span className="text-muted-foreground">({products.filter((p) => p.is_active).length})</span>
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Touchez une tuile pour ne voir qu&apos;une zone, un nom pour le corriger, «&nbsp;Haut /
          Bas&nbsp;» pour dire où le produit est rangé. L&apos;interrupteur le retire des
          comptages sans toucher au passé ; la corbeille ne s&apos;ouvre que sur un produit
          jamais compté.
        </p>
      </header>

      <ProductsManager products={products} categories={categories} />
    </div>
  );
}
