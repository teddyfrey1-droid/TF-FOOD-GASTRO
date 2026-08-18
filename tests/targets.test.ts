import { describe, expect, it } from 'vitest';
import {
  computeProductTarget,
  computeReorderThreshold,
  computeTarget,
  findBracket,
  rawTarget,
} from '@/lib/mep/targets';
import type { CalculatorRule, ProductCalcConfig } from '@/lib/mep/types';

function product(overrides: Partial<ProductCalcConfig> = {}): ProductCalcConfig {
  return {
    id: 'p1',
    name: 'Saumon',
    countStep: 0.5,
    productionStep: 0.5,
    reorderMode: 'ratio',
    reorderRatio: 0.5,
    reorderFixed: null,
    floorQty: null,
    ceilingQty: null,
    urgencyLevel: 3,
    prepTimeMin: null,
    ...overrides,
  };
}

const brackets: CalculatorRule[] = [
  { productId: 'p1', mode: 'bracket', caMin: 0, caMax: 1500, targetQty: 3, qtyPer1000Eur: null },
  { productId: 'p1', mode: 'bracket', caMin: 1500, caMax: 2500, targetQty: 5, qtyPer1000Eur: null },
  { productId: 'p1', mode: 'bracket', caMin: 2500, caMax: 3500, targetQty: 8, qtyPer1000Eur: null },
  { productId: 'p1', mode: 'bracket', caMin: 3500, caMax: null, targetQty: 11, qtyPer1000Eur: null },
];

describe('§5.3 — sélection du palier', () => {
  it('applique ca_min <= CA < ca_max (borne basse incluse, haute exclue)', () => {
    expect(findBracket(brackets, 1499)?.targetQty).toBe(3);
    expect(findBracket(brackets, 1500)?.targetQty).toBe(5);
    expect(findBracket(brackets, 2500)?.targetQty).toBe(8);
    expect(findBracket(brackets, 3200)?.targetQty).toBe(8);
  });

  it('traite une borne haute nulle comme +infini', () => {
    expect(findBracket(brackets, 99_000)?.targetQty).toBe(11);
  });

  it('renvoie null quand aucun palier ne couvre le CA', () => {
    expect(findBracket(brackets.slice(1), 500)).toBeNull();
    expect(rawTarget(brackets.slice(1), 500)).toBeNull();
  });

  it('calcule la cible en mode ratio', () => {
    const rules: CalculatorRule[] = [
      { productId: 'p1', mode: 'ratio', caMin: null, caMax: null, targetQty: null, qtyPer1000Eur: 2.5 },
    ];
    expect(rawTarget(rules, 3200)).toBe(8);
    expect(rawTarget(rules, 1400)).toBe(3.5);
  });
});

describe('§5.3 — bornage et arrondi de la cible', () => {
  it('borne par le plancher, quel que soit le CA', () => {
    expect(computeTarget(product({ floorQty: 4 }), 1.5)).toBe(4);
  });

  it('borne par le plafond (capacité frigo)', () => {
    expect(computeTarget(product({ ceilingQty: 10 }), 14)).toBe(10);
  });

  it('arrondit la cible au pas de production supérieur', () => {
    expect(computeTarget(product(), 7.2)).toBe(7.5);
    expect(computeTarget(product(), 8)).toBe(8);
  });

  it('ne renvoie jamais une cible négative', () => {
    expect(computeTarget(product(), -3)).toBe(0);
  });

  it('plancher et plafond peuvent se croiser : le plafond gagne', () => {
    expect(computeTarget(product({ floorQty: 6, ceilingQty: 4 }), 10)).toBe(4);
  });
});

describe('§5.4 — seuil de relance', () => {
  it('mode ratio : seuil = cible x ratio', () => {
    expect(computeReorderThreshold(product({ reorderRatio: 0.5 }), 8, 0.5)).toBe(4);
    expect(computeReorderThreshold(product({ reorderRatio: 0.4 }), 10, 0.5)).toBe(4);
  });

  it('mode ratio : arrondi au pas de comptage le plus proche', () => {
    // 7 x 0.5 = 3.5 -> déjà aligné ; 5 x 0.3 = 1.5 -> aligné ; 3 x 0.4 = 1.2 -> 1
    expect(computeReorderThreshold(product({ reorderRatio: 0.5 }), 7, 0.5)).toBe(3.5);
    expect(computeReorderThreshold(product({ reorderRatio: 0.4 }), 3, 0.5)).toBe(1);
  });

  it('mode fixed : seuil = valeur absolue', () => {
    expect(
      computeReorderThreshold(product({ reorderMode: 'fixed', reorderFixed: 2 }), 8, 0.5),
    ).toBe(2);
  });

  it('un seuil ne peut JAMAIS dépasser la cible', () => {
    expect(
      computeReorderThreshold(product({ reorderMode: 'fixed', reorderFixed: 12 }), 8, 0.5),
    ).toBe(8);
    expect(computeReorderThreshold(product({ reorderRatio: 1.5 }), 6, 0.5)).toBe(6);
  });

  it('retombe sur le ratio par défaut quand le produit n’en définit pas', () => {
    expect(computeReorderThreshold(product({ reorderRatio: null }), 8, 0.5)).toBe(4);
    expect(computeReorderThreshold(product({ reorderRatio: null }), 8, 0.25)).toBe(2);
  });

  it('ne renvoie jamais un seuil négatif', () => {
    expect(
      computeReorderThreshold(product({ reorderMode: 'fixed', reorderFixed: -5 }), 8, 0.5),
    ).toBe(0);
  });

  it('cible nulle -> seuil nul', () => {
    expect(computeReorderThreshold(product({ reorderMode: 'fixed', reorderFixed: 3 }), 0, 0.5)).toBe(0);
  });
});

describe('cible + seuil combinés', () => {
  it('produit le couple attendu du cas saumon (CA 3 200 €)', () => {
    const result = computeProductTarget(product(), brackets, 3200, 0.5);
    expect(result).toEqual({ productId: 'p1', target: 8, reorderThreshold: 4, hasRule: true });
  });

  it('signale l’absence de règle mais applique quand même le plancher', () => {
    const result = computeProductTarget(product({ floorQty: 2 }), [], 3200, 0.5);
    expect(result.hasRule).toBe(false);
    expect(result.target).toBe(2);
    expect(result.reorderThreshold).toBe(1);
  });
});
