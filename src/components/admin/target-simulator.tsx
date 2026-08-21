'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Info, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatEuro, formatQty } from '@/lib/format';
import { ceilTo } from '@/lib/mep';
import { cn } from '@/lib/utils';
import { runSimulation, type SimulationResult } from '@/app/admin/simulateur/simulate';

export interface FamilyInfo {
  family: string;
  label: string;
  referenceRevenue: number;
  targetMultiplier: number;
}

/** Des paliers qu'on atteint d'un pouce, sans clavier. */
const PALIERS = [3000, 4000, 5000, 6000, 7000];

function parseNumber(raw: string): number {
  return Number(raw.trim().replace(',', '.'));
}

/**
 * Le simulateur, pensé pour un téléphone tenu d'une main.
 *
 * Deux partis pris expliquent la forme :
 *
 * 1. **Une carte par produit, jamais un tableau.** Six colonnes sur un
 *    iPhone obligent à faire glisser l'écran de côté pour lire la relance,
 *    donc à perdre de vue le nom du produit. Ici chaque produit tient dans
 *    un bloc qu'on lit d'un coup d'œil.
 * 2. **Le stock se calcule sur le téléphone, pas sur le serveur.** Seul le
 *    chiffre d'affaires demande un aller-retour ; comparer un stock à un
 *    minimum est une soustraction. Taper un stock donne donc un résultat
 *    instantané, même sur un réseau capricieux.
 */
export function TargetSimulator({ families }: { families: FamilyInfo[] }) {
  const [revenue, setRevenue] = useState('4000');
  const [stocks, setStocks] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [recherche, setRecherche] = useState('');
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const [pending, startTransition] = useTransition();

  const lancer = useCallback((ca: number) => {
    startTransition(async () => {
      setResult(await runSimulation({ caRef: ca }));
    });
  }, []);

  // Le chiffre d'affaires se recalcule tout seul, après une pause de frappe :
  // un bouton « Simuler » de plus à viser n'apporte rien.
  useEffect(() => {
    const valeur = parseNumber(revenue);
    if (!Number.isFinite(valeur) || valeur < 0) return;
    const minuteur = setTimeout(() => lancer(valeur), 450);
    return () => clearTimeout(minuteur);
  }, [revenue, lancer]);

  const lignes = useMemo(() => {
    const filtre = recherche.trim().toLowerCase();

    return (result?.lines ?? [])
      .filter(
        (ligne) =>
          filtre === '' ||
          ligne.productName.toLowerCase().includes(filtre) ||
          ligne.categoryName.toLowerCase().includes(filtre),
      )
      .map((ligne) => {
        const brut = stocks[ligne.productId];
        const saisi = brut !== undefined && brut.trim() !== '' ? parseNumber(brut) : null;
        const stock = saisi !== null && Number.isFinite(saisi) && saisi >= 0 ? saisi : null;
        const relance = stock !== null && stock < ligne.minimum;

        return {
          ...ligne,
          stock,
          relance,
          aProduire: relance ? Math.max(ceilTo(ligne.target - stock, 1), 0) : 0,
        };
      });
  }, [result, stocks, recherche]);

  const aRelancer = lignes.filter((ligne) => ligne.relance);
  const renseignes = lignes.filter((ligne) => ligne.stock !== null).length;

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------------
          Le chiffre d'affaires commande tout le reste : il occupe le haut
          de l'écran, en gros, avec ses paliers à portée de pouce.
         --------------------------------------------------------------- */}
      <Card className="rounded-3xl p-5">
        <label
          htmlFor="simulated-revenue"
          className="text-foreground block text-center text-[15px] font-black"
        >
          Chiffre d&apos;affaires simulé
        </label>

        {/* Centré : c'est la seule saisie de l'écran, et tout le reste en
            découle. Décalée à gauche, elle se lisait comme un champ de
            formulaire parmi d'autres. */}
        <div className="mt-2.5 flex items-center justify-center gap-2">
          <Input
            id="simulated-revenue"
            value={revenue}
            inputMode="decimal"
            onChange={(event) => setRevenue(event.target.value)}
            onFocus={(event) => event.target.select()}
            className="h-14 w-44 rounded-2xl text-center text-2xl! font-black tabular-nums"
          />
          <span className="text-muted-foreground text-base font-black">€ HT</span>
        </div>

        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {PALIERS.map((palier) => {
            const actif = parseNumber(revenue) === palier;
            return (
              <button
                key={palier}
                type="button"
                onClick={() => setRevenue(String(palier))}
                aria-pressed={actif}
                className={cn(
                  'h-9 rounded-full px-3 text-[13px] font-black tabular-nums transition-colors',
                  actif
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground active:bg-muted/70',
                )}
              >
                {palier.toLocaleString('fr-FR')}
              </button>
            );
          })}
        </div>

        {result?.error ? (
          <p role="alert" className="text-destructive mt-3 text-sm font-bold">
            {result.error}
          </p>
        ) : null}
      </Card>

      {/* ---------------------------------------------------------------
          Le verdict, avant la liste. C'est la seule ligne qu'on lit quand
          on teste un réglage : « à ce CA, combien de relances ? »
         --------------------------------------------------------------- */}
      <Card
        className={cn(
          'rounded-3xl p-5',
          aRelancer.length > 0 && 'bg-alert text-alert-foreground border-transparent',
        )}
      >
        {pending && result === null ? (
          <p className="text-2xl font-black">Calcul…</p>
        ) : renseignes === 0 ? (
          <>
            <p className="text-2xl leading-tight font-black">
              {lignes.length} produit{lignes.length > 1 ? 's' : ''} calculé
              {lignes.length > 1 ? 's' : ''}
            </p>
            <p className="text-muted-foreground mt-1 text-sm font-semibold">
              Saisissez un stock sous un produit pour voir la relance qui en découlerait.
            </p>
          </>
        ) : (
          <>
            <p className="text-2xl leading-tight font-black">
              {aRelancer.length === 0
                ? 'Aucune relance'
                : `${aRelancer.length} produit${aRelancer.length > 1 ? 's' : ''} à relancer`}
            </p>
            <p className="mt-1 text-sm font-semibold opacity-80">
              sur {renseignes} stock{renseignes > 1 ? 's' : ''} saisi{renseignes > 1 ? 's' : ''}
              {aRelancer.length > 0
                ? ` · ${formatQty(aRelancer.reduce((total, ligne) => total + ligne.aProduire, 0))} à produire en tout`
                : ''}
            </p>
          </>
        )}
      </Card>

      {/* Trente-sept produits ne se parcourent pas au pouce : on cherche. */}
      <div className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-4 size-5 -translate-y-1/2" />
        <Input
          value={recherche}
          onChange={(event) => setRecherche(event.target.value)}
          placeholder="Chercher un produit"
          aria-label="Chercher un produit"
          className="h-13 rounded-2xl pl-12 text-base font-semibold"
        />
      </div>

      {/* Une ligne par produit, sous un en-tête de colonnes.

          Chaque produit occupait une carte de 140 px avec ses intitulés
          répétés — il fallait dérouler trente écrans pour voir la carte
          entière. Les intitulés montent une fois en tête de liste, les
          lignes tombent à 44 px : on embrasse tout d'un coup d'œil, ce
          qui est précisément l'usage du simulateur. */}
      {lignes.length > 0 ? (
        <Card className="overflow-hidden rounded-3xl p-0">
          <div className="bg-muted/60 text-muted-foreground sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-2 text-[10px] font-black tracking-wide uppercase backdrop-blur">
            <span className="min-w-0 flex-1">Produit</span>
            <span className="w-11 text-right">Cible</span>
            <span className="w-11 text-right">Min</span>
            <span className="w-16 text-center">Stock</span>
            <span className="w-20 text-right">Relance</span>
          </div>

          <ul className="divide-y">
            {lignes.map((ligne) => (
              <li
                key={ligne.productId}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5',
                  ligne.relance && 'bg-alert/40',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] leading-tight font-bold">
                    {ligne.productName}
                  </span>
                  <span className="text-muted-foreground block truncate text-[10px] font-semibold">
                    {ligne.categoryName} · {ligne.unit === 'piece' ? 'pièce' : 'gastro'} · P
                    {ligne.priority}
                  </span>
                </span>

                <span className="w-11 text-right text-[15px] font-black tabular-nums">
                  {formatQty(ligne.target)}
                </span>
                <span className="text-muted-foreground w-11 text-right text-[15px] font-bold tabular-nums">
                  {formatQty(ligne.minimum)}
                </span>

                <Input
                  aria-label={`Stock de ${ligne.productName}`}
                  value={stocks[ligne.productId] ?? ''}
                  inputMode="decimal"
                  placeholder="—"
                  onFocus={(event) => event.target.select()}
                  onChange={(event) =>
                    setStocks((actuel) => ({
                      ...actuel,
                      [ligne.productId]: event.target.value,
                    }))
                  }
                  className="h-9 w-16 rounded-lg px-1 text-center text-[15px]! font-black tabular-nums"
                />

                <span className="w-20 text-right">
                  {ligne.stock === null ? (
                    <span className="text-muted-foreground/50 text-[13px] font-bold">—</span>
                  ) : ligne.relance ? (
                    <span className="bg-alert-foreground/15 text-alert-foreground inline-block rounded-full px-2 py-0.5 text-[13px] font-black tabular-nums">
                      +{formatQty(ligne.aProduire)}
                    </span>
                  ) : (
                    <span className="text-primary text-[13px] font-black">OK</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {lignes.length === 0 && result !== null && !result.error ? (
        <p className="text-muted-foreground rounded-3xl border border-dashed p-6 text-center text-sm font-semibold">
          Aucun produit ne correspond à « {recherche} ».
        </p>
      ) : null}

      {/* Le détail des bases n'intéresse qu'au moment de comprendre un
          chiffre qui surprend : replié par défaut. */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setDetailsOuverts((ouvert) => !ouvert)}
          className="text-muted-foreground flex items-center gap-2 text-sm font-bold"
        >
          <Info className="size-4" strokeWidth={2.5} />
          {detailsOuverts ? 'Masquer' : "D'où viennent ces chiffres ?"}
        </button>

        {detailsOuverts ? (
          <dl className="text-muted-foreground mt-3 space-y-2 text-sm">
            {families.map((family) => (
              <div key={family.family}>
                <dt className="text-foreground font-bold">{family.label}</dt>
                <dd>
                  base exprimée pour {formatEuro(family.referenceRevenue)}, multipliée par{' '}
                  {formatQty(family.targetMultiplier)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}
