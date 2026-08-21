'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, Loader2, TriangleAlert } from 'lucide-react';
import { PastilleEtat } from '@/components/rangee-menu';
import { formatQty } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  chargerDetailComptage,
  type DetailComptagePasse,
} from '@/app/comptage/detail-passe';

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
        <div className="space-y-1.5 border-t px-2 py-2">
          {comptages.map((comptage) => (
            <ComptageDeplie key={comptage.id} comptage={comptage} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Un comptage d'une journée passée, dépliable à son tour.
 *
 * Deux questions se posent en remontant l'historique : « qu'est-ce qu'on
 * avait à faire ce jour-là ? » et « qu'est-ce qu'il y avait dans les
 * frigos ? ». Les deux réponses vivent ici, chargées seulement quand on
 * ouvre — sinon trente journées feraient plusieurs milliers de lignes au
 * chargement de l'écran.
 */
function ComptageDeplie({ comptage }: { comptage: ComptagePasse }) {
  const [ouvert, setOuvert] = useState(false);
  const [detail, setDetail] = useState<DetailComptagePasse | null>(null);
  const [chargement, demarrer] = useTransition();

  function basculer() {
    const prochain = !ouvert;
    setOuvert(prochain);
    if (prochain && detail === null) {
      demarrer(async () => setDetail(await chargerDetailComptage(comptage.id)));
    }
  }

  return (
    <div className="bg-muted/40 overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={basculer}
        aria-expanded={ouvert}
        className="hover:bg-muted/70 flex w-full items-center gap-2 px-3 py-2 text-left transition-colors"
      >
        <span className="w-24 shrink-0 text-[13px] font-black">
          {comptage.session === 'morning' ? 'Matin' : 'Après-midi'}
        </span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[12px] font-semibold">
          {comptage.submittedAt
            ? `${HEURE.format(new Date(comptage.submittedAt))} · ${comptage.auteur ?? '—'}`
            : 'non validé'}
        </span>
        {chargement ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : null}
        <ChevronDown
          className={cn(
            'text-muted-foreground/60 size-3.5 shrink-0 transition-transform',
            ouvert && 'rotate-180',
          )}
          strokeWidth={2.5}
        />
      </button>

      {ouvert && detail ? (
        <div className="space-y-3 px-3 pt-1 pb-3">
          {detail.error ? (
            <p className="text-destructive text-[12px] font-semibold">{detail.error}</p>
          ) : null}

          <Section titre={`À produire (${detail.relances.length})`}>
            {detail.relances.length === 0 ? (
              <p className="text-muted-foreground text-[12px] font-semibold">
                Rien n&apos;était à relancer ce jour-là.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {detail.relances.map((relance) => (
                  <li key={relance.productId} className="flex items-center gap-2 text-[12px]">
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full',
                        relance.isDone
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted-foreground/20',
                      )}
                    >
                      {relance.isDone ? <Check className="size-2.5" strokeWidth={4} /> : null}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate font-bold',
                        !relance.isDone && 'text-muted-foreground',
                      )}
                    >
                      {relance.productName}
                    </span>
                    {relance.isCritical ? (
                      <span className="text-destructive shrink-0 text-[10px] font-black">
                        CRITIQUE
                      </span>
                    ) : null}
                    <span className="w-10 shrink-0 text-right font-black tabular-nums">
                      {formatQty(relance.qty)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section titre="Dans les frigos">
            <ul className="space-y-0.5">
              {detail.stocks.map((ligne) => (
                <li key={ligne.productId} className="flex items-center gap-2 text-[12px]">
                  <span className="min-w-0 flex-1 truncate font-bold">{ligne.productName}</span>
                  <span className="text-muted-foreground w-9 shrink-0 text-right tabular-nums">
                    {ligne.inSaladbar ? formatQty(ligne.qtySaladbar) : '·'}
                  </span>
                  <span className="text-muted-foreground w-9 shrink-0 text-right tabular-nums">
                    {ligne.inFridge ? formatQty(ligne.qtyFridge) : '·'}
                  </span>
                  <span className="text-muted-foreground w-9 shrink-0 text-right tabular-nums">
                    {ligne.inDesserts ? formatQty(ligne.qtyDesserts) : '·'}
                  </span>
                  <span className="w-9 shrink-0 text-right font-black tabular-nums">
                    {formatQty(ligne.qtyTotal)}
                  </span>
                  <span className="w-8 shrink-0 text-right">
                    {ligne.etat === 'surplus' || ligne.etat === 'surplus_fort' ? (
                      <TriangleAlert
                        className={cn(
                          'ml-auto size-3',
                          ligne.etat === 'surplus_fort' ? 'text-destructive' : 'text-alert-foreground',
                        )}
                        strokeWidth={3}
                      />
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Link
            href={comptage.href}
            className="text-primary block pt-1 text-[12px] font-black underline underline-offset-2"
          >
            Ouvrir le rapport complet
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-muted-foreground mb-1 text-[10px] font-black tracking-wide uppercase">
        {titre}
      </h4>
      {children}
    </section>
  );
}
