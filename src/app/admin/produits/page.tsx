import { getCategories, getProducts } from '@/lib/admin/queries';
import { ProductsManager } from '@/components/admin/products-manager';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([getProducts(true), getCategories()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Produits</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Format GN, seuil de relance, bornes de cible, urgence et zones de stockage. Désactiver un
          produit ne le supprime jamais : l&apos;historique doit rester lisible.
        </p>
      </header>

      <ProductsManager products={products} categories={categories} />
    </div>
  );
}
