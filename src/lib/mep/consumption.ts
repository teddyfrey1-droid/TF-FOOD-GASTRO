/**
 * §5.7 — Consommation réelle, mesurée grâce aux deux comptages de la journée.
 *
 *   conso_midi(produit) = (stock_matin + production_matin_cochée) − stock_aprem
 *   conso_pour_1000€    = conso_midi / (CA_réel_midi / 1000)
 *
 * Donnée réservée au back-office : elle permet de recalibrer le calculateur
 * sur du réel plutôt que sur du ressenti.
 */

import { snap } from './rounding';

export interface ConsumptionInput {
  productId: string;
  /** Total (saladbar + frigo) relevé le matin. */
  stockMorning: number;
  /** Gastros réellement produits le matin (tâches de production cochées). */
  productionMorningDone: number;
  /** Total (saladbar + frigo) relevé l'après-midi. */
  stockAfternoon: number;
}

export interface ConsumptionResult {
  productId: string;
  /** Gastros consommés pendant le service du midi. */
  consumedLunch: number;
  /** Gastros consommés pour 1 000 € de CA. null si le CA du midi est inconnu ou nul. */
  consumedPer1000Eur: number | null;
}

export function computeLunchConsumption(
  input: ConsumptionInput,
  lunchRevenueHt: number | null,
): ConsumptionResult {
  const consumedLunch = snap(
    input.stockMorning + input.productionMorningDone - input.stockAfternoon,
  );
  return {
    productId: input.productId,
    consumedLunch,
    consumedPer1000Eur:
      lunchRevenueHt && lunchRevenueHt > 0
        ? snap(consumedLunch / (lunchRevenueHt / 1000))
        : null,
  };
}

/** Écart entre le ratio théorique du calculateur et le ratio constaté sur le terrain. */
export function ratioDeviation(
  theoreticalPer1000: number | null,
  observedPer1000: number | null,
): number | null {
  if (theoreticalPer1000 === null || observedPer1000 === null || theoreticalPer1000 === 0) {
    return null;
  }
  return snap((observedPer1000 - theoreticalPer1000) / theoreticalPer1000);
}

/** Moyenne des ratios constatés sur une fenêtre glissante (30 jours par défaut). */
export function averageObservedRatio(samples: readonly (number | null)[]): number | null {
  const valid = samples.filter((sample): sample is number => sample !== null);
  if (valid.length === 0) return null;
  return snap(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}
