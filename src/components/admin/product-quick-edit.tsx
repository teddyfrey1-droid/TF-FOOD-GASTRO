'use client';

import { useState, useTransition } from 'react';
import { Check, ImagePlus, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateProductInline } from '@/app/admin/produits/actions';
import type { ProductWithCategory } from '@/lib/admin/queries';

/**
 * Renommer un produit ou lui donner une photo, sans ouvrir sa fiche.
 *
 * Ce sont les deux retouches les plus fréquentes — un nom mal orthographié,
 * une photo qu'on ajoute au fil de l'eau. Les enfouir derrière un formulaire
 * de vingt champs revenait à ne jamais les faire.
 */
export function QuickEdit({ product }: { product: ProductWithCategory }) {
  const [mode, setMode] = useState<'lecture' | 'nom' | 'photo'>('lecture');
  const [nom, setNom] = useState(product.name);
  const [photo, setPhoto] = useState(product.image_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(patch: { name?: string; imageUrl?: string | null }) {
    setError(null);
    startTransition(async () => {
      const result = await updateProductInline(product.id, patch);
      if (result.error) setError(result.error);
      else setMode('lecture');
    });
  }

  if (mode === 'nom') {
    return (
      <span className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={nom}
          onChange={(event) => setNom(event.target.value)}
          className="h-9 w-48 rounded-lg font-medium"
          onKeyDown={(event) => {
            if (event.key === 'Enter') save({ name: nom });
            if (event.key === 'Escape') {
              setNom(product.name);
              setMode('lecture');
            }
          }}
        />
        <Button size="sm" className="size-9 rounded-lg p-0" disabled={pending} onClick={() => save({ name: nom })}>
          <Check className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="size-9 rounded-lg p-0"
          onClick={() => {
            setNom(product.name);
            setMode('lecture');
          }}
        >
          <X className="size-4" />
        </Button>
        {error ? <span className="text-destructive text-xs font-semibold">{error}</span> : null}
      </span>
    );
  }

  if (mode === 'photo') {
    return (
      <span className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={photo}
          inputMode="url"
          placeholder="https://… (vide = vignette illustrée)"
          onChange={(event) => setPhoto(event.target.value)}
          className="h-9 w-64 rounded-lg"
          onKeyDown={(event) => {
            if (event.key === 'Enter') save({ imageUrl: photo.trim() });
            if (event.key === 'Escape') {
              setPhoto(product.image_url ?? '');
              setMode('lecture');
            }
          }}
        />
        <Button
          size="sm"
          className="size-9 rounded-lg p-0"
          disabled={pending}
          onClick={() => save({ imageUrl: photo.trim() })}
        >
          <Check className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="size-9 rounded-lg p-0"
          onClick={() => {
            setPhoto(product.image_url ?? '');
            setMode('lecture');
          }}
        >
          <X className="size-4" />
        </Button>
        {error ? <span className="text-destructive text-xs font-semibold">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setMode('nom')}
        className="group flex items-center gap-1.5 font-medium"
        aria-label={`Renommer ${product.name}`}
      >
        {product.name}
        <Pencil className="text-muted-foreground/50 group-hover:text-foreground size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setMode('photo')}
        aria-label={`Photo de ${product.name}`}
        title={product.image_url ? 'Changer la photo' : 'Ajouter une photo'}
        className="text-muted-foreground/50 hover:text-foreground p-1"
      >
        <ImagePlus className="size-3.5" />
      </button>
      {error ? <span className="text-destructive text-xs font-semibold">{error}</span> : null}
    </span>
  );
}
