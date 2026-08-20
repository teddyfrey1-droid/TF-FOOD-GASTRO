import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Une tuile du menu Gestion.
 *
 * Un pictogramme se reconnaît avant qu'un mot ne se lise, et la phrase en
 * dessous dit à quoi sert l'écran — pas ce qu'il contient. « Produits » ne
 * dit rien ; « noms, bases, seuils, zones » dit quand y aller.
 */
export function TuileGestion({
  href,
  emoji,
  titre,
  description,
  badge,
  alerte,
}: {
  href: string;
  emoji: string;
  titre: string;
  description: string;
  badge?: string;
  /** Attire l'œil quand il y a quelque chose à corriger. */
  alerte?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-3.5 rounded-3xl border p-4 transition-colors',
        alerte ? 'border-amber-500/50 bg-amber-500/[0.06]' : 'bg-card hover:bg-muted/50',
      )}
    >
      <span
        aria-hidden
        className="bg-primary/10 flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
      >
        {emoji}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-black">{titre}</span>
          {badge ? (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums',
                alerte ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
              )}
            >
              {badge}
            </span>
          ) : null}
        </span>
        <span className="text-muted-foreground mt-0.5 block text-xs font-semibold">
          {description}
        </span>
      </span>

      <ChevronRight className="text-muted-foreground/60 group-hover:text-foreground size-5 shrink-0" />
    </Link>
  );
}

/** Un intertitre de section, avec son décompte. */
export function SectionGestion({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-muted-foreground mb-2.5 text-xs font-black tracking-wider uppercase">
        {titre}
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-2">{children}</div>
    </section>
  );
}
