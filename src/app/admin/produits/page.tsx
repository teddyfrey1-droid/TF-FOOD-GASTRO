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
          Chaque fiche répond à trois questions : où le produit est rangé, à partir de quelle
          quantité il faut en refaire, et s&apos;il entre encore dans les comptages. Le reste —
          cible, base, DLC, photo — vit derrière «&nbsp;Modifier&nbsp;».
        </p>
      </header>

      <ProductsManager products={products} categories={categories} />
    </div>
  );
}
