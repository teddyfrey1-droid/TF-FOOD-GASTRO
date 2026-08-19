/**
 * Cible du jour et minimum de relance.
 *
 * Une seule donnée pilote un produit : sa `base_qty`, reprise de la colonne
 * « VENTE POUR » du Google Sheet. Tout le reste en découle.
 */

import { familySettings } from './families';
import { ceilTo, clamp, PRODUCTION_STEP } from './rounding';
import type { ProductCalcConfig, ProductTarget } from './types';

/**
 * Cible du jour :
 *
 *   cible = base_qty × target_multiplier × (CA_ref / reference_revenue)
 *   cible = clamp(cible, floor_qty, ceiling_qty)
 *   cible = PLAFOND(cible)
 *
 * Saumon, base 4,6, mise en place, CA 4 000 € :
 *   4,6 × 2 × (4 000 / 4 000) = 9,2  ->  10
 */
export function computeTarget(product: ProductCalcConfig, caRef: number): number {
  const { referenceRevenue, targetMultiplier } = familySettings(product.family);

  const raw = product.baseQty * targetMultiplier * (caRef / referenceRevenue);
  const bounded = clamp(Math.max(raw, 0), product.floorQty, product.ceilingQty);

  return ceilTo(Math.max(bounded, 0), PRODUCTION_STEP);
}

/**
 * Minimum de relance :
 *
 *   auto   -> minimum = cible / min_divisor      (divisor par défaut : 2)
 *   manual -> minimum = min_qty_manual
 *
 *   minimum = PLAFOND(minimum, count_step)
 *   minimum = min(minimum, cible)
 *
 * Le minimum suit donc la cible tout seul en mode auto : il n'y a rien à
 * régler quand le chiffre d'affaires bouge.
 */
export function computeMinimum(
  product: ProductCalcConfig,
  target: number,
  defaultMinDivisor: number,
): number {
  const divisor =
    product.minDivisor && product.minDivisor > 0 ? product.minDivisor : defaultMinDivisor;

  const raw =
    product.minMode === 'manual' ? (product.minQtyManual ?? 0) : divisor > 0 ? target / divisor : 0;

  const rounded = ceilTo(Math.max(raw, 0), product.countStep);
  return Math.min(rounded, target);
}

/** Cible + minimum d'un produit, à partir du CA de référence. */
export function computeProductTarget(
  product: ProductCalcConfig,
  caRef: number,
  defaultMinDivisor: number,
): ProductTarget {
  const target = computeTarget(product, caRef);
  return {
    productId: product.id,
    target,
    minimum: computeMinimum(product, target, defaultMinDivisor),
  };
}
