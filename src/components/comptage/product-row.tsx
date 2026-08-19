'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BacStepper } from './bac-stepper';
import type { CountProduct } from './counting-screen';

export interface CountState {
  qtySaladbar: number;
  qtyFridge: number;
  isNotApplicable: boolean;
  notApplicableReason: string | null;
  counted: boolean;
}

const EMPTY: CountState = {
  qtySaladbar: 0,
  qtyFridge: 0,
  isNotApplicable: false,
  notApplicableReason: null,
  counted: false,
};

/**
 * Une ligne de comptage.
 *
 * L'employé compte zone par zone — il ne fait pas l'addition de tête. Les deux
 * steppers sont donc distincts et c'est l'application qui totalise.
 */
export function ProductRow({
  product,
  state,
  onChange,
}: {
  product: CountProduct;
  state: CountState | undefined;
  onChange: (patch: Partial<CountState>) => void;
}) {
  const line = state ?? EMPTY;
  const [askingReason, setAskingReason] = useState(false);
  const [reason, setReason] = useState(line.notApplicableReason ?? '');

  const total = Math.round((line.qtySaladbar + line.qtyFridge) * 1e6) / 1e6;

  return (
    <div
      className={cn(
        'bg-card rounded-2xl border p-4 transition-colors',
        line.isNotApplicable && 'opacity-50',
        line.counted && !line.isNotApplicable && 'border-primary/30',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-tight font-bold">{product.name}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {product.unit === 'piece' ? 'pièces' : 'gastros'}
            {product.notes ? ` · ${product.notes}` : ''}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <span className="text-muted-foreground block text-[10px] font-semibold tracking-wide uppercase">
            Total
          </span>
          <span
            className={cn(
              'block text-3xl font-black tabular-nums',
              !line.counted && 'text-muted-foreground/30',
            )}
          >
            {line.isNotApplicable
              ? '—'
              : total.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
          </span>
        </div>
      </div>

      {line.isNotApplicable ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            Absent — {line.notApplicableReason}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ isNotApplicable: false, notApplicableReason: null })}
          >
            Annuler
          </Button>
        </div>
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
                onChange({ isNotApplicable: true, notApplicableReason: reason.trim() });
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
        <div className="mt-4 flex items-end justify-between gap-2">
          <div className="flex gap-3">
            {product.inSaladbar ? (
              <BacStepper
                label="Saladbar"
                value={line.qtySaladbar}
                step={product.countStep}
                onChange={(next) => onChange({ qtySaladbar: next })}
              />
            ) : null}

            {product.inFridge ? (
              <BacStepper
                label="Frigo"
                value={line.qtyFridge}
                step={product.countStep}
                onChange={(next) => onChange({ qtyFridge: next })}
              />
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground shrink-0 text-xs"
            onClick={() => setAskingReason(true)}
          >
            Absent
          </Button>
        </div>
      )}
    </div>
  );
}
