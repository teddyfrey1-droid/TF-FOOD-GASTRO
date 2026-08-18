import { Card } from '@/components/ui/card';
import { formatPercent, formatQty } from '@/lib/format';
import type { ConsumptionRow } from '@/lib/admin/history';
import { ApplyObservedRatioButton } from './apply-observed-ratio';

/**
 * §5.7 — Ce que le calculateur prévoit, face à ce que la cuisine consomme
 * réellement. C'est ce qui permettra de recalibrer sur du réel plutôt que sur
 * du ressenti.
 */
export function ConsumptionTable({ rows }: { rows: ConsumptionRow[] }) {
  const withData = rows.filter((row) => row.sampleDays > 0);

  if (withData.length === 0) {
    return (
      <Card className="space-y-2 p-8 text-center text-sm">
        <p>Pas encore de consommation mesurable.</p>
        <p className="text-muted-foreground">
          Il faut, pour une même journée : le comptage du matin validé, celui de l&apos;après-midi
          validé, et le <strong>CA réel du midi</strong> saisi dans l&apos;onglet Chiffre
          d&apos;affaires.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Gastros consommés pendant le service du midi, pour 1 000 € de CA. Calculé sur les journées
        où les deux comptages ont été validés et où le CA du midi est connu.
      </p>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-2xl border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th scope="col" className="px-4 py-3 text-left font-semibold">Produit</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Théorique</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Constaté</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Écart</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Jours</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold" />
            </tr>
          </thead>

          <tbody>
            {withData.map((row) => (
              <tr key={row.productId} className="hover:bg-muted/30 border-b last:border-0">
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  {row.productName}
                </th>
                <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                  {formatQty(row.theoreticalPer1000)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatQty(row.observedPer1000)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.deviation === null
                    ? '—'
                    : `${row.deviation >= 0 ? '+' : ''}${formatPercent(row.deviation, 0)}`}
                </td>
                <td className="text-muted-foreground px-3 py-2 text-right text-xs tabular-nums">
                  {row.sampleDays}
                </td>
                <td className="px-4 py-2 text-right">
                  {row.observedPer1000 !== null ? (
                    <ApplyObservedRatioButton
                      productId={row.productId}
                      productName={row.productName}
                      observedPer1000={row.observedPer1000}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-muted-foreground text-xs">
        « Théorique » n&apos;est renseigné que pour les produits réglés au ratio. Appliquer le ratio
        constaté bascule le produit en mode ratio et crée une nouvelle version du calculateur —
        l&apos;historique n&apos;est pas réécrit.
      </p>
    </div>
  );
}
