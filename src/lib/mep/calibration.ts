/**
 * Recalibrer une base « VENTE POUR » à partir du réel.
 *
 * La base vient du Google Sheet : c'est une estimation, faite une fois.
 * Après quelques semaines de comptages, la base de données sait mieux —
 * elle a vu combien de fois chaque produit est tombé sous son seuil
 * critique, et combien de fois il en restait trop.
 *
 * ⚠️ Ce module produit une PROPOSITION, jamais une correction automatique.
 * Un produit peut être tombé en rupture trois fois pour une raison qui
 * n'a rien à voir avec sa base — une livraison manquée, un service
 * exceptionnel. Seul quelqu'un qui était là peut trancher, et c'est
 * pourquoi l'écran demande un appui par produit.
 */

import { snap } from './rounding';

export interface CalibrationSample {
  /** Comptages validés retenus sur la période. */
  sessions: number;
  /** Comptages où le stock relevé était sous le seuil critique. */
  critical: number;
  /** Moyenne de stock relevé / cible du jour. */
  avgCoverage: number | null;
  baseQty: number;
}

/**
 * Nombre de comptages en dessous duquel on ne propose rien.
 *
 * Sous ce seuil, un seul jour atypique suffirait à déplacer la base : la
 * proposition serait du bruit présenté comme une mesure.
 */
export const MIN_SAMPLE_SESSIONS = 4;

/** Au-delà de ce taux de rupture, la base est jugée trop basse. */
export const SEUIL_RUPTURE = 0.2;

/**
 * En dessous de ce taux de rupture ET au-dessus de cette couverture
 * moyenne, on produit visiblement plus que nécessaire.
 */
export const COUVERTURE_CONFORTABLE = 0.75;

/** Bornes de correction : ±50 % en une fois, jamais plus. */
const FACTEUR_MAX = 1.5;
const FACTEUR_MIN = 0.9;

/**
 * Base proposée, ou null s'il n'y a rien à proposer.
 *
 * Trop de ruptures  -> on monte la base du taux de rupture observé.
 * Jamais de rupture
 * et bacs toujours pleins -> on la descend de 10 %.
 *
 * La hausse est proportionnelle au problème constaté ; la baisse est
 * prudente et forfaitaire, parce que se tromper vers le bas se paie
 * immédiatement par une rupture en plein service.
 */
export function suggestBaseQty(sample: CalibrationSample): number | null {
  if (sample.sessions < MIN_SAMPLE_SESSIONS) return null;
  if (sample.baseQty <= 0) return null;

  const tauxRupture = sample.critical / sample.sessions;

  if (tauxRupture > SEUIL_RUPTURE) {
    const facteur = Math.min(1 + tauxRupture, FACTEUR_MAX);
    const propose = arrondiBase(sample.baseQty * facteur);
    return propose > sample.baseQty ? propose : null;
  }

  if (
    tauxRupture === 0 &&
    sample.avgCoverage !== null &&
    sample.avgCoverage > COUVERTURE_CONFORTABLE
  ) {
    const propose = arrondiBase(sample.baseQty * FACTEUR_MIN);
    // Une base trop petite ne veut plus rien dire : sous 0,1 on n'y touche pas.
    return propose >= 0.1 && propose < sample.baseQty ? propose : null;
  }

  return null;
}

/** Les bases du Sheet s'écrivent avec une décimale : on s'y tient. */
function arrondiBase(value: number): number {
  return snap(Math.round(value * 10) / 10);
}

/**
 * Facteur de sécurité visé : la cible couvre DEUX fois la consommation
 * d'une journée.
 *
 * Ce n'est pas un chiffre tiré au sort. La production a lieu deux fois par
 * jour, et il faut tenir jusqu'à la suivante sans jamais tomber à zéro : une
 * cible égale à la consommation d'une journée serait vide avant la fin du
 * second service. C'est aussi le facteur qu'appliquent déjà les réglages
 * actuels — le multiplicateur ×2 de la mise en place.
 */
export const FACTEUR_SECURITE_VISE = 2;

export interface ConsumptionCalibration {
  /** Consommation mesurée pour 1 000 € de CA. */
  dailyPer1000: number | null;
  /** Cible actuelle pour 1 000 € de CA, déduite de la base. */
  theoreticalPer1000: number | null;
  /** Journées entièrement mesurées : sous 5, on ne propose rien. */
  completeDays: number;
  baseQty: number;
}

/**
 * Combien de fois la cible couvre-t-elle une journée de consommation ?
 *
 * Sous 1, la cible ne couvre même pas ce qui sort dans la journée : la
 * rupture est arithmétiquement garantie. Au-delà de 3, on produit trois
 * fois ce qu'on vend.
 */
export function safetyFactor(sample: ConsumptionCalibration): number | null {
  if (!sample.dailyPer1000 || !sample.theoreticalPer1000) return null;
  if (sample.dailyPer1000 <= 0) return null;
  return snap(sample.theoreticalPer1000 / sample.dailyPer1000);
}

/** Journées complètes minimales avant de proposer quoi que ce soit. */
export const MIN_COMPLETE_DAYS = 5;

/**
 * Base proposée d'après la CONSOMMATION mesurée.
 *
 * Plus direct que le taux de rupture : au lieu de constater qu'on a manqué,
 * on mesure ce qui est réellement sorti et on dimensionne dessus.
 *
 *   base proposée = base actuelle × (facteur visé / facteur constaté)
 *
 * Renvoie null tant que la mesure est trop courte, ou quand la cible est
 * déjà au bon facteur à 15 % près — inutile de faire bouger un réglage
 * pour un écart que le service ne verra pas.
 */
export function suggestBaseFromConsumption(sample: ConsumptionCalibration): number | null {
  if (sample.completeDays < MIN_COMPLETE_DAYS) return null;
  if (sample.baseQty <= 0) return null;

  const facteur = safetyFactor(sample);
  if (facteur === null || facteur <= 0) return null;

  const ecart = FACTEUR_SECURITE_VISE / facteur;
  if (Math.abs(ecart - 1) < 0.15) return null;

  // Même bornage que le recalibrage par rupture : jamais plus de ±50 %
  // d'un coup, sinon une semaine atypique renverse tout le réglage.
  const borne = Math.min(Math.max(ecart, 0.5), 1.5);
  const propose = arrondiBase(sample.baseQty * borne);

  return propose > 0 && propose !== sample.baseQty ? propose : null;
}
