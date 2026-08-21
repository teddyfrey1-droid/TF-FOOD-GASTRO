'use client';

import { memo, useState } from 'react';
import { Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BacStepper } from './bac-stepper';
import { VignetteProduit } from '@/components/produits/vignette-produit';
import { ZONE_LABELS, type CountZone } from './zone-tabs';
import type { CountProduct } from './counting-screen';

export interface CountState {
  qtySaladbar: number;
  qtyFridge: number;
  qtyDesserts: number;
  isNotApplicable: boolean;
  notApplicableReason: string | null;
  /** Le saladbar a été relevé (même à zéro). */
  countedSaladbar: boolean;
  /** Le frigo du bas a été relevé (même à zéro). */
  countedFridge: boolean;
  /** Le frigo à desserts a été relevé (même à zéro). */
  countedDesserts: boolean;
  /** Comptage remis à plus tard : ne bloque pas, n'entre pas au rapport. */
  isDeferred: boolean;
  deferredReason: string | null;
}

export const EMPTY_LINE: CountState = {
  qtySaladbar: 0,
  qtyFridge: 0,
  qtyDesserts: 0,
  isNotApplicable: false,
  notApplicableReason: null,
  countedSaladbar: false,
  countedFridge: false,
  countedDesserts: false,
  isDeferred: false,
  deferredReason: null,
};

/** Deux façons de présenter la liste, au choix de l'employé. */
export type CountLayout = 'grille' | 'liste';

/**
 * Une ligne est faite quand TOUTES ses zones ont été relevées.
 *
 * Un produit absent ou reporté ne bloque pas : dans les deux cas il n'y a
 * rien à mesurer, pour des raisons différentes.
 */
export function isLineDone(
  line: CountState | null | undefined,
  product: { inSaladbar: boolean; inFridge: boolean; inDesserts: boolean },
): boolean {
  if (!line) return false;
  if (line.isNotApplicable || line.isDeferred) return true;
  if (product.inSaladbar && !line.countedSaladbar) return false;
  if (product.inFridge && !line.countedFridge) return false;
  if (product.inDesserts && !line.countedDesserts) return false;
  return true;
}

function ProductRowImpl({
  product,
  state,
  zone,
  layout,
  onChange,
}: {
  product: CountProduct;
  state: CountState | undefined;
  zone: CountZone;
  layout: CountLayout;
  /**
   * Volontairement (produit, zone, correctif) plutôt qu'un simple
   * correctif : une fermeture recréée par ligne à chaque rendu rendrait la
   * mémoïsation ci-dessous parfaitement inutile.
   */
  onChange: (productId: string, patch: Partial<CountState>, zone: CountZone) => void;
}) {
  const line = state ?? EMPTY_LINE;
  const zoneCounted =
    zone === 'saladbar'
      ? line.countedSaladbar
      : zone === 'fridge'
        ? line.countedFridge
        : line.countedDesserts;
  const [demande, setDemande] = useState<null | 'absent' | 'report'>(null);
  const [motif, setMotif] = useState('');

  /** Le produit vit-il dans plus d'un meuble ? */
  const zonesDuProduit = [
    product.inSaladbar && 'saladbar',
    product.inFridge && 'fridge',
    product.inDesserts && 'desserts',
  ].filter(Boolean) as CountZone[];
  const value =
    zone === 'saladbar'
      ? line.qtySaladbar
      : zone === 'fridge'
        ? line.qtyFridge
        : line.qtyDesserts;

  /** Ce qui a été relevé dans les AUTRES meubles, pour le rappel « + N ». */
  const otherValue =
    (zone === 'saladbar' ? 0 : line.qtySaladbar) +
    (zone === 'fridge' ? 0 : line.qtyFridge) +
    (zone === 'desserts' ? 0 : line.qtyDesserts);

  /** Le champ que la zone en cours écrit. */
  const champQuantite = (n: number) =>
    zone === 'saladbar'
      ? { qtySaladbar: n }
      : zone === 'fridge'
        ? { qtyFridge: n }
        : { qtyDesserts: n };
  const autresZones = zonesDuProduit.filter((autre) => autre !== zone);
  const otherLabel = autresZones.map((autre) => ZONE_LABELS[autre]).join(' + ');

  // Un produit qui n'est pas stocké dans cette zone n'a rien à y faire.
  const presentHere = zonesDuProduit.includes(zone);
  const inBothZones = zonesDuProduit.length > 1;

  if (!presentHere) return null;

  const misDeCote = line.isNotApplicable || line.isDeferred;
  const done = zoneCounted && !misDeCote;
  const grille = layout === 'grille';

  /** Un appui sur la photo ajoute une unité : c'est la plus grande cible
   *  de la carte, et le geste le plus fréquent du comptage. */
  const ajouterUn = () =>
    onChange(
      product.id,
      champQuantite(value + product.countStep),
      zone,
    );

  const vignette = (
    <span className="relative block">
      <VignetteProduit
        name={product.name}
        categoryName={product.categoryName}
        imageUrl={product.imageUrl}
        className={cn(grille && 'aspect-square size-full rounded-xl text-3xl')}
      />
      {done ? (
        <span className="bg-primary text-primary-foreground absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full">
          <Check className="size-3.5" strokeWidth={4} />
        </span>
      ) : null}
      {line.isDeferred ? (
        <span className="bg-alert text-alert-foreground absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full">
          <Clock className="size-3.5" strokeWidth={3} />
        </span>
      ) : null}
    </span>
  );

  const titre = (
    <>
      <p
        className={cn(
          'font-black',
          grille ? 'line-clamp-2 text-[13px] leading-tight' : 'text-[15px] leading-tight',
        )}
      >
        {product.name}
      </p>
      <p className="text-muted-foreground mt-0.5 text-[11px] font-semibold">
        {!zoneCounted && !misDeCote ? 'Touchez la photo pour +1 · ' : ''}
        {product.unit === 'piece' ? 'pièces' : 'gastros'}
        {inBothZones && !grille ? ` · ${otherLabel} : ${otherValue}` : ''}
        {inBothZones && grille ? ` · ${otherValue} ailleurs` : ''}
      </p>
    </>
  );

  return (
    <div
      id={`produit-${product.id}`}
      // `scroll-mt` réserve la place de l'en-tête collant : sans elle, le
      // saut vers un produit manquant l'amènerait sous la barre de recherche.
      className={cn(
        'scroll-mt-52 rounded-2xl border p-2.5 transition-colors',
        misDeCote && 'bg-card opacity-60',
        !misDeCote && done && 'border-primary/50 bg-primary/[0.05]',
        !misDeCote && !done && 'bg-card',
      )}
    >
      {grille ? (
        <div className="space-y-1.5">
          {misDeCote ? (
            vignette
          ) : (
            <button
              type="button"
              onClick={ajouterUn}
              aria-label={`Ajouter 1 à ${product.name}`}
              className="no-select block w-full touch-manipulation transition-transform active:scale-95"
            >
              {vignette}
            </button>
          )}
          <div className="min-w-0">{titre}</div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          {misDeCote ? (
            <span className="shrink-0">{vignette}</span>
          ) : (
            <button
              type="button"
              onClick={ajouterUn}
              aria-label={`Ajouter 1 à ${product.name}`}
              className="no-select shrink-0 touch-manipulation transition-transform active:scale-95"
            >
              {vignette}
            </button>
          )}
          <div className="min-w-0 flex-1">{titre}</div>
        </div>
      )}

      {misDeCote ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-muted-foreground min-w-0 flex-1 truncate text-xs font-semibold">
            {line.isDeferred ? 'Reporté' : 'Absent'} —{' '}
            {line.deferredReason ?? line.notApplicableReason}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 rounded-xl"
            onClick={() =>
              onChange(
                product.id,
                {
                  isNotApplicable: false,
                  notApplicableReason: null,
                  isDeferred: false,
                  deferredReason: null,
                },
                zone,
              )
            }
          >
            Reprendre
          </Button>
        </div>
      ) : (
        <div className="mt-2.5">
          <BacStepper
            label={ZONE_LABELS[zone]}
            value={value}
            step={product.countStep}
            counted={zoneCounted}
            compact={grille}
            onChange={(next) =>
              onChange(product.id, champQuantite(next), zone)
            }
            onZero={() =>
              onChange(product.id, champQuantite(0), zone)
            }
          />
        </div>
      )}

      {misDeCote ? null : demande ? (
        <div className="mt-2.5 space-y-2">
          <Input
            autoFocus
            value={motif}
            onChange={(event) => setMotif(event.target.value)}
            placeholder={
              demande === 'report' ? 'Pourquoi plus tard ?' : 'Pourquoi ? (non reçu, hors carte…)'
            }
            className="h-10 rounded-xl text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-10 rounded-xl"
              disabled={motif.trim() === ''}
              onClick={() => {
                onChange(
                  product.id,
                  demande === 'report'
                    ? { isDeferred: true, deferredReason: motif.trim() }
                    : { isNotApplicable: true, notApplicableReason: motif.trim() },
                  zone,
                );
                setDemande(null);
                setMotif('');
              }}
            >
              Confirmer
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10 rounded-xl"
              onClick={() => setDemande(null)}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setDemande('report')}
            className="hover:text-foreground"
          >
            Plus tard…
          </button>
          <button
            type="button"
            onClick={() => setDemande('absent')}
            className="hover:text-foreground"
          >
            Produit absent ?
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Trente-sept lignes à l'écran, et chaque appui sur un « + » change l'état
 * global : sans cette mémoïsation, React redessinait les trente-sept à
 * chaque incrément. C'est ce qui donnait cette impression de ralenti.
 */
export const ProductRow = memo(ProductRowImpl);
