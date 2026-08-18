/**
 * Arrondis « bac gastro ».
 *
 * Tout le métier se compte en gastros entiers ou demi-gastros. Les calculs
 * intermédiaires produisent des flottants (3200 / 1000 * 2.5 ...) qui doivent
 * être ramenés proprement sur un pas (0,5 par défaut) sans dérive binaire.
 */

/** Tolérance utilisée pour absorber la dérive des flottants IEEE-754. */
const EPSILON = 1e-9;

/** Ramène une valeur sur 6 décimales pour effacer la dérive binaire (0.30000000000000004 -> 0.3). */
export function snap(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  // Normalise -0 en 0 : un besoin de production nul ne doit jamais s'afficher « -0 ».
  return rounded === 0 ? 0 : rounded;
}

function assertStep(step: number): void {
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`Pas invalide: ${step}. Le pas doit être un nombre strictement positif.`);
  }
}

/**
 * Arrondi SUPÉRIEUR au multiple du pas.
 * Utilisé pour la cible (§5.3) et pour le besoin de production (§5.5) :
 * on ne produit jamais moins que nécessaire.
 */
export function roundUpToStep(value: number, step: number): number {
  assertStep(step);
  return snap(Math.ceil(snap(value / step) - EPSILON) * step);
}

/**
 * Arrondi au multiple du pas LE PLUS PROCHE (0,5 arrondi vers le haut).
 * Utilisé pour le seuil de relance (§5.4).
 */
export function roundToNearestStep(value: number, step: number): number {
  assertStep(step);
  return snap(Math.round(snap(value / step)) * step);
}

/** Borne une valeur entre un plancher et un plafond, chacun optionnel (null = pas de borne). */
export function clamp(
  value: number,
  min: number | null | undefined,
  max: number | null | undefined,
): number {
  let out = value;
  if (min !== null && min !== undefined) out = Math.max(out, min);
  if (max !== null && max !== undefined) out = Math.min(out, max);
  return snap(out);
}

/** Vrai si la valeur est un multiple exact du pas (à la tolérance flottante près). */
export function isMultipleOfStep(value: number, step: number): boolean {
  assertStep(step);
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}
