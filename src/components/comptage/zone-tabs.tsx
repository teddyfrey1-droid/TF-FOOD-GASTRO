'use client';

import { cn } from '@/lib/utils';

export type CountZone = 'saladbar' | 'fridge' | 'desserts';

export const ZONE_LABELS: Record<CountZone, string> = {
  saladbar: 'Saladbar',
  fridge: 'Frigo du bas',
  desserts: 'Frigo desserts',
};

/** Le libellé court, pour les onglets : trois noms entiers ne tiennent pas. */
export const ZONE_LABELS_COURTS: Record<CountZone, string> = {
  saladbar: 'Saladbar',
  fridge: 'Frigo bas',
  desserts: 'Desserts',
};

/**
 * Le comptage se fait en TROIS PASSES, pas produit par produit.
 *
 * L'employé se place devant le saladbar, compte tout ce qui s'y trouve,
 * descend au frigo du bas, puis passe au frigo à desserts. Faire
 * l'aller-retour à chaque produit lui ferait traverser la cuisine
 * trente-neuf fois.
 *
 * Une zone vide n'a pas d'onglet : proposer « Desserts 0/0 » ferait
 * chercher un meuble qui ne contient rien ce jour-là.
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
      {(['saladbar', 'fridge', 'desserts'] as const)
        .filter((candidate) => progress[candidate].total > 0)
        .map((candidate) => {
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
              'no-select flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold transition-colors',
              active ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {ZONE_LABELS_COURTS[candidate]}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] font-black tabular-nums',
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
