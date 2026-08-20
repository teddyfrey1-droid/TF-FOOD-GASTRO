import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * La rangée de menu — motif repris de Foodflow.
 *
 * Une pastille d'icône claire à gauche, le libellé en gras, un chevron à
 * droite. Ce qui la rend lisible tient à trois choses : la hauteur (64 px,
 * on la vise sans regarder), le contraste porté par l'icône plutôt que par
 * un fond coloré, et le chevron qui dit « ça mène quelque part » sans
 * qu'on ait à l'écrire.
 */
export function RangeeMenu({
  href,
  icone,
  titre,
  detail,
  badge,
  ton = 'neutre',
}: {
  href: string;
  icone: React.ReactNode;
  titre: string;
  detail?: string;
  /** Pastille de droite : un décompte, un état. */
  badge?: { texte: string; ton: 'neutre' | 'alerte' | 'fait' };
  ton?: 'neutre' | 'alerte';
}) {
  return (
    <Link
      href={href}
      className="hover:bg-muted/60 active:bg-muted flex min-h-16 items-center gap-3.5 rounded-2xl px-3 py-2.5 transition-colors"
    >
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-xl',
          ton === 'alerte' ? 'bg-alert text-alert-foreground' : 'bg-muted text-foreground/70',
        )}
      >
        {icone}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[17px] leading-tight font-bold">{titre}</span>
        {detail ? (
          <span className="text-muted-foreground mt-0.5 block truncate text-[13px] font-medium">
            {detail}
          </span>
        ) : null}
      </span>

      {badge ? <PastilleEtat texte={badge.texte} ton={badge.ton} /> : null}

      <ChevronRight className="text-muted-foreground/60 size-5 shrink-0" strokeWidth={2.5} />
    </Link>
  );
}

/**
 * La pastille d'état — « Fait », « En cours », « 3 à produire ».
 *
 * Volontairement large et bien remplie : c'est l'information qu'on cherche
 * du regard en traversant la cuisine, et une pastille discrète oblige à
 * s'arrêter pour la lire.
 */
export function PastilleEtat({
  texte,
  ton,
  taille = 'md',
}: {
  texte: string;
  ton: 'neutre' | 'alerte' | 'fait';
  taille?: 'md' | 'lg';
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full font-black whitespace-nowrap',
        taille === 'lg' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs',
        ton === 'fait' && 'bg-primary/15 text-primary',
        ton === 'alerte' && 'bg-alert text-alert-foreground',
        ton === 'neutre' && 'bg-muted text-muted-foreground',
      )}
    >
      {texte}
    </span>
  );
}

/** Un groupe de rangées, avec son intertitre. */
export function GroupeMenu({
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
