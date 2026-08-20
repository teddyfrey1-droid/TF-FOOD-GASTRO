'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { JOURNAL, VERSION } from '@/lib/version';
import { cn } from '@/lib/utils';

const DATE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/**
 * Le numéro de version, en bas de « Mon compte ».
 *
 * Sert à répondre à « est-ce que ma demande est passée ? » : on compare le
 * numéro affiché ici à celui annoncé, et on déplie le journal pour voir ce
 * que la version a changé. Refermé par défaut — c'est une vérification
 * ponctuelle, pas une lecture quotidienne.
 */
export function CarteVersion() {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={() => setOuvert((actuel) => !actuel)}
        aria-expanded={ouvert}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors"
      >
        Lafayette — version {VERSION}
        <ChevronDown className={cn('size-3.5 transition-transform', ouvert && 'rotate-180')} />
      </button>

      {ouvert ? (
        <div className="bg-card mt-2 space-y-4 rounded-3xl border p-5 text-left">
          {JOURNAL.map((entree) => (
            <section key={entree.version}>
              <h3 className="flex items-baseline gap-2">
                <span className="text-[15px] font-black">Version {entree.version}</span>
                <span className="text-muted-foreground text-xs font-semibold">
                  {DATE.format(new Date(`${entree.date}T12:00:00Z`))}
                </span>
              </h3>
              <ul className="text-muted-foreground mt-1.5 space-y-1 text-[13px] leading-relaxed">
                {entree.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <span aria-hidden className="text-primary font-black">
                      ·
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
