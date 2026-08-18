/**
 * Calibrage du taux de croissance.
 *
 * Toute la prévision repose sur une seule hypothèse : « cette année, on fait
 * X % de plus que l'an dernier ». Ce X est saisi à la main, et c'est lui qui
 * décide s'il faut 5 ou 6 gastros de saumon un jeudi de juin.
 *
 * Autant le mesurer. Chaque journée dont on connaît à la fois le réalisé et
 * la référence N-1 est une observation. Leur agrégat donne la croissance
 * réellement constatée — à comparer au taux réglé.
 */

import { snap } from './rounding';

export interface GrowthSample {
  date: string;
  /** CA réalisé cette année. */
  actualHt: number;
  /** CA du même jour de semaine, l'an dernier. */
  referenceHt: number;
}

export interface GrowthObservation {
  /** Croissance constatée : 0,23 = +23 %. null si rien de comparable. */
  observedRate: number | null;
  /** Nombre de journées comparées. */
  sampleDays: number;
  /** Cumul du réalisé, sur les journées comparées. */
  totalActual: number;
  /** Cumul de la référence N-1, sur les mêmes journées. */
  totalReference: number;
}

/**
 * Croissance constatée, en agrégat.
 *
 * On somme d'un côté le réalisé, de l'autre la référence, avant de faire le
 * rapport — plutôt que de moyenner des pourcentages journaliers. Une journée
 * creuse à 300 € ne pèse ainsi pas autant qu'un samedi à 4 000 €, et une
 * référence proche de zéro ne fait pas exploser la moyenne.
 */
export function observedGrowthRate(samples: readonly GrowthSample[]): GrowthObservation {
  const usable = samples.filter(
    (sample) =>
      Number.isFinite(sample.actualHt) &&
      Number.isFinite(sample.referenceHt) &&
      sample.referenceHt > 0 &&
      sample.actualHt >= 0,
  );

  const totalActual = usable.reduce((sum, sample) => sum + sample.actualHt, 0);
  const totalReference = usable.reduce((sum, sample) => sum + sample.referenceHt, 0);

  return {
    observedRate: totalReference > 0 ? snap(totalActual / totalReference - 1) : null,
    sampleDays: usable.length,
    totalActual: snap(totalActual),
    totalReference: snap(totalReference),
  };
}

/** Nombre de journées en deçà duquel une croissance constatée ne veut pas dire grand-chose. */
export const MIN_GROWTH_SAMPLE_DAYS = 10;

/**
 * Faut-il proposer d'ajuster le taux réglé ?
 *
 * On ne dérange le directeur que si l'observation repose sur assez de jours
 * et que l'écart change réellement quelque chose. Un écart d'un point ne vaut
 * pas un changement de réglage.
 */
export const GROWTH_ADJUSTMENT_THRESHOLD = 0.05;

export function shouldSuggestGrowthAdjustment(
  configuredRate: number,
  observation: GrowthObservation,
): boolean {
  if (observation.observedRate === null) return false;
  if (observation.sampleDays < MIN_GROWTH_SAMPLE_DAYS) return false;
  return Math.abs(observation.observedRate - configuredRate) >= GROWTH_ADJUSTMENT_THRESHOLD;
}
