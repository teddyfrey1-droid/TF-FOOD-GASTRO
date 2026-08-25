/**
 * Les deux familles de produits.
 *
 * Elles ne servent plus qu'à ranger : depuis que la base se lit par tranche
 * de 1 000 €, toutes les familles partagent la même échelle. Une famille
 * n'a donc plus aucun effet sur la cible.
 */

export type ProductFamily = 'mise_en_place' | 'les_plus';

/** Le gastro pour la mise en place, la pièce pour les gyozas et les desserts. */
export type ProductUnit = 'gastro' | 'piece';

/**
 * La tranche de chiffre d'affaires pour laquelle une `base_qty` est exprimée.
 *
 * « 4 puddings par tranche de 1 000 € » : à 1 500 €, 1 500 / 1 000 × 4 = 6.
 */
export const TRANCHE_CA = 1000;

export interface FamilySettings {
  label: string;
}

export const FAMILY_SETTINGS: Record<ProductFamily, FamilySettings> = {
  mise_en_place: { label: 'Mise en place' },
  les_plus: { label: 'Les plus' },
};

export function familySettings(family: ProductFamily): FamilySettings {
  return FAMILY_SETTINGS[family];
}

/** Libellé d'unité, au singulier ou au pluriel. */
export function unitLabel(unit: ProductUnit, qty: number): string {
  const plural = qty > 1;
  return unit === 'piece' ? (plural ? 'pièces' : 'pièce') : plural ? 'gastros' : 'gastro';
}
