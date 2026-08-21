'use client';

import { useMemo, useState } from 'react';
import { Search, TriangleAlert } from 'lucide-react';
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
  qtyTotal: number;
  inSaladbar: boolean;
  inFridge: boolean;
  etat: 'rupture' | 'juste' | 'ok' | 'surplus' | 'surplus_fort' | 'absent' | 'reporte';
  surplus: number;
}

const normalise = (texte: string) =>
  texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Ce qu'il y a réellement dans les frigos, produit par produit.
 *
 * L'application ne montrait que ce qu'il reste à FAIRE. Or la question du
 * passe est souvent l'autre : « il y a combien de saumon, au juste ? ».
 * Sans réponse, on redescend vérifier — ou on produit dans le doute.
 *
 * Ces chiffres sont ceux que l'équipe a saisis elle-même : ils lui
 * reviennent. Aucune cible, aucun seuil n'apparaît ici ; l'état est
 * calculé en base et n'arrive que sous forme de mot.
 */
export function ListeStocks({ lignes }: { lignes: LigneStock[] }) {
  const [recherche, setRecherche] = useState('');

  const filtrees = useMemo(() => {
    const aiguille = normalise(recherche.trim());
    if (!aiguille) return lignes;
    return lignes.filter(
      (ligne) =>
        normalise(ligne.productName).includes(aiguille) ||
        normalise(ligne.categoryName).includes(aiguille),
    );
  }, [lignes, recherche]);

  const aSurveiller = lignes.filter(
    (ligne) => ligne.etat === 'surplus' || ligne.etat === 'surplus_fort',
  );
  const beaucoupTrop = lignes.filter((ligne) => ligne.etat === 'surplus_fort');
  const manquants = lignes.filter((ligne) => ligne.etat === 'rupture' || ligne.etat === 'juste');

  return (
    <div className="space-y-4">
      {/* Ce qui mérite un œil, avant la liste complète. Le surplus est la
          nouveauté : jusqu'ici rien ne signalait qu'on avait trop produit,
          et le bac partait à la poubelle deux jours plus tard. */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card
          className={cn(
            'rounded-2xl p-3.5',
            manquants.length > 0 && 'border-destructive/30 bg-destructive/[0.06]',
          )}
        >
          <p className="text-muted-foreground text-[10px] font-black tracking-wide uppercase">
            Sous le seuil
          </p>
          <p
            className={cn(
              'mt-0.5 text-2xl leading-none font-black tabular-nums',
              manquants.length > 0 && 'text-destructive',
            )}
          >
            {manquants.length}
          </p>
          <p className="text-muted-foreground mt-1 text-[11px] font-medium">
            {manquants.length === 0 ? 'rien ne manque' : 'à produire en priorité'}
          </p>
        </Card>

        <Card
          className={cn(
            'rounded-2xl p-3.5',
            aSurveiller.length > 0 && 'border-alert-border bg-alert',
          )}
        >
          <p
            className={cn(
              'text-[10px] font-black tracking-wide uppercase',
              aSurveiller.length > 0 ? 'text-alert-foreground/70' : 'text-muted-foreground',
            )}
          >
            À surveiller
          </p>
          <p
            className={cn(
              'mt-0.5 flex items-center gap-1.5 text-2xl leading-none font-black tabular-nums',
              aSurveiller.length > 0 && 'text-alert-foreground',
            )}
          >
            {aSurveiller.length > 0 ? (
              <TriangleAlert className="size-5" strokeWidth={2.8} />
            ) : null}
            {aSurveiller.length}
          </p>
          <p
            className={cn(
              'mt-1 text-[11px] font-medium',
              aSurveiller.length > 0 ? 'text-alert-foreground/80' : 'text-muted-foreground',
            )}
          >
            {aSurveiller.length === 0
              ? 'aucun surplus'
              : beaucoupTrop.length > 0
                ? `dont ${beaucoupTrop.length} en trop grande quantité`
                : 'plus que nécessaire'}
          </p>
        </Card>
      </div>

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

      {filtrees.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed p-8 text-center text-sm font-semibold">
          Aucun produit « {recherche} ».
        </p>
      ) : (
        <Card className="overflow-hidden rounded-3xl p-0">
          <div className="bg-muted/60 text-muted-foreground sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-2 text-[10px] font-black tracking-wide uppercase backdrop-blur">
            <span className="min-w-0 flex-1">Produit</span>
            <span className="w-12 text-right">Salad.</span>
            <span className="w-12 text-right">Frigo</span>
            <span className="w-12 text-right">Total</span>
            <span className="w-20 text-right">État</span>
          </div>

          <ul className="divide-y">
            {filtrees.map((ligne) => (
              <li
                key={ligne.productId}
                className={cn(
                  'flex items-center gap-2 px-3 py-2',
                  ligne.etat === 'surplus' && 'bg-alert/50',
                  ligne.etat === 'surplus_fort' && 'bg-alert ring-alert-border ring-1 ring-inset',
                  ligne.etat === 'rupture' && 'bg-destructive/[0.06]',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-tight font-bold">
                    {ligne.productName}
                  </span>
                  <span className="text-muted-foreground block truncate text-[10px] font-semibold">
                    {ligne.categoryName}
                  </span>
                </span>

                <Quantite valeur={ligne.qtySaladbar} presente={ligne.inSaladbar} />
                <Quantite valeur={ligne.qtyFridge} presente={ligne.inFridge} />

                <span className="w-12 text-right text-[15px] font-black tabular-nums">
                  {formatQty(ligne.qtyTotal)}
                </span>

                <span className="w-20 text-right">
                  <EtiquetteEtat etat={ligne.etat} surplus={ligne.surplus} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** Un point vaut mieux qu'un zéro là où le produit n'est pas rangé. */
function Quantite({ valeur, presente }: { valeur: number; presente: boolean }) {
  return (
    <span
      className={cn(
        'w-12 text-right text-[13px] font-bold tabular-nums',
        presente ? 'text-muted-foreground' : 'text-muted-foreground/30',
      )}
    >
      {presente ? formatQty(valeur) : '·'}
    </span>
  );
}

const ETATS = {
  rupture: { texte: 'Rupture', classe: 'bg-destructive/15 text-destructive' },
  juste: { texte: 'Juste', classe: 'bg-alert text-alert-foreground' },
  ok: { texte: 'OK', classe: 'text-primary' },
  absent: { texte: 'Absent', classe: 'text-muted-foreground/60' },
  reporte: { texte: 'Reporté', classe: 'text-muted-foreground/60' },
} as const;

function EtiquetteEtat({ etat, surplus }: { etat: LigneStock['etat']; surplus: number }) {
  // Deux saumons de trop se rattrapent au service du soir ; le double de
  // la cible, non — c'est un bac entier qui finira à la poubelle. D'où
  // deux niveaux : l'un se remarque, l'autre se voit de loin.
  if (etat === 'surplus' || etat === 'surplus_fort') {
    const fort = etat === 'surplus_fort';
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-black tabular-nums',
          fort
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-alert-foreground/15 text-alert-foreground',
        )}
      >
        <TriangleAlert className="size-3" strokeWidth={3} />+{formatQty(surplus)}
      </span>
    );
  }

  const style = ETATS[etat];
  return (
    <span className={cn('inline-block rounded-full px-2 py-0.5 text-[12px] font-black', style.classe)}>
      {style.texte}
    </span>
  );
}
