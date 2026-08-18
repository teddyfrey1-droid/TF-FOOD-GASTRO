import { Card } from '@/components/ui/card';
import { formatPercent, formatQty } from '@/lib/format';
import type { ConsumptionReport } from '@/lib/admin/history';
import { ApplyObservedRatioButton } from './apply-observed-ratio';

/**
 * §5.7 — Ce que la cuisine consomme réellement à chaque service, face à ce que
 * le calculateur prévoit.
 *
 * Tout ici est mesuré : les deux comptages encadrent le service du midi, et le
 * comptage du lendemain matin ferme celui du soir puisque les invendus ne sont
 * pas jetés.
 */
export function ConsumptionTable({ report }: { report: ConsumptionReport }) {
  const withData = report.rows.filter((row) => row.completeDays > 0 || row.lunchOnlyDays > 0);

  if (withData.length === 0) {
    return (
      <Card className="space-y-2 p-8 text-center text-sm">
        <p>Pas encore de consommation mesurable.</p>
        <p className="text-muted-foreground">
          Il faut, pour une même journée : les <strong>deux comptages validés</strong> et le{' '}
          <strong>chiffre d&apos;affaires du jour</strong> saisi. Le service du soir se mesure
          grâce au comptage du <strong>lendemain matin</strong> — c&apos;est lui qui dit ce qui
          restait après la fermeture.
        </p>
      </Card>
    );
  }

  const eveningRatio = report.overallEveningRatio;

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Gastros réellement consommés à chaque service, en moyenne sur la période.{' '}
        {report.completeDays} journée{report.completeDays > 1 ? 's' : ''} entièrement mesurée
        {report.completeDays > 1 ? 's' : ''}.
      </p>

      {eveningRatio !== null ? (
        <Card className="p-4 text-sm">
          <p>
            Sur cette période, le service du soir consomme{' '}
            <strong>{Math.round(eveningRatio * 100)} %</strong> de ce que consomme le midi.
          </p>
          <p className="text-muted-foreground mt-2">
            {eveningRatio < 0.9
              ? `Le soir est plus calme que le midi. Vous pouvez abaisser le « coefficient de l'après-midi » vers ${eveningRatio.toFixed(2).replace('.', ',')} dans Chiffre d'affaires → Réglages : les cibles du soir baisseront d'autant, et la surproduction avec.`
              : eveningRatio > 1.1
                ? `Le soir consomme plus que le midi. Un coefficient d'après-midi inférieur à 1 ferait courir un risque de rupture.`
                : `Les deux services se valent : le coefficient d'après-midi à 1,0 est le bon réglage.`}
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
                Midi
                <span className="text-muted-foreground block text-[11px] font-normal">
                  gastros / jour
                </span>
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Soir
                <span className="text-muted-foreground block text-[11px] font-normal">
                  gastros / jour
                </span>
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Soir / midi
              </th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">
                Journée
                <span className="text-muted-foreground block text-[11px] font-normal">
                  / 1 000 € de CA
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
                  {formatQty(row.lunchAvg)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatQty(row.eveningAvg)}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {row.eveningRatio === null ? '—' : formatPercent(row.eveningRatio, 0)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatQty(row.dailyPer1000)}
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
                  {row.completeDays}
                  {row.lunchOnlyDays > 0 ? (
                    <span title="journées où seul le midi a pu être mesuré">
                      {' '}
                      (+{row.lunchOnlyDays})
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-right">
                  {row.dailyPer1000 !== null ? (
                    <ApplyObservedRatioButton
                      productId={row.productId}
                      productName={row.productName}
                      observedPer1000={row.dailyPer1000}
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
          <strong>Soir</strong> se mesure grâce au comptage du lendemain matin : ce qui restait à
          la fermeture n&apos;étant pas jeté, le stock du lendemain dit exactement ce qui est parti
          le soir. La colonne <strong>Jours</strong> compte les journées entièrement mesurées ; le
          nombre entre parenthèses, celles où seul le midi a pu l&apos;être — typiquement la
          journée d&apos;hier, dont le lendemain n&apos;est pas encore compté.
        </p>
        <p>
          <strong>Marge</strong> = écart entre la cible du calculateur et la consommation d&apos;une
          journée. Une marge positive est normale : la cible intègre volontairement de la sécurité.
          Une marge <span className="text-destructive font-medium">négative</span> signale une
          cible trop basse — on a consommé plus que prévu, donc frôlé la rupture.
        </p>
      </div>
    </div>
  );
}
