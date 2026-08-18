/**
 * §5.5 et §5.6 — Décision de relance, priorisation du rapport.
 *
 * C'est le cœur du produit : un produit AU-DESSUS de son seuil n'apparaît
 * JAMAIS dans la liste de relance.
 */

import { roundUpToStep, snap } from './rounding';
import type {
  CountedStock,
  EmployeeReorderItem,
  ProductCalcConfig,
  ProductTarget,
  ReorderDecision,
} from './types';

/**
 * Base de calcul du temps de prépa (§5.6) : `Σ besoin / production_step × prep_time_min`.
 *
 * ⚠️ Le cahier des charges décrit `prep_time_min` comme « temps de prépa PAR GASTRO »
 * mais donne une formule qui compte le nombre de PAS DE PRODUCTION. Avec un pas de
 * 0,5 les deux lectures diffèrent d'un facteur 2. La formule du §5.6 est appliquée
 * telle quelle ; basculer sur « par gastro » ne demande que de changer cette constante.
 */
export const PREP_TIME_BASIS: 'per_production_step' | 'per_bac' = 'per_production_step';

/** Somme saladbar + frigo. C'est ce total qui est comparé au seuil et à la cible. */
export function stockTotal(stock: Pick<CountedStock, 'qtySaladbar' | 'qtyFridge'>): number {
  return snap((stock.qtySaladbar ?? 0) + (stock.qtyFridge ?? 0));
}

/** Taux de couverture = stock / cible. Vaut 1 quand la cible est nulle (rien à couvrir). */
export function coverageRatio(total: number, target: number): number {
  if (target <= 0) return 1;
  return snap(total / target);
}

/**
 * §5.5 — Décision de relance.
 *
 *   SI stock_total >= seuil  -> rien à faire, le produit n'apparaît PAS
 *   SINON  besoin = arrondi_supérieur(target - stock_total, production_step)
 */
export function decideReorder(
  product: ProductCalcConfig,
  target: ProductTarget,
  stock: Pick<CountedStock, 'qtySaladbar' | 'qtyFridge'>,
): ReorderDecision {
  const total = stockTotal(stock);
  const needsReorder = total < target.reorderThreshold;
  const qtyToProduce = needsReorder
    ? Math.max(roundUpToStep(target.target - total, product.productionStep), 0)
    : 0;
  const coverage = coverageRatio(total, target.target);

  return {
    productId: product.id,
    stockTotal: total,
    target: target.target,
    reorderThreshold: target.reorderThreshold,
    needsReorder,
    qtyToProduce,
    coverageRatio: coverage,
    urgencyLevel: product.urgencyLevel,
    isCritical: needsReorder && (total === 0 || (product.urgencyLevel >= 4 && coverage < 0.25)),
  };
}

/**
 * §5.6 — Tri du rapport :
 *   1. urgency_level décroissant (5 -> 1)
 *   2. puis taux de couverture croissant (le plus dégarni en premier)
 * Le nom du produit départage à identique, pour un rendu stable.
 */
export function sortReorderDecisions(
  decisions: readonly ReorderDecision[],
  nameOf: (productId: string) => string = (id) => id,
): ReorderDecision[] {
  return [...decisions].sort((a, b) => {
    if (a.urgencyLevel !== b.urgencyLevel) return b.urgencyLevel - a.urgencyLevel;
    if (a.coverageRatio !== b.coverageRatio) return a.coverageRatio - b.coverageRatio;
    return nameOf(a.productId).localeCompare(nameOf(b.productId), 'fr');
  });
}

/** Temps de prépa total estimé, en minutes (§5.6). */
export function totalPrepTimeMinutes(
  decisions: readonly ReorderDecision[],
  products: ReadonlyMap<string, ProductCalcConfig>,
): number {
  return decisions.reduce((sum, decision) => {
    const product = products.get(decision.productId);
    if (!product?.prepTimeMin) return sum;
    const units =
      PREP_TIME_BASIS === 'per_production_step'
        ? decision.qtyToProduce / product.productionStep
        : decision.qtyToProduce;
    return snap(sum + units * product.prepTimeMin);
  }, 0);
}

export interface ReorderReport {
  /** Produits à relancer, déjà triés par urgence puis par couverture. */
  toReorder: ReorderDecision[];
  /** Produits au-dessus du seuil : bloc replié « Stock suffisant ». */
  sufficient: ReorderDecision[];
  totalPrepTimeMinutes: number;
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
    const stock = stocks.get(product.id) ?? { qtySaladbar: 0, qtyFridge: 0 };
    decisions.push(decideReorder(product, target, stock));
  }

  const nameOf = (id: string) => byId.get(id)?.name ?? id;
  const toReorder = sortReorderDecisions(
    decisions.filter((decision) => decision.needsReorder),
    nameOf,
  );

  return {
    toReorder,
    sufficient: sortReorderDecisions(
      decisions.filter((decision) => !decision.needsReorder),
      nameOf,
    ),
    totalPrepTimeMinutes: totalPrepTimeMinutes(toReorder, byId),
  };
}

/**
 * §5.8 — Projection destinée au téléphone de l'employé.
 * Ni CA, ni cible, ni seuil, ni taux de couverture ne sortent d'ici.
 */
export function toEmployeePayload(
  decisions: readonly ReorderDecision[],
): EmployeeReorderItem[] {
  return decisions.map((decision) => ({
    productId: decision.productId,
    qtyToProduce: decision.qtyToProduce,
    urgencyLevel: decision.urgencyLevel,
    isCritical: decision.isCritical,
  }));
}
