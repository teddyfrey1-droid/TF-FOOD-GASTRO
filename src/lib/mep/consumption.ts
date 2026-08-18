/**
 * §5.7 — Consommation réelle, mesurée grâce aux deux comptages de la journée.
 *
 *   conso_midi(produit) = (stock_matin + production_matin_cochée) − stock_aprem
 *
 * Le cahier des charges rapportait cette consommation au « CA réel du midi ».
 * Le restaurant enregistre son chiffre d'affaires **à la journée**, pas par
 * service : ce dénominateur n'existe pas. On raisonne donc en deux temps.
 *
 * 1. **Mesuré, sans aucune hypothèse** — gastros consommés au midi pour
 *    1 000 € de CA de la JOURNÉE. C'est un indicateur solide : même
 *    numérateur, même dénominateur, tous les jours. Il se compare d'un jour
 *    à l'autre et d'une semaine à l'autre.
 *
 * 2. **Extrapolé** — pour comparer au calculateur, qui dimensionne une
 *    journée entière, il faut savoir quelle part du CA se fait au déjeuner.
 *    Cette part est un réglage du back-office, et toute valeur qui en dépend
 *    est explicitement marquée comme estimée.
 *
 * Si le restaurant se met un jour à saisir le CA du midi, il est utilisé tel
 * quel et l'estimation disparaît.
 */

import { snap } from './rounding';

export interface ConsumptionInput {
  productId: string;
  /** Total (saladbar + frigo) relevé le matin. */
  stockMorning: number;
  /** Gastros réellement produits le matin (tâches de production cochées). */
  productionMorningDone: number;
  /** Total (saladbar + frigo) relevé après le service du midi. */
  stockAfternoon: number;
}

/** D'où vient le chiffre d'affaires du midi utilisé au dénominateur. */
export type LunchRevenueBasis =
  /** Saisi tel quel par le restaurant. */
  | 'saisi'
  /** Déduit du CA de la journée et de la part du midi réglée en back-office. */
  | 'estime';

export interface ConsumptionResult {
  productId: string;
  /** Gastros consommés pendant le service du midi. */
  consumedLunch: number;
  /**
   * MESURÉ — gastros consommés au midi pour 1 000 € de CA de la journée.
   * Aucune hypothèse : c'est l'indicateur de référence.
   */
  lunchPerDaily1000: number | null;
  /**
   * ESTIMÉ — consommation ramenée à une journée entière, pour se comparer au
   * calculateur. Dépend de la part du midi ; `null` si elle n'est pas réglée.
   */
  fullDayPer1000: number | null;
  /** Comment le CA du midi a été obtenu, quand il a servi. */
  basis: LunchRevenueBasis | null;
}

/**
 * Part du chiffre d'affaires réalisée au service du midi.
 *
 * ⚠️ Valeur PROVISOIRE tant que le restaurant ne l'a pas confirmée. Elle
 * n'influence que les colonnes explicitement marquées « estimé » ; la
 * consommation mesurée, elle, n'en dépend pas.
 */
export const DEFAULT_LUNCH_REVENUE_SHARE = 0.6;

export function computeLunchConsumption(
  input: ConsumptionInput,
  revenue: {
    /** CA HT de la journée entière. */
    dailyHt: number | null;
    /** CA HT du seul service du midi, s'il est connu. */
    lunchHt?: number | null;
    /** Part du CA réalisée au midi (0 à 1). */
    lunchShare?: number | null;
  },
): ConsumptionResult {
  const consumedLunch = snap(
    input.stockMorning + input.productionMorningDone - input.stockAfternoon,
  );

  const daily = revenue.dailyHt && revenue.dailyHt > 0 ? revenue.dailyHt : null;
  const lunch = revenue.lunchHt && revenue.lunchHt > 0 ? revenue.lunchHt : null;
  const share =
    revenue.lunchShare && revenue.lunchShare > 0 && revenue.lunchShare <= 1
      ? revenue.lunchShare
      : null;

  // Indicateur mesuré : consommation du midi rapportée au CA de la journée.
  const lunchPerDaily1000 = daily ? snap(consumedLunch / (daily / 1000)) : null;

  // Extrapolation à la journée entière, pour comparer au calculateur.
  let fullDayPer1000: number | null = null;
  let basis: LunchRevenueBasis | null = null;

  if (lunch && daily) {
    // Le CA du midi est connu : la part se déduit, plus besoin de l'estimer.
    // On applique au reste de la journée le rythme de consommation observé au
    // midi — soit `conso / CA_midi`, ramené à 1 000 €.
    basis = 'saisi';
    fullDayPer1000 = snap(consumedLunch / (lunch / 1000));
  } else if (lunchPerDaily1000 !== null && share) {
    basis = 'estime';
    fullDayPer1000 = snap(lunchPerDaily1000 / share);
  }

  return { productId: input.productId, consumedLunch, lunchPerDaily1000, fullDayPer1000, basis };
}

/**
 * Écart entre la cible du calculateur et la consommation constatée.
 *
 * Un écart POSITIF est normal et souhaitable : la cible intègre une marge de
 * sécurité, on prépare toujours un peu plus qu'on ne consomme. Un écart
 * négatif signale au contraire une cible trop basse — on a consommé plus que
 * ce qui était prévu, donc frôlé la rupture.
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
