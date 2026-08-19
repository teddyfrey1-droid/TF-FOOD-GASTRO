import { describe, expect, it } from 'vitest';
import { computeMinimum, computeProductTarget, computeTarget } from '@/lib/mep/targets';
import { decideReorder } from '@/lib/mep/reorder';
import { DEFAULT_MIN_DIVISOR, type ProductCalcConfig, type Priority } from '@/lib/mep/types';

function product(overrides: Partial<ProductCalcConfig> = {}): ProductCalcConfig {
  return {
    id: 'p1',
    name: 'Saumon',
    family: 'mise_en_place',
    unit: 'gastro',
    baseQty: 4.6,
    countStep: 0.5,
    minMode: 'auto',
    minDivisor: DEFAULT_MIN_DIVISOR,
    minQtyManual: null,
    floorQty: null,
    ceilingQty: null,
    priority: 3 as Priority,
    ...overrides,
  };
}

const SAUMON = product();
const THON = product({ id: 'thon', name: 'Thon', baseQty: 0.4 });
const GYOZA = product({
  id: 'gyoza',
  name: 'Gyoza Poulet',
  family: 'les_plus',
  unit: 'piece',
  baseQty: 4.8,
});

describe('cible — base × multiplicateur × (CA / référence)', () => {
  it('Saumon, base 4,6, CA 4 000 € -> 9,2 -> cible 10', () => {
    expect(computeTarget(SAUMON, 4000)).toBe(10);
  });

  it('Saumon à 5 000 € -> 11,5 -> cible 12', () => {
    expect(computeTarget(SAUMON, 5000)).toBe(12);
  });

  it('Gyoza Poulet, base 4,8, les_plus, CA 5 000 € -> 24 -> cible 24', () => {
    // 4,8 × 1 × (5 000 / 1 000) = 24 pile : une valeur entière ne remonte pas.
    expect(computeTarget(GYOZA, 5000)).toBe(24);
  });

  it('Thon, base 0,4, CA 4 000 € -> 0,8 -> cible 1', () => {
    expect(computeTarget(THON, 4000)).toBe(1);
  });

  it('arrondit toujours à l’entier SUPÉRIEUR, jamais au plus proche', () => {
    // Le Google Sheet arrondit au plus proche (Bao 8,3 -> 8). L'app monte.
    const bao = product({ name: 'Bao', family: 'les_plus', unit: 'piece', baseQty: 1.7 });
    expect(computeTarget(bao, 4882)).toBe(9); // 8,3 -> 9
    expect(computeTarget(product({ baseQty: 2 }), 4000)).toBe(4); // 4,0 reste 4
    expect(computeTarget(product({ baseQty: 2.05 }), 4000)).toBe(5); // 4,1 -> 5
  });

  it('ne renvoie jamais de cible négative', () => {
    expect(computeTarget(product({ baseQty: 0 }), 4000)).toBe(0);
    expect(computeTarget(SAUMON, 0)).toBe(0);
  });

  it('respecte le plancher et le plafond quand ils sont renseignés', () => {
    expect(computeTarget(product({ floorQty: 12 }), 4000)).toBe(12);
    expect(computeTarget(product({ ceilingQty: 6 }), 4000)).toBe(6);
  });
});

describe('minimum de relance', () => {
  it('mode auto : moitié de la cible', () => {
    expect(computeMinimum(SAUMON, 10, 2)).toBe(5);
  });

  it('mode auto : le minimum suit la cible sans réglage', () => {
    expect(computeMinimum(SAUMON, 12, 2)).toBe(6);
    expect(computeMinimum(SAUMON, 24, 2)).toBe(12);
  });

  it('mode auto : arrondi SUPÉRIEUR au pas de comptage', () => {
    // Cible 1 -> 0,5 pile. Cible 3 -> 1,5 pile. Cible 5 -> 2,5 pile.
    expect(computeMinimum(THON, 1, 2)).toBe(0.5);
    expect(computeMinimum(SAUMON, 3, 2)).toBe(1.5);
    // Cible 7 avec divisor 3 -> 2,333 -> 2,5 (et non 2)
    expect(computeMinimum(product({ minDivisor: 3 }), 7, 2)).toBe(2.5);
  });

  it('un diviseur personnalisé change le minimum', () => {
    expect(computeMinimum(product({ minDivisor: 4 }), 10, 2)).toBe(2.5);
    expect(computeMinimum(product({ minDivisor: 1 }), 10, 2)).toBe(10);
  });

  it('mode manuel : valeur absolue', () => {
    expect(computeMinimum(product({ minMode: 'manual', minQtyManual: 8 }), 10, 2)).toBe(8);
  });

  it('le minimum ne dépasse JAMAIS la cible', () => {
    expect(computeMinimum(product({ minMode: 'manual', minQtyManual: 40 }), 10, 2)).toBe(10);
    expect(computeMinimum(product({ minDivisor: 0.5 }), 10, 2)).toBe(10);
  });

  it('le minimum n’est jamais négatif', () => {
    expect(computeMinimum(product({ minMode: 'manual', minQtyManual: -3 }), 10, 2)).toBe(0);
  });

  it('cible nulle -> minimum nul', () => {
    expect(computeMinimum(product({ minMode: 'manual', minQtyManual: 5 }), 0, 2)).toBe(0);
  });

  it('retombe sur le diviseur global quand le produit n’en a pas', () => {
    expect(computeMinimum(product({ minDivisor: 0 }), 10, 2)).toBe(5);
  });
});

/**
 * Tableau de vérification obligatoire, recopié à l'identique.
 * CA 4 000 €, mode auto, diviseur 2 — sauf mention contraire.
 */
describe('tableau de vérification (§1)', () => {
  const cases = [
    { produit: 'Saumon', config: SAUMON, caRef: 4000, cible: 10, minimum: 5, stock: 3, attendu: 7 },
    { produit: 'Saumon', config: SAUMON, caRef: 4000, cible: 10, minimum: 5, stock: 6, attendu: 0 },
    { produit: 'Saumon', config: SAUMON, caRef: 4000, cible: 10, minimum: 5, stock: 5, attendu: 0 },
    { produit: 'Saumon', config: SAUMON, caRef: 4000, cible: 10, minimum: 5, stock: 0, attendu: 10 },
    { produit: 'Saumon', config: SAUMON, caRef: 4000, cible: 10, minimum: 5, stock: 3.5, attendu: 7 },
    { produit: 'Thon', config: THON, caRef: 4000, cible: 1, minimum: 0.5, stock: 0, attendu: 1 },
    { produit: 'Thon', config: THON, caRef: 4000, cible: 1, minimum: 0.5, stock: 0.5, attendu: 0 },
    { produit: 'Gyoza Poulet', config: GYOZA, caRef: 5000, cible: 24, minimum: 12, stock: 10, attendu: 14 },
  ] as const;

  for (const testCase of cases) {
    it(`${testCase.produit} @ ${testCase.caRef} € — cible ${testCase.cible}, minimum ${testCase.minimum}, stock ${testCase.stock} -> ${testCase.attendu || 'rien'}`, () => {
      const target = computeProductTarget(testCase.config, testCase.caRef, 2);

      // La cible et le minimum du tableau doivent d'abord être ceux calculés.
      expect(target.target).toBe(testCase.cible);
      expect(target.minimum).toBe(testCase.minimum);

      const decision = decideReorder(testCase.config, target, {
        qtySaladbar: testCase.stock,
        qtyFridge: 0,
      });
      expect(decision.qtyToProduce).toBe(testCase.attendu);
      expect(decision.needsReorder).toBe(testCase.attendu > 0);
    });
  }

  it('Saumon en mode manuel, minimum 8, stock 6 -> relancer 4', () => {
    const manuel = product({ minMode: 'manual', minQtyManual: 8 });
    const target = computeProductTarget(manuel, 4000, 2);

    expect(target.target).toBe(10);
    expect(target.minimum).toBe(8);
    expect(
      decideReorder(manuel, target, { qtySaladbar: 6, qtyFridge: 0 }).qtyToProduce,
    ).toBe(4);
  });
});

describe('décision de relance', () => {
  const target = computeProductTarget(SAUMON, 4000, 2);

  it('additionne saladbar et frigo avant de comparer au minimum', () => {
    const decision = decideReorder(SAUMON, target, { qtySaladbar: 3, qtyFridge: 2 });
    expect(decision.stockTotal).toBe(5);
    expect(decision.needsReorder).toBe(false);
  });

  it('un demi-gastro sous le minimum déclenche la relance', () => {
    const decision = decideReorder(SAUMON, target, { qtySaladbar: 4.5, qtyFridge: 0 });
    expect(decision.needsReorder).toBe(true);
    expect(decision.qtyToProduce).toBe(6); // PLAFOND(10 − 4,5) = 6
  });

  it('le besoin est toujours un entier, même sur un stock en demis', () => {
    for (const stock of [0.5, 1.5, 2.5, 3.5, 4.5]) {
      const qty = decideReorder(SAUMON, target, { qtySaladbar: stock, qtyFridge: 0 })
        .qtyToProduce;
      expect(Number.isInteger(qty)).toBe(true);
    }
  });

  it('ne produit jamais une quantité négative', () => {
    const large = computeProductTarget(
      product({ minMode: 'manual', minQtyManual: 10 }),
      4000,
      2,
    );
    expect(
      decideReorder(SAUMON, large, { qtySaladbar: 12, qtyFridge: 0 }).qtyToProduce,
    ).toBe(0);
  });
});
