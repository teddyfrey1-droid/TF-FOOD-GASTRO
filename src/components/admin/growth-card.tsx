'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatEuro } from '@/lib/format';
import { setGrowthRate } from '@/app/admin/chiffre-affaires/actions';
import { cn } from '@/lib/utils';

export interface GrowthWindow {
  label: string;
  rate: number | null;
  days: number;
}

/**
 * Le taux de croissance, réglable en trois secondes.
 *
 * C'est le réglage qui décide seul de la production du jour. Il doit donc
 * être modifiable là où on le regarde, sans passer par un formulaire.
 */
export function GrowthCard({
  currentRate,
  windows,
  totals,
}: {
  currentRate: number;
  windows: GrowthWindow[];
  totals: { actual: number; reference: number } | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(Math.round(currentRate * 100)));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(percent: number) {
    setError(null);
    startTransition(async () => {
      const result = await setGrowthRate(percent / 100);
      if (result.error) setError(result.error);
      else setEditing(false);
    });
  }

  return (
    <Card className="rounded-3xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            Taux de croissance appliqué
          </p>

          {editing ? (
            <div className="mt-2 flex items-center gap-2">
              <Input
                autoFocus
                value={draft}
                inputMode="decimal"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') apply(Number(draft.replace(',', '.')));
                  if (event.key === 'Escape') setEditing(false);
                }}
                className="h-14 w-28 rounded-2xl text-center text-3xl font-black tabular-nums"
              />
              <span className="text-3xl font-black">%</span>
              <Button
                size="sm"
                disabled={pending}
                onClick={() => apply(Number(draft.replace(',', '.')))}
                className="ml-1 h-11 rounded-xl"
              >
                <Check className="size-4" />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(String(Math.round(currentRate * 100)));
                setEditing(true);
              }}
              className="group mt-1 flex items-center gap-2"
            >
              <span className="text-5xl font-black tabular-nums">
                {currentRate >= 0 ? '+' : ''}
                {Math.round(currentRate * 100)} %
              </span>
              <Pencil className="text-muted-foreground group-hover:text-foreground size-4" />
            </button>
          )}

          {error ? <p className="text-destructive mt-2 text-sm font-medium">{error}</p> : null}
        </div>

        {totals ? (
          <p className="text-muted-foreground max-w-56 text-xs leading-relaxed">
            {formatEuro(totals.actual)} réalisés contre {formatEuro(totals.reference)} l&apos;an
            dernier, sur les mêmes jours de semaine.
          </p>
        ) : null}
      </div>

      <div className="mt-5 border-t pt-4">
        <p className="text-muted-foreground mb-2.5 text-xs font-bold tracking-wide uppercase">
          Constaté sur vos données
        </p>

        <div className="flex flex-wrap gap-2">
          {windows.map((window) => {
            const percent = window.rate === null ? null : Math.round(window.rate * 100);
            const isCurrent = percent === Math.round(currentRate * 100);

            return (
              <button
                key={window.label}
                type="button"
                disabled={percent === null || pending}
                onClick={() => percent !== null && apply(percent)}
                className={cn(
                  'flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-left transition-colors',
                  isCurrent ? 'border-foreground bg-muted/60' : 'hover:bg-muted/40',
                  percent === null && 'opacity-40',
                )}
              >
                {percent !== null && percent >= 0 ? (
                  <TrendingUp className="text-primary size-4" />
                ) : (
                  <TrendingDown className="text-destructive size-4" />
                )}
                <span>
                  <span className="block text-lg font-black tabular-nums">
                    {percent === null ? '—' : `${percent >= 0 ? '+' : ''}${percent} %`}
                  </span>
                  <span className="text-muted-foreground block text-[11px] font-medium">
                    {window.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
          Touchez une valeur pour l&apos;appliquer. La tendance récente prédit mieux les semaines
          à venir qu&apos;une moyenne sur douze mois — une jeune enseigne voit sa croissance
          ralentir.
        </p>
      </div>
    </Card>
  );
}
