import { describe, expect, it } from 'vitest';
import {
  buildReorderReport,
  coverageRatio,
  decideReorder,
  sortReorderDecisions,
  stockTotal,
  toEmployeePayload,
} from '@/lib/mep/reorder';
import { computeProductTarget } from '@/lib/mep/targets';
import { DEFAULT_MIN_DIVISOR, type Priority, type ProductCalcConfig } from '@/lib/mep/types';

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

function decision(overrides: Partial<{ productId: string; priority: Priority; coverageRatio: number }>) {
  return {
    productId: 'x',
    stockTotal: 0,
    target: 10,
    minimum: 5,
    needsReorder: true,
    qtyToProduce: 1,
    coverageRatio: 0.5,
    priority: 3 as Priority,
    unit: 'gastro' as const,
    ...overrides,
  };
}

/**
 * ⚠️ L'échelle se lit comme un classement : **1 = le plus urgent**, 5 = le
 * moins urgent. Le rapport trie donc par priorité CROISSANTE.
 */
describe('priorité — 1 est le plus urgent', () => {
  it('place la priorité 1 avant la priorité 5', () => {
    const sorted = sortReorderDecisions([
      decision({ productId: 'peu-urgent', priority: 5 }),
      decision({ productId: 'urgent', priority: 1 }),
      decision({ productId: 'moyen', priority: 3 }),
    ]);
    expect(sorted.map((d) => d.productId)).toEqual(['urgent', 'moyen', 'peu-urgent']);
  });

  it('à priorité égale, le plus dégarni passe devant', () => {
    const sorted = sortReorderDecisions([
      decision({ productId: 'garni', priority: 2, coverageRatio: 0.8 }),
      decision({ productId: 'vide', priority: 2, coverageRatio: 0.1 }),
    ]);
    expect(sorted.map((d) => d.productId)).toEqual(['vide', 'garni']);
  });

  it('la priorité prime sur la couverture', () => {
    // Un produit prioritaire 1 bien garni passe avant un prioritaire 5 à zéro.
    const sorted = sortReorderDecisions([
      decision({ productId: 'p5-vide', priority: 5, coverageRatio: 0 }),
      decision({ productId: 'p1-garni', priority: 1, coverageRatio: 0.9 }),
    ]);
    expect(sorted[0].productId).toBe('p1-garni');
  });

  it('départage par nom pour un rendu stable', () => {
    const sorted = sortReorderDecisions(
      [
        decision({ productId: 'b', priority: 3, coverageRatio: 0.5 }),
        decision({ productId: 'a', priority: 3, coverageRatio: 0.5 }),
      ],
      (id) => (id === 'a' ? 'Avocat' : 'Bao'),
    );
    expect(sorted.map((d) => d.productId)).toEqual(['a', 'b']);
  });
});

describe('rapport de relance', () => {
  const saumon = product({ id: 'saumon', name: 'Saumon', priority: 1 as Priority });
  const gyoza = product({
    id: 'gyoza',
    name: 'Gyoza Poulet',
    family: 'les_plus',
    unit: 'piece',
    baseQty: 4.8,
    priority: 4 as Priority,
  });

  const targets = new Map([
    ['saumon', computeProductTarget(saumon, 4000, 2)],
    ['gyoza', computeProductTarget(gyoza, 4000, 2)],
  ]);

  it('exclut du rapport tout produit au-dessus de son minimum', () => {
    const report = buildReorderReport(
      [saumon, gyoza],
      targets,
      new Map([
        ['saumon', { qtySaladbar: 3, qtyFridge: 0 }],
        ['gyoza', { qtySaladbar: 20, qtyFridge: 0 }],
      ]),
    );
    expect(report.toReorder.map((d) => d.productId)).toEqual(['saumon']);
    expect(report.sufficient.map((d) => d.productId)).toEqual(['gyoza']);
  });

  it('trie le rapport par priorité croissante', () => {
    const report = buildReorderReport(
      [gyoza, saumon],
      targets,
      new Map([
        ['saumon', { qtySaladbar: 0, qtyFridge: 0 }],
        ['gyoza', { qtySaladbar: 0, qtyFridge: 0 }],
      ]),
    );
    expect(report.toReorder.map((d) => d.productId)).toEqual(['saumon', 'gyoza']);
  });

  it('traite un produit non compté comme un stock à zéro', () => {
    const report = buildReorderReport([saumon], targets, new Map());
    expect(report.toReorder[0].qtyToProduce).toBe(10);
  });
});

describe('charge utile envoyée au téléphone', () => {
  const saumon = product({ id: 'saumon', priority: 2 as Priority });
  const target = computeProductTarget(saumon, 4000, 2);

  it('ne contient QUE produit, quantité, unité et priorité', () => {
    const payload = toEmployeePayload([
      decideReorder(saumon, target, { qtySaladbar: 3, qtyFridge: 0 }),
    ]);

    expect(payload).toEqual([
      { productId: 'saumon', qtyToProduce: 7, unit: 'gastro', priority: 2 },
    ]);
    expect(Object.keys(payload[0]).sort()).toEqual([
      'priority',
      'productId',
      'qtyToProduce',
      'unit',
    ]);
  });

  it('ne laisse fuir ni cible, ni minimum, ni couverture', () => {
    const payload = toEmployeePayload([
      decideReorder(saumon, target, { qtySaladbar: 1, qtyFridge: 0 }),
    ]);
    const serialized = JSON.stringify(payload);
    for (const leak of ['target', 'minimum', 'coverage', 'stockTotal', 'baseQty']) {
      expect(serialized).not.toContain(leak);
    }
  });
});

describe('totaux et couverture', () => {
  it('additionne des demi-gastros sans dérive flottante', () => {
    expect(stockTotal({ qtySaladbar: 0.1, qtyFridge: 0.2 })).toBe(0.3);
  });

  it('donne une couverture de 1 quand la cible est nulle', () => {
    expect(coverageRatio(0, 0)).toBe(1);
  });

  it('reporte l’unité du produit dans la décision', () => {
    const gyoza = product({ family: 'les_plus', unit: 'piece', baseQty: 4.8 });
    const target = computeProductTarget(gyoza, 5000, 2);
    expect(decideReorder(gyoza, target, { qtySaladbar: 0, qtyFridge: 0 }).unit).toBe('piece');
  });
});
