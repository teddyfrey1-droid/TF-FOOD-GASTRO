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
    baseQty: 2.3,
    countStep: 0.5,
    minMode: 'auto',
    minDivisor: DEFAULT_MIN_DIVISOR,
    minQtyManual: null,
    critMode: 'auto' as const,
    critDivisor: 4,
    critQtyManual: null,
    floorQty: null,
    ceilingQty: null,
    priority: 3 as Priority,
    ...overrides,
  };
}

function decision(
  overrides: Partial<{
    productId: string;
    priority: Priority;
    coverageRatio: number;
    isCritical: boolean;
  }>,
) {
  return {
    productId: 'x',
    stockTotal: 0,
    target: 10,
    minimum: 5,
    needsReorder: true,
    critical: 2,
    isCritical: false,
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

  it('ne contient QUE produit, quantité, unité, priorité et le drapeau critique', () => {
    const payload = toEmployeePayload([
      decideReorder(saumon, target, { qtySaladbar: 3, qtyFridge: 0 }),
    ]);

    // Stock 3 pour un critique à 3 : au niveau, donc pas critique.
    expect(payload).toEqual([
      {
        productId: 'saumon',
        qtyToProduce: 7,
        unit: 'gastro',
        priority: 2,
        isCritical: false,
      },
    ]);
    expect(Object.keys(payload[0]).sort()).toEqual([
      'isCritical',
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

/**
 * Le seuil CRITIQUE, et sa règle de préséance.
 *
 * Cas donné par le restaurant : 2 Edamame pour un critique à 3, face à un
 * Poulet Mayo de priorité 1 encore au-dessus de son minimum. L'Edamame doit
 * arriver en tête — c'est lui qui manquera pendant le service.
 */
describe('seuil critique', () => {
  it('le critique passe DEVANT la priorité', () => {
    const sorted = sortReorderDecisions([
      decision({ productId: 'poulet-mayo', priority: 1, isCritical: false }),
      decision({ productId: 'edamame', priority: 3, isCritical: true }),
    ]);
    expect(sorted.map((d) => d.productId)).toEqual(['edamame', 'poulet-mayo']);
  });

  it('entre deux critiques, la priorité départage à nouveau', () => {
    const sorted = sortReorderDecisions([
      decision({ productId: 'crit-p4', priority: 4, isCritical: true }),
      decision({ productId: 'crit-p1', priority: 1, isCritical: true }),
      decision({ productId: 'calme-p1', priority: 1, isCritical: false }),
    ]);
    expect(sorted.map((d) => d.productId)).toEqual(['crit-p1', 'crit-p4', 'calme-p1']);
  });

  it('le critique vaut le quart de la cible par défaut', () => {
    // Cible 10 -> minimum 5, critique 2,5 arrondi au pas entier -> 3.
    const target = computeProductTarget(product({ countStep: 1 }), 4000, 2, 4);
    expect(target.target).toBe(10);
    expect(target.minimum).toBe(5);
    expect(target.critical).toBe(3);
  });

  it('un critique manuel démesuré est ramené au minimum', () => {
    // Sans ce bornage, le produit serait « critique » avant même d'être à
    // relancer : du rouge sur des bacs encore pleins.
    const config = product({
      countStep: 1,
      minMode: 'manual',
      minQtyManual: 2,
      critMode: 'manual',
      critQtyManual: 99,
    });
    expect(computeProductTarget(config, 4000, 2, 4).critical).toBe(2);
  });

  it('sous le critique implique toujours sous le minimum', () => {
    // Propriété structurelle : critique <= minimum, donc tout produit
    // critique est forcément à relancer. Un rapport ne peut pas contenir
    // une alerte rouge sur un produit qu'il ne demande pas de produire.
    const config = product({ countStep: 1 });
    const target = computeProductTarget(config, 4000, 2, 4);

    for (const stock of [0, 1, 2, 3, 4, 5, 6, 10]) {
      const d = decideReorder(config, target, { qtySaladbar: stock, qtyFridge: 0 });
      if (d.isCritical) expect(d.needsReorder).toBe(true);
    }
  });

  it('le drapeau critique accompagne la charge utile de l’employé', () => {
    const config = product({ countStep: 1 });
    const target = computeProductTarget(config, 4000, 2, 4);
    const decisions = [decideReorder(config, target, { qtySaladbar: 1, qtyFridge: 0 })];

    const payload = toEmployeePayload(decisions);
    expect(payload[0].isCritical).toBe(true);
    // Et toujours rien d'autre : ni cible, ni minimum, ni couverture.
    expect(Object.keys(payload[0]).sort()).toEqual(
      ['isCritical', 'priority', 'productId', 'qtyToProduce', 'unit'].sort(),
    );
  });
});
