/**
 * Cible du jour et minimum de relance.
 *
 * Une seule donnée pilote un produit : sa `base_qty`, la quantité à avoir
 * par tranche de 1 000 € de chiffre d'affaires. Tout le reste en découle.
 */

import { TRANCHE_CA } from './families';
import { ceilTo, clamp, PRODUCTION_STEP } from './rounding';
import { DEFAULT_CRIT_DIVISOR, type ProductCalcConfig, type ProductTarget } from './types';

/**
 * Cible du jour :
 *
 *   cible = base_qty × (CA_ref / 1000)
 *   cible = clamp(cible, floor_qty, ceiling_qty)
 *   cible = PLAFOND(cible)
 *
 * La base est une quantité PAR TRANCHE DE 1 000 €, la même échelle pour
 * tous les produits. Pudding chia, base 4, CA 1 500 € :
 *   4 × (1 500 / 1 000) = 6  ->  6
 */
export function computeTarget(product: ProductCalcConfig, caRef: number): number {
  const raw = product.baseQty * (caRef / TRANCHE_CA);
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

/**
 * Seuil CRITIQUE :
 *
 *   auto   -> critique = cible / crit_divisor   (divisor par défaut : 4)
 *   manual -> critique = crit_qty_manual
 *
 *   critique = PLAFOND(critique, count_step)
 *   critique = min(critique, minimum)
 *
 * Le bornage par le MINIMUM n'est pas cosmétique : un critique supérieur au
 * minimum rendrait un produit critique avant même d'être à relancer, et le
 * rapport afficherait des alertes rouges sur des bacs encore pleins.
 */
export function computeCritical(
  product: ProductCalcConfig,
  target: number,
  minimum: number,
  defaultCritDivisor: number,
): number {
  const divisor =
    product.critDivisor && product.critDivisor > 0 ? product.critDivisor : defaultCritDivisor;

  const raw =
    product.critMode === 'manual'
      ? (product.critQtyManual ?? 0)
      : divisor > 0
        ? target / divisor
        : 0;

  const rounded = ceilTo(Math.max(raw, 0), product.countStep);
  return Math.min(rounded, minimum);
}

/** Cible, minimum et seuil critique d'un produit, à partir du CA de référence. */
export function computeProductTarget(
  product: ProductCalcConfig,
  caRef: number,
  defaultMinDivisor: number,
  defaultCritDivisor: number = DEFAULT_CRIT_DIVISOR,
): ProductTarget {
  const target = computeTarget(product, caRef);
  const minimum = computeMinimum(product, target, defaultMinDivisor);
  return {
    productId: product.id,
    target,
    minimum,
    critical: computeCritical(product, target, minimum, defaultCritDivisor),
  };
}
