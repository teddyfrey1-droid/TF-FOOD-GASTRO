import { CalendarCheck2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { GrowthCard, type GrowthWindow } from '@/components/admin/growth-card';
import { formatDateLong, formatEuro } from '@/lib/format';

/**
 * Le chiffre d'affaires du jour, prévision et provenance.
 *
 * Ce bloc décide de toute la production : il vit désormais sur l'accueil,
 * pour que le directeur voie en ouvrant l'application ce qui est annoncé
 * aujourd'hui, et juge tout de suite si c'est cohérent. Il ne s'affiche
 * que pour un directeur ou le propriétaire — et la base refuserait de
 * toute façon de servir ces chiffres à quelqu'un d'autre.
 */
export function BlocChiffreAffaires({
  forecast,
  anDernier,
  growthRate,
  windows,
  coverage,
}: {
  forecast: number | null;
  /** CA brut de l'an dernier, avec la date réellement retenue. */
  anDernier: { jour: string; revenueHt: number } | null;
  growthRate: number;
  windows: GrowthWindow[];
  coverage: { days: number; lastDate: string | null };
}) {

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Vert franc mais posé : le CA reste le chiffre le plus important
          de l'écran sans en occuper la moitié.

          Serré : deux filets et cinq espacements différents découpaient la
          carte en tranches et la faisaient paraître vide. Un seul filet,
          des marges régulières — les corps de texte ne bougent pas, c'est
          l'air entre eux qui se resserre. */}
      <Card className="bg-primary/10 border-primary/25 rounded-3xl px-5 py-3">
        <p className="text-primary text-sm font-black tracking-wide uppercase">
          CA prévisionnel du jour
        </p>

        {/* Une respiration très lente plutôt qu'un clignotement : le
            chiffre attire l'œil au premier coup d'œil sans devenir
            fatigant, et l'animation se coupe d'elle-même pour qui a
            demandé moins de mouvement dans son système. */}
        <p className="text-primary animation-respire text-[3.1rem] leading-[1.05] font-black tracking-tight tabular-nums">
          {formatEuro(forecast)}
        </p>

        {forecast === null ? (
          <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug">
            Aucun CA de référence pour l&apos;an dernier à cette date : la production ne peut pas
            être calculée aujourd&apos;hui.
          </p>
        ) : (
          /* D'où vient le chiffre : c'est ce qui permet de juger si la
             prévision est crédible avant de lancer la production. Le
             montant est le CA RÉELLEMENT ENCAISSÉ l'an dernier, avant
             majoration — sans lui, le taux de croissance ne se contrôle
             pas.

             Intitulé et montant sur la même ligne : empilés, ils
             ajoutaient une rupture là où il n'y a qu'une seule idée. */
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="bg-foreground/10 text-foreground rounded-md px-2 py-0.5 text-[12px] font-black tracking-wide uppercase">
              L&apos;an dernier
            </span>
            <span className="bg-background ring-border rounded-full px-3 py-0.5 text-[18px] leading-snug font-black ring-1">
              {anDernier ? formatEuro(anDernier.revenueHt) : '—'}
            </span>
            <span className="text-muted-foreground text-[13px] font-bold">
              {anDernier
                ? formatDateLong(anDernier.jour).replace(/ \d{4}$/, '')
                : 'aucune journée comparable'}
            </span>
          </div>
        )}

        <div className="text-muted-foreground border-primary/20 mt-2 flex items-center gap-1.5 border-t pt-1.5 text-[11px] font-medium">
          <CalendarCheck2 className="size-3.5 shrink-0" />
          {coverage.days > 0 ? (
            <span>
              {coverage.days.toLocaleString('fr-FR')} journées de CA en base, jusqu&apos;au{' '}
              {formatDateLong(coverage.lastDate!).replace(/^\w+ /, '')}
            </span>
          ) : (
            <span>Aucun chiffre d&apos;affaires chargé.</span>
          )}
        </div>
      </Card>

      <GrowthCard currentRate={growthRate} windows={windows} />
    </section>
  );
}
