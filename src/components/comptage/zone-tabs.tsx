'use client';

import { cn } from '@/lib/utils';

export type CountZone = 'saladbar' | 'fridge';

export const ZONE_LABELS: Record<CountZone, string> = {
  saladbar: 'Saladbar',
  fridge: 'Frigo du bas',
};

/**
 * Le comptage se fait en DEUX PASSES, pas produit par produit.
 *
 * L'employé se place devant le saladbar, compte tout ce qui s'y trouve, puis
 * descend au frigo et recommence. Faire l'aller-retour à chaque produit lui
 * ferait traverser la cuisine trente-neuf fois.
 */
export function ZoneTabs({
  zone,
  onChange,
  progress,
}: {
  zone: CountZone;
  onChange: (zone: CountZone) => void;
  progress: Record<CountZone, { counted: number; total: number }>;
}) {
  return (
    <div className="bg-muted flex gap-1 rounded-2xl p-1">
      {(['saladbar', 'fridge'] as const).map((candidate) => {
        const { counted, total } = progress[candidate];
        const done = total > 0 && counted === total;
        const active = zone === candidate;

        return (
          <button
            key={candidate}
            type="button"
            onClick={() => onChange(candidate)}
            aria-pressed={active}
            className={cn(
              'no-select flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors',
              active ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {ZONE_LABELS[candidate]}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-black tabular-nums',
                done ? 'bg-primary/15 text-primary' : 'bg-alert text-alert-foreground',
              )}
            >
              {done ? '✓' : `${counted}/${total}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
