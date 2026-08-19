/**
 * Types du domaine « MEP » (mise en place).
 *
 * La couche de calcul est pure et testable sans base de données.
 */

import type { ProductFamily, ProductUnit } from './families';

/** Session de comptage de la journée. */
export type SessionKind = 'morning' | 'afternoon';

/** Mode de calcul du MINIMUM de relance. */
export type MinMode = 'auto' | 'manual';

/**
 * Priorité d'un produit.
 *
 * ⚠️ **1 = LE PLUS URGENT, 5 = le moins urgent.** L'échelle se lit comme un
 * classement (« priorité 1 »), pas comme une intensité. Le rapport trie donc
 * par priorité CROISSANTE.
 */
export type Priority = 1 | 2 | 3 | 4 | 5;

/** Priorité attribuée à tous les produits tant que le restaurant ne les a pas saisies. */
export const DEFAULT_PRIORITY: Priority = 3;

/** Diviseur par défaut du minimum : le minimum vaut la moitié de la cible. */
export const DEFAULT_MIN_DIVISOR = 2;

/** Paramètres d'un produit nécessaires au calcul. */
export interface ProductCalcConfig {
  id: string;
  name: string;
  family: ProductFamily;
  unit: ProductUnit;
  /** Colonne « VENTE POUR » du Google Sheet. Pilote toute la cible. */
  baseQty: number;
  /** Pas de saisie au comptage (0,5 : on constate un stock réel). */
  countStep: number;
  minMode: MinMode;
  /** Diviseur appliqué à la cible quand minMode = 'auto'. */
  minDivisor: number;
  /** Minimum en valeur absolue quand minMode = 'manual'. */
  minQtyManual: number | null;
  /** Plancher absolu de la CIBLE. */
  floorQty: number | null;
  /** Plafond de la CIBLE. */
  ceilingQty: number | null;
  priority: Priority;
}

/** Résultat du calcul de la cible et du minimum pour un produit. */
export interface ProductTarget {
  productId: string;
  /** Cible du jour, arrondie à l'entier supérieur. */
  target: number;
  /** Minimum sous lequel il faut relancer. Ne dépasse jamais la cible. */
  minimum: number;
}

/** Stock compté pour un produit, zone par zone. */
export interface CountedStock {
  productId: string;
  qtySaladbar: number;
  qtyFridge: number;
}

/** Décision de relance pour un produit. */
export interface ReorderDecision {
  productId: string;
  stockTotal: number;
  target: number;
  minimum: number;
  /** Vrai si stockTotal < minimum : le produit doit être relancé. */
  needsReorder: boolean;
  /** Quantité à produire. 0 si aucune relance nécessaire. */
  qtyToProduce: number;
  /** stockTotal / target, vaut 1 quand la cible est nulle. */
  coverageRatio: number;
  priority: Priority;
  unit: ProductUnit;
}

/**
 * Charge utile envoyée au téléphone de l'employé.
 *
 * Ni CA, ni base, ni multiplicateur, ni cible, ni minimum : un employé qui
 * connaîtrait sa base et sa cible pourrait recalculer le chiffre d'affaires.
 */
export interface EmployeeReorderItem {
  productId: string;
  qtyToProduce: number;
  unit: ProductUnit;
  priority: Priority;
}

/** Réglages globaux du calcul de CA. */
export interface RevenueSettings {
  /** Taux de croissance N-1 -> N (0.10 = +10 %). */
  growthRate: number;
  /** Marge de sécurité appliquée au CA de référence. */
  safetyMargin: number;
  /** Coefficient de cible pour la session de l'après-midi (défaut 1.0). */
  afternoonTargetRatio: number;
  /** Diviseur de minimum par défaut, pour les produits en mode auto. */
  defaultMinDivisor: number;
  /** Les employés voient-ils les cibles et minimums ? (défaut false) */
  showTargetsToEmployees: boolean;
  morningReminderTime?: string | null;
  afternoonReminderTime?: string | null;
}

export const DEFAULT_REVENUE_SETTINGS: RevenueSettings = {
  growthRate: 0,
  // Le multiplicateur de famille (x2 pour la mise en place) porte déjà la
  // sécurité : une marge supplémentaire s'y cumulerait.
  safetyMargin: 0,
  afternoonTargetRatio: 1.0,
  defaultMinDivisor: DEFAULT_MIN_DIVISOR,
  showTargetsToEmployees: false,
};
