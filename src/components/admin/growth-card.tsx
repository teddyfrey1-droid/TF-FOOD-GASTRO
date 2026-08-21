'use client';

import { useState, useTransition } from 'react';
import { Check, Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { setGrowthRate } from '@/app/admin/chiffre-affaires/actions';
import { cn } from '@/lib/utils';

export interface GrowthWindow {
  label: string;
  rate: number | null;
  days: number;
}

/**
 * Le taux de croissance appliqué, réglable en trois secondes.
 *
 * C'est le réglage qui décide seul de la production du jour. Il doit donc
 * être modifiable là où on le regarde, sans passer par un formulaire.
 *
 * Il ne porte plus que le taux : les fenêtres d'observation ont leur
 * propre carte, plus bas dans la page. Les deux ensemble faisaient une
 * carte haute où le chiffre important se noyait.
 */
export function GrowthCard({
  currentRate,
  windows,
}: {
  currentRate: number;
  windows: GrowthWindow[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(Math.round(currentRate * 100)));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const recente = windows[0];

  function apply(percent: number) {
    setError(null);
    startTransition(async () => {
      const result = await setGrowthRate(percent / 100);
      if (result.error) setError(result.error);
      else setEditing(false);
    });
  }

  return (
    <Card className="rounded-3xl px-5 py-4">
      <p className="text-foreground text-xs font-black tracking-wide uppercase">
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
            className="h-12 w-24 rounded-2xl text-center text-2xl font-black tabular-nums"
          />
          <span className="text-2xl font-black">%</span>
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
          className="group mt-1.5 flex items-center gap-2"
        >
          {/* Une pastille pleine détache le taux du texte, là où un chiffre
              nu se confondait avec les montants voisins. */}
          <span className="bg-primary/15 text-primary rounded-full px-3.5 py-1 text-xl font-black tabular-nums">
            {currentRate >= 0 ? '+' : ''}
            {Math.round(currentRate * 100)} %
          </span>
          <Pencil className="text-muted-foreground group-hover:text-foreground size-4" />
        </button>
      )}

      {/* Un seul repère ici : le reste des fenêtres vit dans sa propre
          carte. Celui-ci sert à voir tout de suite si le taux appliqué
          colle encore à la réalité récente. */}
      {recente?.rate !== null && recente !== undefined ? (
        <p className="text-muted-foreground mt-2.5 text-[11px] leading-snug font-medium">
          {recente.label} : {Math.round(recente.rate * 100) >= 0 ? '+' : ''}
          {Math.round(recente.rate * 100)} % constatés.
        </p>
      ) : null}

      {error ? <p className="text-destructive mt-2 text-sm font-medium">{error}</p> : null}
    </Card>
  );
}

/**
 * Ce que disent les données, et par quoi remplacer le taux.
 *
 * Séparée de la pastille : celle-ci annonce la production du jour et se
 * lit tout en haut ; ceci est un réglage, qu'on consulte après avoir vu
 * les comptages du jour. D'où sa place en bas de l'accueil.
 */
export function GrowthObservedCard({
  currentRate,
  windows,
}: {
  currentRate: number;
  windows: GrowthWindow[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(percent: number) {
    setError(null);
    startTransition(async () => {
      const result = await setGrowthRate(percent / 100);
      if (result.error) setError(result.error);
    });
  }

  return (
    <Card className="rounded-3xl p-5">
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
        Touchez une valeur pour l&apos;appliquer. La tendance récente prédit mieux les semaines à
        venir qu&apos;une moyenne sur douze mois — une jeune enseigne voit sa croissance ralentir.
      </p>

      {error ? <p className="text-destructive mt-2 text-sm font-medium">{error}</p> : null}
    </Card>
  );
}
