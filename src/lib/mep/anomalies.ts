/**
 * §7.5 — Détection d'anomalies.
 *
 * Le but n'est pas d'accuser : c'est de signaler au directeur les endroits où
 * la donnée est probablement fausse, ou le réglage mal calibré. Chaque anomalie
 * porte donc un message qui dit quoi regarder.
 */

export type AnomalyKind =
  | 'session_manquante'
  | 'comptage_expedie'
  | 'variation_aberrante'
  | 'rupture_averee'
  | 'cible_trop_haute';

export type AnomalySeverity = 'info' | 'attention' | 'critique';

export interface Anomaly {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  /** Date concernée, au format YYYY-MM-DD. */
  date: string;
  productName?: string;
  message: string;
}

/** Un comptage validé en moins de deux minutes n'a pas pu être fait sérieusement. */
export const RUSHED_COUNT_MINUTES = 2;

/** Au-delà de ce facteur d'écart avec la veille, on demande une vérification. */
export const ABERRANT_VARIATION_FACTOR = 3;

/** Nombre de jours consécutifs au-dessus du seuil avant de suspecter une cible trop haute. */
export const OVERSTOCK_DAYS = 10;

export interface SessionObservation {
  date: string;
  session: 'morning' | 'afternoon';
  status: 'draft' | 'submitted';
  durationMinutes: number | null;
}

export interface ProductObservation {
  date: string;
  productName: string;
  qtyTotal: number;
  targetSnapshot: number | null;
  thresholdSnapshot: number | null;
  isNotApplicable: boolean;
}

/** Signale les sessions absentes ou expédiées. */
export function detectSessionAnomalies(
  observations: readonly SessionObservation[],
  expectedDates: readonly string[],
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const submitted = observations.filter((observation) => observation.status === 'submitted');

  for (const date of expectedDates) {
    for (const session of ['morning', 'afternoon'] as const) {
      const found = submitted.find(
        (observation) => observation.date === date && observation.session === session,
      );

      if (!found) {
        anomalies.push({
          kind: 'session_manquante',
          severity: 'attention',
          date,
          message: `Le comptage ${session === 'morning' ? 'du matin' : "de l'après-midi"} n'a pas été validé.`,
        });
        continue;
      }

      if (found.durationMinutes !== null && found.durationMinutes < RUSHED_COUNT_MINUTES) {
        anomalies.push({
          kind: 'comptage_expedie',
          severity: 'attention',
          date,
          message: `Comptage ${session === 'morning' ? 'du matin' : "de l'après-midi"} validé en ${found.durationMinutes} min : à vérifier.`,
        });
      }
    }
  }

  return anomalies;
}

/**
 * Signale, produit par produit : les variations aberrantes d'un jour à l'autre,
 * les ruptures avérées, et les cibles manifestement trop hautes.
 */
export function detectProductAnomalies(observations: readonly ProductObservation[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  const byProduct = new Map<string, ProductObservation[]>();
  for (const observation of observations) {
    if (observation.isNotApplicable) continue;
    byProduct.set(observation.productName, [
      ...(byProduct.get(observation.productName) ?? []),
      observation,
    ]);
  }

  for (const [productName, rows] of byProduct) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));

    for (const [index, row] of sorted.entries()) {
      if (row.qtyTotal === 0) {
        anomalies.push({
          kind: 'rupture_averee',
          severity: 'critique',
          date: row.date,
          productName,
          message: `${productName} est tombé à zéro : rupture avérée.`,
        });
      }

      const previous = sorted[index - 1];
      if (previous && previous.qtyTotal > 0 && row.qtyTotal > 0) {
        const factor = Math.max(row.qtyTotal / previous.qtyTotal, previous.qtyTotal / row.qtyTotal);
        if (factor >= ABERRANT_VARIATION_FACTOR) {
          anomalies.push({
            kind: 'variation_aberrante',
            severity: 'attention',
            date: row.date,
            productName,
            message: `${productName} : ${previous.qtyTotal} la veille, ${row.qtyTotal} ce jour. Erreur de comptage ?`,
          });
        }
      }
    }

    // Toujours largement au-dessus du seuil : la cible est probablement trop haute.
    const comparable = sorted.filter(
      (row) => row.thresholdSnapshot !== null && row.targetSnapshot !== null,
    );
    if (comparable.length >= OVERSTOCK_DAYS) {
      const alwaysAbove = comparable.every((row) => row.qtyTotal > row.thresholdSnapshot!);
      if (alwaysAbove) {
        anomalies.push({
          kind: 'cible_trop_haute',
          severity: 'info',
          date: comparable[comparable.length - 1].date,
          productName,
          message: `${productName} n'est jamais passé sous son seuil en ${comparable.length} comptages : la cible peut être abaissée.`,
        });
      }
    }
  }

  return anomalies;
}

const SEVERITY_ORDER: Record<AnomalySeverity, number> = {
  critique: 0,
  attention: 1,
  info: 2,
};

/** Les anomalies les plus graves d'abord, puis les plus récentes. */
export function sortAnomalies(anomalies: readonly Anomaly[]): Anomaly[] {
  return [...anomalies].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.date.localeCompare(a.date),
  );
}
