import { CalendarCheck2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { GrowthCard, type GrowthWindow } from '@/components/admin/growth-card';
import { formatDateLong, formatEuro } from '@/lib/format';
import { referenceDateLastYear } from '@/lib/mep';

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
  today,
  forecast,
  reference,
  growthRate,
  windows,
  totals,
  coverage,
}: {
  today: string;
  forecast: number | null;
  reference: number | null;
  growthRate: number;
  windows: GrowthWindow[];
  totals: { actual: number; reference: number } | null;
  coverage: { days: number; lastDate: string | null };
}) {
  const jourDeReference = formatDateLong(referenceDateLastYear(today)).replace(/ \d{4}$/, '');

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Vert franc mais posé : le CA reste le chiffre le plus important de
          l'écran sans en occuper la moitié. */}
      <Card className="bg-primary/10 border-primary/25 rounded-3xl px-6 py-5">
        <p className="text-primary text-sm font-black tracking-wide uppercase">
          CA prévisionnel du jour
        </p>
        <p className="text-primary mt-2 text-[2.75rem] leading-none font-black tracking-tight tabular-nums">
          {formatEuro(forecast)}
        </p>

        {forecast === null ? (
          <p className="text-muted-foreground mt-3 text-[13px] leading-snug">
            Aucun CA de référence pour l&apos;an dernier à cette date : la production ne peut pas
            être calculée aujourd&apos;hui.
          </p>
        ) : (
          /* D'où vient le chiffre, en gras et détaché : c'est ce qui permet
             de juger si la prévision est crédible avant de lancer la
             production. Le montant de l'an dernier est donné NU, avant
             majoration — sans lui, le taux de croissance ne se contrôle
             pas. */
          <div className="border-primary/20 mt-4 border-t pt-3.5">
            <p className="text-muted-foreground text-[11px] font-black tracking-wide uppercase">
              L&apos;an dernier, avant majoration
            </p>
            <p className="mt-1 text-[15px] leading-snug font-bold">
              {formatEuro(reference)}{' '}
              <span className="text-muted-foreground font-semibold">le {jourDeReference}</span>
            </p>
            <p className="text-muted-foreground mt-1.5 text-[13px] leading-snug font-semibold">
              Majoré du taux de croissance ci-contre pour donner la prévision.
            </p>
          </div>
        )}

        <div className="text-muted-foreground border-primary/20 mt-4 flex items-center gap-2 border-t pt-3.5 text-[11px] font-medium">
          <CalendarCheck2 className="size-4 shrink-0" />
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

      <GrowthCard currentRate={growthRate} windows={windows} totals={totals} />
    </section>
  );
}
