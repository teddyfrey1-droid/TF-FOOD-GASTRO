'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { PastilleEtat } from '@/components/rangee-menu';
import { cn } from '@/lib/utils';

const HEURE = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

export interface ComptagePasse {
  id: string;
  session: 'morning' | 'afternoon';
  status: string;
  submittedAt: string | null;
  auteur: string | null;
  href: string;
}

/**
 * Une journée passée, repliée par défaut.
 *
 * Trente journées dépliées faisaient une colonne de cartes toutes
 * semblables, dans laquelle on ne retrouvait rien. Repliée, chaque
 * journée tient sur une ligne — date, état, ce qui reste — et on ouvre
 * celle qu'on cherche. C'est le seul geste qu'on fait vraiment ici :
 * remonter à un jour précis.
 */
export function JourneePassee({
  dateLisible,
  validees,
  comptages,
  relancesEnAttente,
}: {
  dateLisible: string;
  validees: number;
  comptages: ComptagePasse[];
  relancesEnAttente: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  const complet = validees === 2;

  return (
    <div className="bg-card overflow-hidden rounded-2xl border">
      <button
        type="button"
        onClick={() => setOuvert((actuel) => !actuel)}
        aria-expanded={ouvert}
        className="hover:bg-muted/40 flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-tight font-black capitalize">
            {dateLisible}
          </span>
          {relancesEnAttente > 0 ? (
            <span className="text-muted-foreground mt-0.5 block text-[11px] font-bold">
              {relancesEnAttente} relance{relancesEnAttente > 1 ? 's' : ''} jamais cochée
              {relancesEnAttente > 1 ? 's' : ''}
            </span>
          ) : null}
        </span>

        <PastilleEtat
          texte={complet ? 'Complet' : `${validees}/2`}
          ton={complet ? 'fait' : 'alerte'}
        />

        <ChevronDown
          className={cn(
            'text-muted-foreground/60 size-4 shrink-0 transition-transform',
            ouvert && 'rotate-180',
          )}
          strokeWidth={2.5}
        />
      </button>

      {ouvert ? (
        <div className="border-t px-2 py-1.5">
          {comptages.map((comptage) => (
            <Link
              key={comptage.id}
              href={comptage.href}
              className="hover:bg-muted/60 flex items-center gap-2 rounded-xl px-2 py-2 transition-colors"
            >
              <span className="w-24 shrink-0 text-[13px] font-bold">
                {comptage.session === 'morning' ? 'Matin' : 'Après-midi'}
              </span>
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-[13px] font-semibold">
                {comptage.submittedAt
                  ? `${HEURE.format(new Date(comptage.submittedAt))} · ${comptage.auteur ?? '—'}`
                  : 'non validé'}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
