import { getCategories, getProducts } from '@/lib/admin/queries';
import { ProductsManager } from '@/components/admin/products-manager';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([getProducts(true), getCategories()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          Produits <span className="text-muted-foreground">({products.filter((p) => p.is_active).length})</span>
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Touchez un nom pour le corriger, l&apos;icône image pour mettre une photo, et
          « Haut / Bas » pour dire où le produit est rangé. Désactiver un produit ne le supprime
          jamais : l&apos;historique doit rester lisible.
        </p>
      </header>

      <ProductsManager products={products} categories={categories} />
    </div>
  );
}
