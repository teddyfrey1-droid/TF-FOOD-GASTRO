import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Une rangée du sommaire Gestion.
 *
 * Même motif que l'écran « Mon compte », et que les applications que
 * l'équipe utilise déjà : pastille d'icône claire à gauche, libellé en
 * gras, chevron à droite. Des rangées empilées se parcourent plus vite
 * qu'une grille de cartes — l'œil suit une seule colonne.
 *
 * La phrase du dessous dit à quoi sert l'écran, pas ce qu'il contient :
 * « Produits » n'apprend rien ; « noms, bases, seuils, zones » dit quand
 * y aller.
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
      className="hover:bg-muted/60 active:bg-muted flex min-h-16 items-center gap-3.5 rounded-2xl px-3 py-2.5 transition-colors"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl text-xl',
          alerte ? 'bg-alert' : 'bg-muted',
        )}
      >
        {emoji}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[17px] leading-tight font-bold">{titre}</span>
        <span className="text-muted-foreground mt-0.5 block truncate text-[13px] font-medium">
          {description}
        </span>
      </span>

      {badge ? (
        <span
          className={cn(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-black tabular-nums',
            alerte ? 'bg-alert text-alert-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {badge}
        </span>
      ) : null}

      <ChevronRight className="text-muted-foreground/60 size-5 shrink-0" strokeWidth={2.5} />
    </Link>
  );
}

/** Un groupe de rangées, avec son intertitre. */
export function SectionGestion({
  titre,
  children,
}: {
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h2 className="text-muted-foreground px-3 pb-1 text-sm font-bold">{titre}</h2>
      <div className="bg-card space-y-0.5 rounded-3xl border p-1.5">{children}</div>
    </section>
  );
}
