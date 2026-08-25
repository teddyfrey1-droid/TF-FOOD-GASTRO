'use client';

import { useState, useTransition } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatQty } from '@/lib/format';
import { VignetteProduit } from '@/components/produits/vignette-produit';
import { updateProductInline } from '@/app/admin/produits/actions';

export interface RuptureRow {
  productId: string;
  productName: string;
  categoryName: string;
  imageUrl: string | null;
  /** Comptages retenus sur la période. */
  sessions: number;
  /** Comptages où le stock était sous le seuil critique. */
  critical: number;
  /** Comptages où il ne restait rien du tout. */
  empty: number;
  baseQty: number;
  /** Couverture moyenne : stock relevé / cible du jour. */
  avgCoverage: number | null;
  /** Base recalculée d'après le taux de rupture observé. */
  suggestedBase: number | null;
}

/** Au-delà de ce taux, la base est probablement sous-évaluée. */
const SEUIL_ALERTE = 0.2;

export function RupturesTable({ rows, jours }: { rows: RuptureRow[]; jours: number }) {
  const alertes = rows.filter((row) => row.sessions >= 4 && row.critical / row.sessions > SEUIL_ALERTE);

  if (rows.length === 0) {
    return (
      <Card className="rounded-3xl p-8 text-center">
        <p className="font-bold">Pas encore assez de comptages.</p>
        <p className="text-muted-foreground mt-2 text-sm">
          L&apos;analyse a besoin de comptages validés sur la période. Elle deviendra utile après
          une à deux semaines d&apos;utilisation — c&apos;est le temps qu&apos;il faut pour que
          des habitudes se dessinent.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {alertes.length > 0 ? (
        <div className="rounded-3xl bg-red-500/10 p-5">
          <p className="flex items-center gap-2 font-black text-red-700">
            <TriangleAlert className="size-5" />
            {alertes.length} produit{alertes.length > 1 ? 's' : ''} en rupture trop souvent
          </p>
          <p className="mt-2 text-sm text-red-900/80">
            Sur les {jours} derniers jours, {alertes.length > 1 ? 'ils sont passés' : 'il est passé'}{' '}
            sous le seuil critique plus d&apos;une fois sur cinq. Leur base est
            probablement trop basse : la proposition en face part du taux de rupture observé.
          </p>
        </div>
      ) : null}

      <ul className="space-y-2.5">
        {rows.map((row) => (
          <RuptureCard key={row.productId} row={row} />
        ))}
      </ul>
    </div>
  );
}

function RuptureCard({ row }: { row: RuptureRow }) {
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const taux = row.sessions > 0 ? row.critical / row.sessions : 0;
  const alerte = row.sessions >= 4 && taux > SEUIL_ALERTE;
  const proposition = row.suggestedBase;

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-3xl border p-4',
        alerte ? 'border-red-500/40 bg-red-500/[0.04]' : 'bg-card',
      )}
    >
      <VignetteProduit
        name={row.productName}
        categoryName={row.categoryName}
        imageUrl={row.imageUrl}
        taille="sm"
      />

      <div className="min-w-40 flex-1">
        <p className="font-black">{row.productName}</p>
        <p className="text-muted-foreground text-xs font-semibold">{row.categoryName}</p>
      </div>

      <dl className="grid grid-cols-3 gap-x-5 text-center">
        <div>
          <dt className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
            Critique
          </dt>
          <dd
            className={cn(
              'text-xl font-black tabular-nums',
              alerte ? 'text-red-600' : 'text-muted-foreground',
            )}
          >
            {row.critical}
            <span className="text-muted-foreground text-xs font-bold">/{row.sessions}</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
            À zéro
          </dt>
          <dd className="text-xl font-black tabular-nums">{row.empty}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
            Couverture
          </dt>
          <dd className="text-xl font-black tabular-nums">
            {row.avgCoverage === null ? '—' : `${Math.round(row.avgCoverage * 100)} %`}
          </dd>
        </div>
      </dl>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-muted-foreground text-[11px] font-bold tracking-wide uppercase">
            Base
          </p>
          <p className="font-black tabular-nums">
            {formatQty(row.baseQty)}
            {proposition !== null ? (
              <span className="text-primary"> → {formatQty(proposition)}</span>
            ) : null}
          </p>
        </div>

        {proposition !== null ? (
          <Button
            size="sm"
            variant={alerte ? 'default' : 'outline'}
            disabled={pending || applied}
            className="rounded-full"
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await updateProductInline(row.productId, {
                  baseQty: proposition,
                });
                if (result.error) setError(result.error);
                else setApplied(true);
              })
            }
          >
            {applied ? <Check className="size-4" /> : 'Appliquer'}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-destructive w-full text-xs font-semibold">{error}</p>
      ) : null}
    </li>
  );
}
