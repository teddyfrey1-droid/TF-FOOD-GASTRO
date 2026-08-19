'use client';

import { cn } from '@/lib/utils';

/**
 * Pills de catégorie, collantes en haut et défilables horizontalement.
 * La pill active est en fond plein — on doit voir d'un coup d'œil où on en est.
 */
export function CategoryPills({
  categories,
  active,
  onSelect,
}: {
  categories: { name: string; counted: number; total: number }[];
  active: string | null;
  onSelect: (name: string | null) => void;
}) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max gap-2 pb-1">
        <Pill label="Tout" active={active === null} onClick={() => onSelect(null)} />

        {categories.map((category) => (
          <Pill
            key={category.name}
            label={category.name}
            badge={
              category.counted < category.total
                ? `${category.counted}/${category.total}`
                : undefined
            }
            done={category.counted === category.total}
            active={active === category.name}
            onClick={() => onSelect(active === category.name ? null : category.name)}
          />
        ))}
      </div>
    </div>
  );
}

function Pill({
  label,
  badge,
  done,
  active,
  onClick,
}: {
  label: string;
  badge?: string;
  done?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'no-select flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors',
        active
          ? 'bg-foreground text-background'
          : 'bg-card text-muted-foreground border hover:text-foreground',
      )}
    >
      {label}
      {badge ? (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
            active ? 'bg-background/20' : 'bg-alert text-alert-foreground',
          )}
        >
          {badge}
        </span>
      ) : null}
      {done && !active ? <span className="text-primary text-xs">✓</span> : null}
    </button>
  );
}
