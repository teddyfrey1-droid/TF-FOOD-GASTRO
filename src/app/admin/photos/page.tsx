import { requireManager } from '@/lib/auth';
import { getCategories, getProducts } from '@/lib/admin/queries';
import { PhotosManager, type PhotoRow } from '@/components/admin/photos-manager';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Photos — Heiko' };

export default async function PhotosPage() {
  await requireManager();
  const [products, categories] = await Promise.all([getProducts(false), getCategories()]);
  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  const rows: PhotoRow[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    categoryName: categoryById.get(product.category_id) ?? '—',
    imageUrl: product.image_url,
  }));

  const sansPhoto = rows.filter((row) => !row.imageUrl).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          Photos <span className="text-muted-foreground">({rows.length - sansPhoto}/{rows.length})</span>
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Une photo se reconnaît plus vite qu&apos;un nom, surtout sur une liste de trente-sept
          produits. Sans photo, l&apos;écran de comptage affiche une vignette illustrée déduite du
          nom : rien ne casse.
        </p>
      </header>

      <PhotosManager products={rows} />
    </div>
  );
}
