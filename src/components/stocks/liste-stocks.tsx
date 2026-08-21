'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search, TriangleAlert } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { formatQty } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface LigneStock {
  productId: string;
  productName: string;
  categoryName: string;
  qtySaladbar: number;
  qtyFridge: number;
  qtyDesserts: number;
  qtyTotal: number;
  inSaladbar: boolean;
  inFridge: boolean;
  inDesserts: boolean;
  etat: 'rupture' | 'juste' | 'ok' | 'surplus' | 'surplus_fort' | 'absent' | 'reporte';
  surplus: number;
}

/**
 * Les groupes, du plus urgent au moins urgent.
 *
 * L'ordre EST l'information : ce qui manque d'abord, ce qui déborde
 * ensuite, le reste après. Les deux premiers s'ouvrent tout seuls, le
 * gros du stock reste replié — trente-six lignes d'un coup ne se
 * trient pas d'un coup d'œil, et 90 % d'entre elles n'appellent aucune
 * décision.
 */
const GROUPES = [
  {
    cle: 'rupture' as const,
    titre: 'En rupture',
    detail: 'à zéro ou presque — à produire en premier',
    etats: ['rupture'],
    ouvertParDefaut: true,
    pastille: 'bg-destructive',
    surface: 'border-destructive/30 bg-destructive/[0.05]',
  },
  {
    cle: 'juste' as const,
    titre: 'Juste',
    detail: 'sous le minimum de relance',
    etats: ['juste'],
    ouvertParDefaut: true,
    pastille: 'bg-alert-foreground/70',
    surface: 'border-alert-border bg-alert/40',
  },
  {
    cle: 'trop' as const,
    titre: 'En trop',
    detail: 'au-dessus de la cible — à surveiller',
    etats: ['surplus_fort', 'surplus'],
    ouvertParDefaut: true,
    pastille: 'bg-alert-foreground/70',
    surface: 'border-alert-border bg-alert/40',
  },
  {
    cle: 'ok' as const,
    titre: 'Ce qui va bien',
    detail: 'rien à faire',
    etats: ['ok'],
    ouvertParDefaut: false,
    pastille: 'bg-primary',
    surface: '',
  },
  {
    cle: 'hors' as const,
    titre: 'Absents ou reportés',
    detail: 'non relevés ce jour-là',
    etats: ['absent', 'reporte'],
    ouvertParDefaut: false,
    pastille: 'bg-muted-foreground/40',
    surface: '',
  },
];

const normalise = (texte: string) =>
  texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Ce qu'il y a dans les frigos, rangé par urgence.
 *
 * Une seule liste de trente-six produits obligeait à tout lire pour
 * trouver les trois qui manquent. Les groupes font le tri à la place de
 * l'œil ; la recherche, elle, traverse tout et ouvre ce qu'il faut.
 */
export function ListeStocks({ lignes }: { lignes: LigneStock[] }) {
  const [recherche, setRecherche] = useState('');
  const [replies, setReplies] = useState<Record<string, boolean>>({});

  const filtrees = useMemo(() => {
    const aiguille = normalise(recherche.trim());
    if (!aiguille) return lignes;
    return lignes.filter(
      (ligne) =>
        normalise(ligne.productName).includes(aiguille) ||
        normalise(ligne.categoryName).includes(aiguille),
    );
  }, [lignes, recherche]);

  const groupes = GROUPES.map((groupe) => ({
    ...groupe,
    // Le surplus le plus fort en tête de son groupe, le reste par nom.
    items: filtrees
      .filter((ligne) => groupe.etats.includes(ligne.etat))
      .sort(
        (a, b) =>
          Number(b.surplus) - Number(a.surplus) ||
          a.productName.localeCompare(b.productName, 'fr'),
      ),
  })).filter((groupe) => groupe.items.length > 0);

  const enRecherche = recherche.trim() !== '';

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2" />
        <Input
          value={recherche}
          onChange={(evenement) => setRecherche(evenement.target.value)}
          placeholder="Rechercher un produit…"
          autoCapitalize="none"
          autoCorrect="off"
          className="h-13 rounded-2xl pl-12 text-base font-semibold"
        />
      </div>

      {groupes.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm font-semibold">
          {enRecherche ? `Aucun produit « ${recherche} ».` : 'Aucun produit relevé.'}
        </p>
      ) : null}

      {groupes.map((groupe) => {
        // Une recherche ouvre tout : masquer un résultat derrière un
        // groupe replié reviendrait à ne pas l'avoir trouvé.
        const ouvert = enRecherche || (replies[groupe.cle] ?? groupe.ouvertParDefaut);

        return (
          <Card key={groupe.cle} className={cn('overflow-hidden rounded-3xl p-0', groupe.surface)}>
            <button
              type="button"
              disabled={enRecherche}
              onClick={() =>
                setReplies((actuel) => ({
                  ...actuel,
                  [groupe.cle]: !(actuel[groupe.cle] ?? groupe.ouvertParDefaut),
                }))
              }
              aria-expanded={ouvert}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
            >
              <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', groupe.pastille)} />

              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-tight font-black">
                  {groupe.titre}{' '}
                  <span className="tabular-nums">({groupe.items.length})</span>
                </span>
                <span className="text-muted-foreground mt-0.5 block text-[11px] font-semibold">
                  {groupe.detail}
                </span>
              </span>

              {enRecherche ? null : (
                <ChevronDown
                  className={cn(
                    'text-muted-foreground/60 size-4 shrink-0 transition-transform',
                    ouvert && 'rotate-180',
                  )}
                  strokeWidth={2.5}
                />
              )}
            </button>

            {ouvert ? (
              <>
                <div className="text-muted-foreground bg-background/60 flex items-center gap-2 border-y px-3 py-1.5 text-[10px] font-black tracking-wide uppercase">
                  <span className="min-w-0 flex-1">Produit</span>
                  <span className="w-10 text-right">Salad.</span>
                  <span className="w-10 text-right">Bas</span>
                  <span className="w-10 text-right">Des.</span>
                  <span className="w-11 text-right">Total</span>
                </div>

                <ul className="divide-y">
                  {groupe.items.map((ligne) => (
                    <li key={ligne.productId} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] leading-tight font-bold">
                          {ligne.productName}
                        </span>
                        <span className="text-muted-foreground block truncate text-[10px] font-semibold">
                          {ligne.categoryName}
                          {ligne.etat === 'surplus' || ligne.etat === 'surplus_fort'
                            ? ` · ${formatQty(ligne.surplus)} de trop`
                            : ''}
                        </span>
                      </span>

                      <Quantite valeur={ligne.qtySaladbar} presente={ligne.inSaladbar} />
                      <Quantite valeur={ligne.qtyFridge} presente={ligne.inFridge} />
                      <Quantite valeur={ligne.qtyDesserts} presente={ligne.inDesserts} />

                      <span
                        className={cn(
                          'w-11 text-right text-[15px] font-black tabular-nums',
                          ligne.etat === 'rupture' && 'text-destructive',
                          ligne.etat === 'surplus_fort' && 'text-destructive',
                        )}
                      >
                        {ligne.etat === 'absent' || ligne.etat === 'reporte'
                          ? '—'
                          : formatQty(ligne.qtyTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

/** Un point vaut mieux qu'un zéro là où le produit n'est pas rangé. */
function Quantite({ valeur, presente }: { valeur: number; presente: boolean }) {
  return (
    <span
      className={cn(
        'w-10 text-right text-[13px] font-bold tabular-nums',
        presente ? 'text-muted-foreground' : 'text-muted-foreground/30',
      )}
    >
      {presente ? formatQty(valeur) : '·'}
    </span>
  );
}

/**
 * Le bandeau d'en-tête : deux nombres, et rien d'autre.
 *
 * Il répond à la seule question qu'on se pose en ouvrant l'écran —
 * est-ce qu'il manque quelque chose, est-ce qu'il y a du gâchis — et
 * laisse le détail aux groupes en dessous.
 */
export function ResumeStocks({ lignes }: { lignes: LigneStock[] }) {
  const manquants = lignes.filter(
    (ligne) => ligne.etat === 'rupture' || ligne.etat === 'juste',
  ).length;
  const enTrop = lignes.filter(
    (ligne) => ligne.etat === 'surplus' || ligne.etat === 'surplus_fort',
  ).length;

  if (manquants === 0 && enTrop === 0) {
    return (
      <div className="border-primary/25 bg-primary/10 text-primary mb-3 flex items-center gap-2.5 rounded-2xl border px-4 py-3">
        <span aria-hidden className="bg-primary size-2.5 rounded-full" />
        <p className="text-[15px] font-black">Tout est dans les clous.</p>
      </div>
    );
  }

  return (
    <div className="mb-3 grid grid-cols-2 gap-2.5">
      <Chiffre
        valeur={manquants}
        libelle="sous le seuil"
        alerte={manquants > 0}
        rouge
      />
      <Chiffre valeur={enTrop} libelle="en trop" alerte={enTrop > 0} />
    </div>
  );
}

function Chiffre({
  valeur,
  libelle,
  alerte,
  rouge,
}: {
  valeur: number;
  libelle: string;
  alerte: boolean;
  rouge?: boolean;
}) {
  return (
    <Card
      className={cn(
        'flex items-center gap-3 rounded-2xl p-3.5',
        alerte && rouge && 'border-destructive/30 bg-destructive/[0.06]',
        alerte && !rouge && 'border-alert-border bg-alert',
      )}
    >
      {alerte && !rouge ? (
        <TriangleAlert className="text-alert-foreground size-5 shrink-0" strokeWidth={2.8} />
      ) : null}
      <p
        className={cn(
          'text-2xl leading-none font-black tabular-nums',
          alerte && rouge && 'text-destructive',
          alerte && !rouge && 'text-alert-foreground',
        )}
      >
        {valeur}
      </p>
      <p
        className={cn(
          'text-[11px] leading-tight font-bold',
          alerte && !rouge ? 'text-alert-foreground/80' : 'text-muted-foreground',
        )}
      >
        {libelle}
      </p>
    </Card>
  );
}
