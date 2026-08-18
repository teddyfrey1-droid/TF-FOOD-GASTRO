/**
 * Types du domaine « MEP » (mise en place).
 *
 * Ces types sont volontairement découplés du schéma Supabase : la couche de
 * calcul (§5 du cahier des charges) est pure et testable sans base de données.
 */

/** Session de comptage de la journée. */
export type SessionKind = 'morning' | 'afternoon';

/** Mode de calcul de la cible pour un produit. */
export type CalculatorMode = 'bracket' | 'ratio';

/** Mode de calcul du SEUIL DE RELANCE (à ne pas confondre avec floorQty). */
export type ReorderMode = 'ratio' | 'fixed';

/** Niveau d'urgence : 1 = faible ... 5 = critique. */
export type UrgencyLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Paramètres du produit nécessaires au calcul.
 *
 * ATTENTION : `floorQty` / `ceilingQty` bornent la CIBLE.
 * `reorderMode` / `reorderRatio` / `reorderFixed` définissent le SEUIL qui
 * DÉCLENCHE la relance. Les deux notions sont distinctes (cf. §4).
 */
export interface ProductCalcConfig {
  id: string;
  name: string;
  /** Pas de saisie au comptage (défaut 0,5 gastro). */
  countStep: number;
  /** Pas de production (défaut 0,5 gastro). */
  productionStep: number;
  reorderMode: ReorderMode;
  /** Fraction de la cible, utilisée si reorderMode = 'ratio'. */
  reorderRatio: number | null;
  /** Valeur absolue en gastros, utilisée si reorderMode = 'fixed'. */
  reorderFixed: number | null;
  /** Plancher absolu de la CIBLE, quel que soit le CA. */
  floorQty: number | null;
  /** Plafond de la CIBLE (capacité frigo). */
  ceilingQty: number | null;
  urgencyLevel: UrgencyLevel;
  /** Temps de prépa en minutes (cf. §5.6 et la note sur l'unité). */
  prepTimeMin: number | null;
}

/** Une ligne du calculateur, en mode paliers ou en mode ratio. */
export interface CalculatorRule {
  productId: string;
  mode: CalculatorMode;
  /** Mode 'bracket' : borne basse INCLUSE. null = pas de borne basse. */
  caMin: number | null;
  /** Mode 'bracket' : borne haute EXCLUE. null = pas de borne haute. */
  caMax: number | null;
  /** Mode 'bracket' : cible en gastros pour ce palier. */
  targetQty: number | null;
  /** Mode 'ratio' : gastros par tranche de 1 000 € de CA. */
  qtyPer1000Eur: number | null;
}

/** Résultat du calcul de la cible et du seuil pour un produit. */
export interface ProductTarget {
  productId: string;
  /** Cible en gastros, bornée puis arrondie au pas de production. */
  target: number;
  /** Seuil de relance en gastros, arrondi au pas de comptage et borné par la cible. */
  reorderThreshold: number;
  /** Faux si aucune règle de calculateur ne couvre ce CA (cible issue du seul plancher). */
  hasRule: boolean;
}

/** Stock compté pour un produit, zone par zone. */
export interface CountedStock {
  productId: string;
  qtySaladbar: number;
  qtyFridge: number;
}

/** Décision de relance pour un produit (§5.5). */
export interface ReorderDecision {
  productId: string;
  stockTotal: number;
  target: number;
  reorderThreshold: number;
  /** Vrai si stockTotal < seuil : le produit doit être relancé. */
  needsReorder: boolean;
  /** Quantité à produire en gastros. 0 si aucune relance nécessaire. */
  qtyToProduce: number;
  /** stockTotal / target, borné à 1 quand la cible est nulle. */
  coverageRatio: number;
  urgencyLevel: UrgencyLevel;
  /** Badge « RUPTURE IMMINENTE » (§5.6). */
  isCritical: boolean;
}

/**
 * Charge utile envoyée au téléphone de l'employé.
 * Aucune donnée de CA, de cible ni de seuil (§5.8).
 */
export interface EmployeeReorderItem {
  productId: string;
  qtyToProduce: number;
  urgencyLevel: UrgencyLevel;
  isCritical: boolean;
}

/** Réglages globaux du calcul de CA. */
export interface RevenueSettings {
  /** Taux de croissance N-1 -> N (0.10 = +10 %). */
  growthRate: number;
  /** Marge de sécurité appliquée au CA de référence (défaut 0.10). */
  safetyMargin: number;
  /** Coefficient de cible pour la session de l'après-midi (défaut 1.0). */
  afternoonTargetRatio: number;
  /** Ratio de seuil par défaut quand le produit n'en définit pas (défaut 0.5). */
  defaultReorderRatio: number;
  /** Les employés voient-ils les cibles et seuils ? (défaut false) */
  showTargetsToEmployees: boolean;
}

export const DEFAULT_REVENUE_SETTINGS: RevenueSettings = {
  growthRate: 0,
  safetyMargin: 0.1,
  afternoonTargetRatio: 1.0,
  defaultReorderRatio: 0.5,
  showTargetsToEmployees: false,
};
