/**
 * §5.7 — Consommation réelle, mesurée par les comptages.
 *
 * La journée du restaurant :
 *
 *   comptage MATIN → production → SERVICE DU MIDI
 *     → comptage APRÈS-MIDI → production → SERVICE DU SOIR
 *       → (ce qui reste n'est pas jeté) → comptage du LENDEMAIN MATIN
 *
 * Les deux comptages ne servent pas d'abord à mesurer : ils servent à remettre
 * le stock à niveau avant chaque service, pour ne jamais tomber à court. Mais
 * ils rendent la mesure possible, gratuitement :
 *
 *   conso MIDI = (stock matin + production du matin cochée) − stock après-midi
 *   conso SOIR = (stock après-midi + production de l'après-midi cochée)
 *                − stock du LENDEMAIN matin
 *
 * La seconde ligne n'est valable que parce que les invendus du soir sont
 * conservés (DLC de 2 jours) : le stock du lendemain matin est bien ce qui
 * reste du soir, pas un stock reconstitué.
 *
 * ⚠️ Limite connue, hors périmètre v1 : si un produit est jeté pour cause de
 * DLC entre les deux comptages, la consommation du soir est surévaluée
 * d'autant. La gestion des DLC dira un jour ce qui a été jeté ; en attendant,
 * l'écart se voit dans les anomalies.
 */

import { snap } from './rounding';

export interface ServiceConsumptionInput {
  productId: string;
  /** Total (saladbar + frigo) relevé le matin. */
  stockMorning: number;
  /** Gastros réellement produits le matin (tâches cochées). */
  productionMorningDone: number;
  /** Total relevé après le service du midi. */
  stockAfternoon: number;
  /** Gastros réellement produits l'après-midi (tâches cochées). */
  productionAfternoonDone: number;
  /**
   * Total relevé le LENDEMAIN matin. `null` si ce comptage n'existe pas
   * encore, ou si le restaurant était fermé : le service du soir n'est alors
   * pas mesurable, et on ne devine pas.
   */
  stockNextMorning: number | null;
}

export interface ServiceConsumptionResult {
  productId: string;
  /** Gastros consommés pendant le service du midi. Toujours mesuré. */
  lunch: number;
  /** Gastros consommés pendant le service du soir. null si non mesurable. */
  evening: number | null;
  /** Total de la journée. null tant que le soir n'est pas mesurable. */
  daily: number | null;
  /** Vrai quand les deux services sont mesurés. */
  isComplete: boolean;
}

/** Consommation des deux services d'une journée. */
export function computeServiceConsumption(
  input: ServiceConsumptionInput,
): ServiceConsumptionResult {
  const lunch = snap(input.stockMorning + input.productionMorningDone - input.stockAfternoon);

  const evening =
    input.stockNextMorning === null
      ? null
      : snap(input.stockAfternoon + input.productionAfternoonDone - input.stockNextMorning);

  return {
    productId: input.productId,
    lunch,
    evening,
    daily: evening === null ? null : snap(lunch + evening),
    isComplete: evening !== null,
  };
}

/** Consommation ramenée à 1 000 € de chiffre d'affaires. */
export function per1000(consumed: number | null, revenueHt: number | null): number | null {
  if (consumed === null || revenueHt === null || revenueHt <= 0) return null;
  return snap(consumed / (revenueHt / 1000));
}

/**
 * Part du service du midi dans la consommation de la journée.
 *
 * Mesurée, produit par produit. C'est elle qui dit si le soir consomme
 * autant que le midi — et donc si la cible du soir peut être abaissée
 * (`afternoon_target_ratio`, §5.2).
 */
export function lunchShareOfDay(result: ServiceConsumptionResult): number | null {
  if (result.daily === null || result.daily <= 0) return null;
  return snap(result.lunch / result.daily);
}

/**
 * Rapport entre la consommation du soir et celle du midi.
 *
 * 1,0 = les deux services consomment autant. En dessous, la cible du soir
 * peut être abaissée sans risque : c'est exactement ce que règle
 * `afternoon_target_ratio`.
 */
export function eveningToLunchRatio(
  lunch: number | null,
  evening: number | null,
): number | null {
  if (lunch === null || evening === null || lunch <= 0) return null;
  return snap(evening / lunch);
}

/**
 * Marge entre la cible du calculateur et la consommation constatée.
 *
 * Un écart POSITIF est normal et souhaitable : la cible intègre une marge de
 * sécurité, on prépare toujours un peu plus qu'on ne consomme. Un écart
 * négatif signale une cible trop basse — on a consommé plus que prévu, donc
 * frôlé la rupture.
 */
export function ratioDeviation(
  theoreticalPer1000: number | null,
  observedPer1000: number | null,
): number | null {
  if (theoreticalPer1000 === null || observedPer1000 === null || theoreticalPer1000 === 0) {
    return null;
  }
  return snap((theoreticalPer1000 - observedPer1000) / theoreticalPer1000);
}

/** Moyenne d'une série, en ignorant les jours sans mesure. */
export function averageObservedRatio(samples: readonly (number | null)[]): number | null {
  const valid = samples.filter((sample): sample is number => sample !== null);
  if (valid.length === 0) return null;
  return snap(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}
