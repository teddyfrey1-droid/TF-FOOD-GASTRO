'use client';

import { memo, useState } from 'react';
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
  isNotApplicable: boolean;
  notApplicableReason: string | null;
  /** Le saladbar a été relevé (même à zéro). */
  countedSaladbar: boolean;
  /** Le frigo du bas a été relevé (même à zéro). */
  countedFridge: boolean;
}

export const EMPTY_LINE: CountState = {
  qtySaladbar: 0,
  qtyFridge: 0,
  isNotApplicable: false,
  notApplicableReason: null,
  countedSaladbar: false,
  countedFridge: false,
};

/** Une ligne est faite quand TOUTES ses zones ont été relevées. */
export function isLineDone(
  line: CountState | null | undefined,
  product: { inSaladbar: boolean; inFridge: boolean },
): boolean {
  if (!line) return false;
  if (line.isNotApplicable) return true;
  if (product.inSaladbar && !line.countedSaladbar) return false;
  if (product.inFridge && !line.countedFridge) return false;
  return true;
}

/**
 * Une ligne de comptage, pour UNE zone à la fois.
 *
 * Le total des deux zones reste affiché : c'est lui qui sera comparé au
 * minimum, et l'employé doit pouvoir constater ce qu'il a déjà saisi en haut
 * quand il compte en bas.
 */
function ProductRowImpl({
  product,
  state,
  zone,
  onChange,
}: {
  product: CountProduct;
  state: CountState | undefined;
  zone: CountZone;
  /**
   * Volontairement (produit, zone, correctif) plutôt qu'un simple
   * correctif : une fermeture recréée par ligne à chaque rendu rendrait la
   * mémoïsation ci-dessous parfaitement inutile.
   */
  onChange: (productId: string, patch: Partial<CountState>, zone: CountZone) => void;
}) {
  const line = state ?? EMPTY_LINE;
  const zoneCounted = zone === 'saladbar' ? line.countedSaladbar : line.countedFridge;
  const [askingReason, setAskingReason] = useState(false);
  const [reason, setReason] = useState(line.notApplicableReason ?? '');

  const isSaladbar = zone === 'saladbar';
  const value = isSaladbar ? line.qtySaladbar : line.qtyFridge;
  const otherValue = isSaladbar ? line.qtyFridge : line.qtySaladbar;
  const otherLabel = isSaladbar ? ZONE_LABELS.fridge : ZONE_LABELS.saladbar;
  const total = line.qtySaladbar + line.qtyFridge;

  // Un produit qui n'est pas stocké dans cette zone n'a rien à y faire.
  const presentHere = isSaladbar ? product.inSaladbar : product.inFridge;
  const inBothZones = product.inSaladbar && product.inFridge;

  if (!presentHere) return null;

  return (
    <div
      className={cn(
        'bg-card rounded-2xl border p-4 transition-colors',
        line.isNotApplicable && 'opacity-50',
        zoneCounted && !line.isNotApplicable && 'border-primary/40',
      )}
    >
      <div className="flex items-center gap-3">
        <VignetteProduit
          name={product.name}
          categoryName={product.categoryName}
          imageUrl={product.imageUrl}
          taille="sm"
        />

        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-tight font-black">{product.name}</p>
          <p className="text-muted-foreground mt-0.5 text-xs font-medium">
            {product.unit === 'piece' ? 'pièces' : 'gastros'}
            {inBothZones ? ` · ${otherLabel} : ${otherValue}` : ''}
            {product.notes ? ` · ${product.notes}` : ''}
          </p>
        </div>

        {line.isNotApplicable ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(product.id, { isNotApplicable: false, notApplicableReason: null }, zone)}
          >
            Annuler
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <BacStepper
              label={ZONE_LABELS[zone]}
              hideLabel
              value={value}
              step={product.countStep}
              onChange={(next) =>
                onChange(product.id, isSaladbar ? { qtySaladbar: next } : { qtyFridge: next }, zone)
              }
            />

            {inBothZones ? (
              <div className="w-11 shrink-0 text-right">
                <span className="text-muted-foreground block text-[10px] font-bold tracking-wide uppercase">
                  Total
                </span>
                <span
                  className={cn(
                    'block text-2xl font-black tabular-nums',
                    !zoneCounted && 'text-muted-foreground/30',
                  )}
                >
                  {total}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {line.isNotApplicable ? (
        <p className="text-muted-foreground mt-2 text-xs">Absent — {line.notApplicableReason}</p>
      ) : askingReason ? (
        <div className="mt-3 space-y-2">
          <Input
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Pourquoi ? (non reçu, hors carte…)"
            className="h-11 rounded-xl"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={reason.trim() === ''}
              onClick={() => {
                onChange(product.id, { isNotApplicable: true, notApplicableReason: reason.trim() }, zone);
                setAskingReason(false);
              }}
            >
              Confirmer
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAskingReason(false)}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAskingReason(true)}
          className="text-muted-foreground hover:text-foreground mt-2 text-xs font-medium"
        >
          Produit absent ?
        </button>
      )}
    </div>
  );
}

/**
 * Trente-neuf lignes à l'écran, et chaque appui sur un « + » change l'état
 * global : sans cette mémoïsation, React redessinait les trente-neuf à
 * chaque incrément. C'est ce qui donnait cette impression de ralenti.
 */
export const ProductRow = memo(ProductRowImpl);
