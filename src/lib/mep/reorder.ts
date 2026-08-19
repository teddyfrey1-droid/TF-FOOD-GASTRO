/**
 * Décision de relance et tri du rapport.
 *
 * C'est le cœur du produit : un produit AU-DESSUS de son minimum n'apparaît
 * JAMAIS dans la liste de relance. Sans ce comportement de seuil, l'app
 * réclame un demi-gastro dès qu'il en manque un demi, et le rapport devient
 * illisible.
 */

import { ceilTo, PRODUCTION_STEP, snap } from './rounding';
import type {
  CountedStock,
  EmployeeReorderItem,
  ProductCalcConfig,
  ProductTarget,
  ReorderDecision,
} from './types';

/** Somme saladbar + frigo. C'est ce total qui est comparé au minimum. */
export function stockTotal(stock: Pick<CountedStock, 'qtySaladbar' | 'qtyFridge'>): number {
  return snap((stock.qtySaladbar ?? 0) + (stock.qtyFridge ?? 0));
}

/** Taux de couverture = stock / cible. Vaut 1 quand la cible est nulle. */
export function coverageRatio(total: number, target: number): number {
  if (target <= 0) return 1;
  return snap(total / target);
}

/**
 * Décision de relance.
 *
 *   SI stock_total >= minimum  -> rien à faire, le produit n'apparaît PAS
 *   SINON  besoin = PLAFOND(cible − stock_total)
 */
export function decideReorder(
  product: ProductCalcConfig,
  target: ProductTarget,
  stock: Pick<CountedStock, 'qtySaladbar' | 'qtyFridge'>,
): ReorderDecision {
  const total = stockTotal(stock);
  const needsReorder = total < target.minimum;

  return {
    productId: product.id,
    stockTotal: total,
    target: target.target,
    minimum: target.minimum,
    needsReorder,
    qtyToProduce: needsReorder
      ? Math.max(ceilTo(target.target - total, PRODUCTION_STEP), 0)
      : 0,
    coverageRatio: coverageRatio(total, target.target),
    priority: product.priority,
    unit: product.unit,
  };
}

/**
 * Tri du rapport :
 *   1. priorité CROISSANTE (1 d'abord — 1 est le plus urgent)
 *   2. puis taux de couverture croissant (le plus dégarni en premier)
 * Le nom départage, pour un rendu stable.
 */
export function sortReorderDecisions(
  decisions: readonly ReorderDecision[],
  nameOf: (productId: string) => string = (id) => id,
): ReorderDecision[] {
  return [...decisions].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.coverageRatio !== b.coverageRatio) return a.coverageRatio - b.coverageRatio;
    return nameOf(a.productId).localeCompare(nameOf(b.productId), 'fr');
  });
}

export interface ReorderReport {
  /** Produits à relancer, triés par priorité puis par couverture. */
  toReorder: ReorderDecision[];
  /** Produits au-dessus du minimum : bloc replié « Stock suffisant ». */
  sufficient: ReorderDecision[];
}

/** Construit le rapport complet à partir des comptages. */
export function buildReorderReport(
  products: readonly ProductCalcConfig[],
  targets: ReadonlyMap<string, ProductTarget>,
  stocks: ReadonlyMap<string, Pick<CountedStock, 'qtySaladbar' | 'qtyFridge'>>,
): ReorderReport {
  const byId = new Map(products.map((product) => [product.id, product]));
  const decisions: ReorderDecision[] = [];

  for (const product of products) {
    const target = targets.get(product.id);
    if (!target) continue;
    decisions.push(
      decideReorder(product, target, stocks.get(product.id) ?? { qtySaladbar: 0, qtyFridge: 0 }),
    );
  }

  const nameOf = (id: string) => byId.get(id)?.name ?? id;

  return {
    toReorder: sortReorderDecisions(
      decisions.filter((decision) => decision.needsReorder),
      nameOf,
    ),
    sufficient: sortReorderDecisions(
      decisions.filter((decision) => !decision.needsReorder),
      nameOf,
    ),
  };
}

/**
 * Projection destinée au téléphone de l'employé.
 * Ni CA, ni base, ni cible, ni minimum, ni couverture ne sortent d'ici.
 */
export function toEmployeePayload(
  decisions: readonly ReorderDecision[],
): EmployeeReorderItem[] {
  return decisions.map((decision) => ({
    productId: decision.productId,
    qtyToProduce: decision.qtyToProduce,
    unit: decision.unit,
    priority: decision.priority,
  }));
}
