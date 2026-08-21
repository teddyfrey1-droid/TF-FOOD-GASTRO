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
      {/* Vert franc mais posé : le CA reste le chiffre le plus important de
          l'écran sans en occuper la moitié. */}
      {/* Serré : mêmes corps de texte, moins d'air entre eux. La carte
          tient dans moins de hauteur sans rien perdre en lisibilité. */}
      <Card className="bg-primary/10 border-primary/25 rounded-3xl px-5 py-4">
        <p className="text-primary text-sm font-black tracking-wide uppercase">
          CA prévisionnel du jour
        </p>
        <p className="text-primary mt-1 text-[2.75rem] leading-none font-black tracking-tight tabular-nums">
          {formatEuro(forecast)}
        </p>

        {forecast === null ? (
          <p className="text-muted-foreground mt-2.5 text-[13px] leading-snug">
            Aucun CA de référence pour l&apos;an dernier à cette date : la production ne peut pas
            être calculée aujourd&apos;hui.
          </p>
        ) : (
          /* D'où vient le chiffre, en gras et détaché : c'est ce qui permet
             de juger si la prévision est crédible avant de lancer la
             production. Le montant est le CA RÉELLEMENT ENCAISSÉ l'an
             dernier, avant majoration — sans lui, le taux de croissance ne
             se contrôle pas. */
          <div className="border-primary/20 mt-3 border-t pt-3">
            <p className="text-muted-foreground text-[11px] font-black tracking-wide uppercase">
              L&apos;an dernier, avant majoration
            </p>
            <p className="mt-0.5 text-[15px] leading-snug font-bold">
              {anDernier ? formatEuro(anDernier.revenueHt) : '—'}{' '}
              <span className="text-muted-foreground font-semibold">
                {anDernier
                  ? `le ${formatDateLong(anDernier.jour).replace(/ \d{4}$/, '')}`
                  : 'aucune journée comparable'}
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-[13px] leading-snug font-semibold">
              Majoré du taux de croissance ci-contre pour donner la prévision.
            </p>
          </div>
        )}

        <div className="text-muted-foreground border-primary/20 mt-3 flex items-center gap-2 border-t pt-2.5 text-[11px] font-medium">
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

      <GrowthCard currentRate={growthRate} windows={windows} />
    </section>
  );
}
