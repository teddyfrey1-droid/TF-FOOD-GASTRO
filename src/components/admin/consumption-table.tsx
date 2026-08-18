import { Card } from '@/components/ui/card';
import { formatPercent, formatQty } from '@/lib/format';
import type { ConsumptionReport } from '@/lib/admin/history';
import { ApplyObservedRatioButton } from './apply-observed-ratio';

/**
 * §5.7 — Ce que la cuisine consomme réellement, face à ce que le calculateur
 * prévoit.
 *
 * Le chiffre d'affaires étant enregistré à la journée, la colonne de
 * référence est la consommation du midi rapportée au CA de la journée :
 * entièrement mesurée. L'extrapolation sur la journée entière, elle, dépend
 * d'un réglage et est signalée comme telle.
 */
export function ConsumptionTable({ report }: { report: ConsumptionReport }) {
  const withData = report.rows.filter((row) => row.sampleDays > 0);

  if (withData.length === 0) {
    return (
      <Card className="space-y-2 p-8 text-center text-sm">
        <p>Pas encore de consommation mesurable.</p>
        <p className="text-muted-foreground">
          Il faut, pour une même journée : le comptage du matin validé, celui de l&apos;après-midi
          validé, et le <strong>chiffre d&apos;affaires de la journée</strong> saisi dans
          l&apos;onglet Chiffre d&apos;affaires.
        </p>
      </Card>
    );
  }

  const canExtrapolate = report.lunchShare !== null || report.hasMeasuredLunchRevenue;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Gastros consommés pendant le service du midi, rapportés au chiffre d&apos;affaires de la
        journée. Calculé sur les jours où les deux comptages ont été validés et où le CA du jour
        est connu.
      </p>

      {!canExtrapolate ? (
        <Card className="border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p>
            La colonne <strong>« journée entière »</strong> reste vide : elle demande de savoir
            quelle part du chiffre d&apos;affaires se fait au déjeuner.
          </p>
          <p className="text-muted-foreground mt-2">
            Renseignez-la dans <strong>Chiffre d&apos;affaires → Réglages</strong>. C&apos;est ce
            qui permet de comparer la consommation réelle à la cible du calculateur, laquelle
            dimensionne une journée complète.
          </p>
        </Card>
      ) : null}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th scope="col" className="px-4 py-3 text-left font-semibold">
                Produit
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Consommé au midi
                <span className="text-muted-foreground block text-[11px] font-normal">
                  / 1 000 € de CA journée · mesuré
                </span>
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Journée entière
                <span className="text-muted-foreground block text-[11px] font-normal">
                  {report.hasMeasuredLunchRevenue ? 'depuis le CA du midi' : 'estimé'}
                </span>
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Cible calculateur
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Marge
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Jours
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold" />
            </tr>
          </thead>

          <tbody>
            {withData.map((row) => (
              <tr key={row.productId} className="hover:bg-muted/30 border-b last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {row.productName}
                </th>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatQty(row.lunchPerDaily1000)}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {formatQty(row.fullDayPer1000)}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {formatQty(row.theoreticalPer1000)}
                </td>
                <td
                  className={
                    row.deviation !== null && row.deviation < 0
                      ? 'text-destructive px-3 py-2 text-right font-medium tabular-nums'
                      : 'px-3 py-2 text-right tabular-nums'
                  }
                >
                  {row.deviation === null
                    ? '—'
                    : `${row.deviation >= 0 ? '+' : ''}${formatPercent(row.deviation, 0)}`}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right text-xs tabular-nums">
                  {row.sampleDays}
                </td>
                <td className="px-4 py-2 text-right">
                  {row.fullDayPer1000 !== null ? (
                    <ApplyObservedRatioButton
                      productId={row.productId}
                      productName={row.productName}
                      observedPer1000={row.fullDayPer1000}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="text-muted-foreground space-y-1 text-xs">
        <p>
          <strong>Marge</strong> = écart entre la cible du calculateur et la consommation
          constatée. Une marge positive est normale : la cible intègre volontairement de la
          sécurité. Une marge <span className="text-destructive font-medium">négative</span>{' '}
          signale une cible trop basse — on a consommé plus que prévu, donc frôlé la rupture.
        </p>
        <p>
          « Cible calculateur » n&apos;est renseignée que pour les produits réglés au ratio.
          Appliquer le ratio constaté bascule le produit en mode ratio et crée une nouvelle version
          du calculateur — l&apos;historique n&apos;est pas réécrit.
        </p>
      </div>
    </div>
  );
}
