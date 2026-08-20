'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { VignetteProduit } from '@/components/produits/vignette-produit';
import { updateProductInline } from '@/app/admin/produits/actions';

export interface PhotoRow {
  id: string;
  name: string;
  categoryName: string;
  imageUrl: string | null;
}

/**
 * Coller trente-sept adresses de photos, sans ouvrir trente-sept fiches.
 *
 * Le geste réel est : chercher l'image sur Google, « Copier l'adresse de
 * l'image », revenir, coller. Tout l'écran est construit autour de ce
 * geste-là — un champ visible par produit, l'aperçu à côté, rien d'autre.
 */
export function PhotosManager({ products }: { products: PhotoRow[] }) {
  const [search, setSearch] = useState('');
  const [avecPhoto, setAvecPhoto] = useState(true);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      if (!avecPhoto && product.imageUrl) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        product.categoryName.toLowerCase().includes(needle)
      );
    });
  }, [products, search, avecPhoto]);

  const sansPhoto = products.filter((product) => !product.imageUrl).length;

  return (
    <div className="space-y-4">
      <div className="bg-muted/50 rounded-3xl p-5">
        <h2 className="font-black">Comment récupérer une adresse d&apos;image</h2>
        <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Cherchez le produit dans Google Images.</li>
          <li>Ouvrez l&apos;image en grand.</li>
          <li>
            Clic droit (ou appui long sur téléphone) →{' '}
            <strong className="text-foreground">Copier l&apos;adresse de l&apos;image</strong>.
          </li>
          <li>Collez-la dans le champ du produit ci-dessous. C&apos;est enregistré aussitôt.</li>
        </ol>
        <p className="text-muted-foreground mt-3 text-xs">
          L&apos;adresse doit finir par une image (.jpg, .png, .webp), pas par une page de
          résultats. Un champ vidé remet la vignette illustrée.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un produit…"
          className="h-11 max-w-xs rounded-2xl"
        />
        <Button
          variant={avecPhoto ? 'outline' : 'default'}
          className="h-11 rounded-2xl"
          onClick={() => setAvecPhoto((current) => !current)}
        >
          {avecPhoto ? `Voir les ${sansPhoto} sans photo` : 'Voir tous les produits'}
        </Button>
      </div>

      <ul className="space-y-2.5">
        {visible.map((product) => (
          <PhotoRowCard key={product.id} product={product} />
        ))}
      </ul>

      {visible.length === 0 ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          {avecPhoto ? 'Aucun produit ne correspond.' : 'Tous les produits ont une photo.'}
        </p>
      ) : null}
    </div>
  );
}

function PhotoRowCard({ product }: { product: PhotoRow }) {
  const [url, setUrl] = useState(product.imageUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(value: string) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProductInline(product.id, { imageUrl: value.trim() });
      if (result.error) setError(result.error);
      else setSaved(true);
    });
  }

  const modifie = url.trim() !== (product.imageUrl ?? '');

  return (
    <li className="bg-card flex items-center gap-3 rounded-3xl border p-3">
      <VignetteProduit
        name={product.name}
        categoryName={product.categoryName}
        // L'aperçu suit la saisie : on voit tout de suite si l'adresse est
        // la bonne, sans recharger la page.
        imageUrl={url.trim() || null}
      />

      <div className="min-w-0 flex-1">
        <p className="font-black">{product.name}</p>
        <p className="text-muted-foreground text-xs font-semibold">{product.categoryName}</p>

        <div className="mt-2 flex items-center gap-2">
          <Input
            value={url}
            inputMode="url"
            placeholder="Collez l’adresse de l’image ici"
            onChange={(event) => {
              setUrl(event.target.value);
              setSaved(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save(url);
            }}
            className="h-11 rounded-xl text-base"
          />
          <Button
            size="sm"
            disabled={pending || !modifie}
            onClick={() => save(url)}
            className={cn('h-11 shrink-0 rounded-xl px-4 font-bold')}
          >
            {saved && !modifie ? <Check className="size-4" /> : 'Enregistrer'}
          </Button>
          {product.imageUrl ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Retirer la photo de ${product.name}`}
              disabled={pending}
              onClick={() => {
                setUrl('');
                save('');
              }}
              className="size-11 shrink-0 rounded-xl p-0"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>

        {error ? (
          <p className="text-destructive mt-1 text-xs font-semibold">{error}</p>
        ) : saved && !modifie ? (
          <p className="text-primary mt-1 text-xs font-semibold">Photo enregistrée.</p>
        ) : null}
      </div>
    </li>
  );
}
