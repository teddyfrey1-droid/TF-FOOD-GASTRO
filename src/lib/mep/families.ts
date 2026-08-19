/**
 * Les deux familles de produits.
 *
 * Chaque famille fixe le couple (chiffre d'affaires de référence, multiplicateur)
 * qui transforme la `base_qty` d'un produit — la colonne « VENTE POUR » du
 * Google Sheet — en cible du jour.
 */

export type ProductFamily = 'mise_en_place' | 'les_plus';

/** Le gastro pour la mise en place, la pièce pour les gyozas et les desserts. */
export type ProductUnit = 'gastro' | 'piece';

export interface FamilySettings {
  /** CA pour lequel `base_qty` est exprimée. */
  referenceRevenue: number;
  /** Coefficient appliqué à la base. */
  targetMultiplier: number;
  label: string;
}

export const FAMILY_SETTINGS: Record<ProductFamily, FamilySettings> = {
  mise_en_place: { referenceRevenue: 4000, targetMultiplier: 2, label: 'Mise en place' },
  les_plus: { referenceRevenue: 1000, targetMultiplier: 1, label: 'Les plus' },
};

export function familySettings(family: ProductFamily): FamilySettings {
  return FAMILY_SETTINGS[family];
}

/** Libellé d'unité, au singulier ou au pluriel. */
export function unitLabel(unit: ProductUnit, qty: number): string {
  const plural = qty > 1;
  return unit === 'piece' ? (plural ? 'pièces' : 'pièce') : plural ? 'gastros' : 'gastro';
}
