/**
 * §5.3 et §5.4 — Cible par produit et seuil de relance.
 */

import { clamp, roundToNearestStep, roundUpToStep, snap } from './rounding';
import type { CalculatorRule, ProductCalcConfig, ProductTarget } from './types';

/**
 * Sélectionne le palier couvrant `caRef` : `ca_min <= CA_ref < ca_max`.
 * Les bornes nulles valent -infini / +infini.
 */
export function findBracket(
  rules: readonly CalculatorRule[],
  caRef: number,
): CalculatorRule | null {
  return (
    rules.find(
      (rule) =>
        rule.mode === 'bracket' &&
        (rule.caMin === null || caRef >= rule.caMin) &&
        (rule.caMax === null || caRef < rule.caMax),
    ) ?? null
  );
}

/** Cible brute (avant bornage et arrondi), ou null si aucune règle ne s'applique. */
export function rawTarget(rules: readonly CalculatorRule[], caRef: number): number | null {
  const ratioRule = rules.find((rule) => rule.mode === 'ratio');
  if (ratioRule && ratioRule.qtyPer1000Eur !== null) {
    return snap(ratioRule.qtyPer1000Eur * (caRef / 1000));
  }
  const bracket = findBracket(rules, caRef);
  if (bracket && bracket.targetQty !== null) return bracket.targetQty;
  return null;
}

/**
 * §5.3 — Cible finale :
 *   target = clamp(target, floor_qty, ceiling_qty)
 *   target = arrondi_supérieur_au_multiple(target, production_step)
 *
 * L'ordre est celui du cahier des charges : le bornage précède l'arrondi.
 * Un `ceilingQty` qui n'est pas un multiple du pas peut donc être légèrement
 * dépassé par l'arrondi supérieur — les plafonds doivent rester des multiples
 * du pas de production.
 */
export function computeTarget(product: ProductCalcConfig, raw: number): number {
  const bounded = clamp(raw, product.floorQty, product.ceilingQty);
  return roundUpToStep(Math.max(bounded, 0), product.productionStep);
}

/**
 * §5.4 — Seuil de relance :
 *   ratio  -> seuil = target × reorder_ratio
 *   fixed  -> seuil = reorder_fixed
 *   puis arrondi au multiple de count_step le plus proche,
 *   puis borné : un seuil ne peut jamais dépasser la cible.
 */
export function computeReorderThreshold(
  product: ProductCalcConfig,
  target: number,
  defaultReorderRatio: number,
): number {
  const base =
    product.reorderMode === 'fixed'
      ? (product.reorderFixed ?? 0)
      : target * (product.reorderRatio ?? defaultReorderRatio);

  const rounded = roundToNearestStep(Math.max(base, 0), product.countStep);
  return Math.min(rounded, target);
}

/** Calcule cible + seuil pour un produit à partir du CA de référence. */
export function computeProductTarget(
  product: ProductCalcConfig,
  rules: readonly CalculatorRule[],
  caRef: number,
  defaultReorderRatio: number,
): ProductTarget {
  const raw = rawTarget(rules, caRef);
  const target = computeTarget(product, raw ?? 0);
  return {
    productId: product.id,
    target,
    reorderThreshold: computeReorderThreshold(product, target, defaultReorderRatio),
    hasRule: raw !== null,
  };
}
