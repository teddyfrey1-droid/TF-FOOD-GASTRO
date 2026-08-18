import { describe, expect, it } from 'vitest';
import {
  buildReorderReport,
  coverageRatio,
  decideReorder,
  sortReorderDecisions,
  stockTotal,
  toEmployeePayload,
  totalPrepTimeMinutes,
} from '@/lib/mep/reorder';
import { computeReorderThreshold, computeTarget } from '@/lib/mep/targets';
import type { ProductCalcConfig, ProductTarget, UrgencyLevel } from '@/lib/mep/types';

function product(overrides: Partial<ProductCalcConfig> = {}): ProductCalcConfig {
  return {
    id: 'p-saumon',
    name: 'Saumon',
    countStep: 0.5,
    productionStep: 0.5,
    reorderMode: 'ratio',
    reorderRatio: 0.5,
    reorderFixed: null,
    floorQty: null,
    ceilingQty: null,
    urgencyLevel: 5,
    prepTimeMin: null,
    ...overrides,
  };
}

function target(target: number, reorderThreshold: number): ProductTarget {
  return { productId: 'p-saumon', target, reorderThreshold, hasRule: true };
}

/**
 * Tableau du §5.5 recopié à l'identique. C'est le contrat d'acceptation
 * du produit : toute régression ici coûte de l'argent tous les jours.
 */
describe('§5.5 — tableau de vérification obligatoire', () => {
  const cases = [
    { ca: 3200, name: 'Saumon', target: 8, seuil: 4, stock: 3, attendu: 5 },
    { ca: 3200, name: 'Saumon', target: 8, seuil: 4, stock: 5, attendu: 0 },
    { ca: 3200, name: 'Saumon', target: 8, seuil: 4, stock: 4, attendu: 0 },
    { ca: 3200, name: 'Saumon', target: 8, seuil: 4, stock: 0, attendu: 8 },
    { ca: 1400, name: 'Grenade', target: 2, seuil: 1, stock: 0.5, attendu: 1.5 },
  ] as const;

  for (const testCase of cases) {
    it(`CA ${testCase.ca} € — ${testCase.name} cible ${testCase.target} seuil ${testCase.seuil} stock ${testCase.stock} -> ${testCase.attendu || 'rien'}`, () => {
      const decision = decideReorder(
        product({ name: testCase.name }),
        target(testCase.target, testCase.seuil),
        { qtySaladbar: testCase.stock, qtyFridge: 0 },
      );
      expect(decision.qtyToProduce).toBe(testCase.attendu);
      expect(decision.needsReorder).toBe(testCase.attendu > 0);
    });
  }
});

describe('§5.5 — décision de relance', () => {
  it('stock EXACTEMENT égal au seuil ne déclenche PAS de relance', () => {
    const decision = decideReorder(product(), target(8, 4), {
      qtySaladbar: 4,
      qtyFridge: 0,
    });
    expect(decision.needsReorder).toBe(false);
    expect(decision.qtyToProduce).toBe(0);
  });

  it('un demi-gastro sous le seuil déclenche la relance', () => {
    const decision = decideReorder(product(), target(8, 4), {
      qtySaladbar: 3.5,
      qtyFridge: 0,
    });
    expect(decision.needsReorder).toBe(true);
    expect(decision.qtyToProduce).toBe(4.5);
  });

  it('additionne saladbar et frigo avant de comparer au seuil', () => {
    // 2 au saladbar + 2 au frigo = 4 = seuil -> rien à relancer.
    const decision = decideReorder(product(), target(8, 4), {
      qtySaladbar: 2,
      qtyFridge: 2,
    });
    expect(decision.stockTotal).toBe(4);
    expect(decision.needsReorder).toBe(false);
  });

  it('arrondit le besoin au pas de production supérieur', () => {
    const decision = decideReorder(product({ productionStep: 0.5 }), target(3, 1.5), {
      qtySaladbar: 0.25,
      qtyFridge: 0,
    });
    expect(decision.qtyToProduce).toBe(3); // ceil(2.75 / 0.5) * 0.5
  });

  it('ne produit jamais une quantité négative', () => {
    const decision = decideReorder(product({ reorderMode: 'fixed', reorderFixed: 10 }), target(2, 2), {
      qtySaladbar: 1.5,
      qtyFridge: 0,
    });
    expect(decision.qtyToProduce).toBeGreaterThanOrEqual(0);
  });

  it('additionne correctement des demi-gastros sans dérive flottante', () => {
    expect(stockTotal({ qtySaladbar: 0.1, qtyFridge: 0.2 })).toBe(0.3);
  });
});

describe('§5.6 — priorisation et badges', () => {
  it('trie par urgence décroissante puis par couverture croissante', () => {
    const decisions = [
      { productId: 'a', urgencyLevel: 3 as UrgencyLevel, coverageRatio: 0.1 },
      { productId: 'b', urgencyLevel: 5 as UrgencyLevel, coverageRatio: 0.8 },
      { productId: 'c', urgencyLevel: 5 as UrgencyLevel, coverageRatio: 0.2 },
    ].map((partial) => ({
      stockTotal: 0,
      target: 1,
      reorderThreshold: 1,
      needsReorder: true,
      qtyToProduce: 1,
      isCritical: false,
      ...partial,
    }));

    expect(sortReorderDecisions(decisions).map((d) => d.productId)).toEqual(['c', 'b', 'a']);
  });

  it('marque RUPTURE IMMINENTE quand le stock est à zéro', () => {
    const decision = decideReorder(product({ urgencyLevel: 1 }), target(8, 4), {
      qtySaladbar: 0,
      qtyFridge: 0,
    });
    expect(decision.isCritical).toBe(true);
  });

  it('marque RUPTURE IMMINENTE si urgence >= 4 et couverture < 0,25', () => {
    const critique = decideReorder(product({ urgencyLevel: 4 }), target(10, 5), {
      qtySaladbar: 2,
      qtyFridge: 0,
    });
    expect(critique.coverageRatio).toBe(0.2);
    expect(critique.isCritical).toBe(true);

    const nonCritique = decideReorder(product({ urgencyLevel: 3 }), target(10, 5), {
      qtySaladbar: 2,
      qtyFridge: 0,
    });
    expect(nonCritique.isCritical).toBe(false);
  });

  it('ne marque pas critique un produit qui n’est pas à relancer', () => {
    const decision = decideReorder(product({ urgencyLevel: 5 }), target(8, 0), {
      qtySaladbar: 0,
      qtyFridge: 0,
    });
    expect(decision.needsReorder).toBe(false);
    expect(decision.isCritical).toBe(false);
  });

  it('donne une couverture de 1 quand la cible est nulle', () => {
    expect(coverageRatio(0, 0)).toBe(1);
  });

  it('cumule le temps de prépa, compté par gastro entier', () => {
    const saumon = product({ id: 'p1', name: 'Saumon', prepTimeMin: 6 });
    const decisions = [
      decideReorder(saumon, { productId: 'p1', target: 8, reorderThreshold: 4, hasRule: true }, {
        qtySaladbar: 3,
        qtyFridge: 0,
      }),
    ];
    // besoin 5 gastros x 6 min = 30 min
    expect(totalPrepTimeMinutes(decisions, new Map([['p1', saumon]]))).toBe(30);
  });

  it('sait encore compter par pas de production si on le lui demande', () => {
    const saumon = product({ id: 'p1', name: 'Saumon', prepTimeMin: 6 });
    const decisions = [
      decideReorder(saumon, { productId: 'p1', target: 8, reorderThreshold: 4, hasRule: true }, {
        qtySaladbar: 3,
        qtyFridge: 0,
      }),
    ];
    // 5 gastros / pas 0,5 = 10 pas x 6 min = 60 min
    expect(totalPrepTimeMinutes(decisions, new Map([['p1', saumon]]), 'per_production_step')).toBe(60);
  });

  it('ignore les produits sans temps de prépa renseigné', () => {
    const sansTemps = product({ id: 'p1', name: 'Grenade', prepTimeMin: null });
    const decisions = [
      decideReorder(sansTemps, { productId: 'p1', target: 2, reorderThreshold: 1, hasRule: true }, {
        qtySaladbar: 0,
        qtyFridge: 0,
      }),
    ];
    expect(totalPrepTimeMinutes(decisions, new Map([['p1', sansTemps]]))).toBe(0);
  });
});

describe('rapport complet', () => {
  const saumon = product({ id: 'p1', name: 'Saumon', urgencyLevel: 5, prepTimeMin: 6 });
  const grenade = product({ id: 'p2', name: 'Grenade', urgencyLevel: 2, prepTimeMin: 2 });
  const targets = new Map<string, ProductTarget>([
    ['p1', { productId: 'p1', target: 8, reorderThreshold: 4, hasRule: true }],
    ['p2', { productId: 'p2', target: 2, reorderThreshold: 1, hasRule: true }],
  ]);

  it('exclut du rapport tout produit au-dessus de son seuil', () => {
    const report = buildReorderReport([saumon, grenade], targets, new Map([
      ['p1', { qtySaladbar: 3, qtyFridge: 0 }],
      ['p2', { qtySaladbar: 1.5, qtyFridge: 0 }],
    ]));

    expect(report.toReorder.map((d) => d.productId)).toEqual(['p1']);
    expect(report.sufficient.map((d) => d.productId)).toEqual(['p2']);
  });

  it('place le saumon avant la grenade', () => {
    const report = buildReorderReport([grenade, saumon], targets, new Map([
      ['p1', { qtySaladbar: 3, qtyFridge: 0 }],
      ['p2', { qtySaladbar: 0.5, qtyFridge: 0 }],
    ]));
    expect(report.toReorder.map((d) => d.productId)).toEqual(['p1', 'p2']);
    expect(report.toReorder[1].qtyToProduce).toBe(1.5);
  });

  it('traite un produit non compté comme un stock à zéro', () => {
    const report = buildReorderReport([saumon], targets, new Map());
    expect(report.toReorder[0].qtyToProduce).toBe(8);
  });

  it('ne laisse fuir ni cible ni seuil dans la charge utile employé (§5.8)', () => {
    const report = buildReorderReport([saumon], targets, new Map([
      ['p1', { qtySaladbar: 3, qtyFridge: 0 }],
    ]));
    const payload = toEmployeePayload(report.toReorder);

    expect(payload).toEqual([
      { productId: 'p1', qtyToProduce: 5, urgencyLevel: 5, isCritical: false },
    ]);
    for (const item of payload) {
      expect(Object.keys(item).sort()).toEqual([
        'isCritical',
        'productId',
        'qtyToProduce',
        'urgencyLevel',
      ]);
    }
  });
});

describe('cohérence cible / seuil de bout en bout', () => {
  it('reproduit le cas du saumon depuis le calculateur', () => {
    const saumon = product({ floorQty: 4, ceilingQty: 12 });
    const cible = computeTarget(saumon, 8);
    const seuil = computeReorderThreshold(saumon, cible, 0.5);
    expect(cible).toBe(8);
    expect(seuil).toBe(4);

    expect(
      decideReorder(saumon, { productId: saumon.id, target: cible, reorderThreshold: seuil, hasRule: true }, {
        qtySaladbar: 2,
        qtyFridge: 1,
      }).qtyToProduce,
    ).toBe(5);
  });
});
