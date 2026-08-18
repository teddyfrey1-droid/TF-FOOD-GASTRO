/**
 * Passerelle entre les lignes Postgres et les types du moteur de calcul.
 *
 * Postgres renvoie les `numeric` en `string` via PostgREST dès que la précision
 * dépasse celle d'un double. On normalise ici une bonne fois pour toutes :
 * plus loin dans le code, tout est en `number`.
 */

import type {
  CalculatorRule,
  ProductCalcConfig,
  UrgencyLevel,
} from '@/lib/mep';
import type { Tables } from '@/lib/supabase/database.types';

/** Convertit un numeric PostgREST (number | string | null) en number. */
export function toNumber(value: number | string | null | undefined, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Idem, mais conserve l'absence de valeur (plancher / plafond non renseignés). */
export function toNullableNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toUrgency(value: number | string | null | undefined): UrgencyLevel {
  const parsed = Math.round(toNumber(value, 3));
  return Math.min(5, Math.max(1, parsed)) as UrgencyLevel;
}

export function toProductCalcConfig(row: Tables<'products'>): ProductCalcConfig {
  return {
    id: row.id,
    name: row.name,
    countStep: toNumber(row.count_step, 0.5),
    productionStep: toNumber(row.production_step, 0.5),
    reorderMode: row.reorder_mode,
    reorderRatio: toNullableNumber(row.reorder_ratio),
    reorderFixed: toNullableNumber(row.reorder_fixed),
    floorQty: toNullableNumber(row.floor_qty),
    ceilingQty: toNullableNumber(row.ceiling_qty),
    urgencyLevel: toUrgency(row.urgency_level),
    prepTimeMin: toNullableNumber(row.prep_time_min),
  };
}

export function toCalculatorRule(row: Tables<'calculator_rules'>): CalculatorRule {
  return {
    productId: row.product_id,
    mode: row.mode,
    caMin: toNullableNumber(row.ca_min),
    caMax: toNullableNumber(row.ca_max),
    targetQty: toNullableNumber(row.target_qty),
    qtyPer1000Eur: toNullableNumber(row.qty_per_1000_eur),
  };
}

/** Regroupe les règles par produit, en ne gardant que celles en vigueur à la date donnée. */
export function groupRulesByProduct(
  rows: readonly Tables<'calculator_rules'>[],
  onDate: string,
): Map<string, CalculatorRule[]> {
  const byProduct = new Map<string, CalculatorRule[]>();

  for (const row of rows) {
    if (row.valid_from > onDate) continue;
    if (row.valid_to !== null && row.valid_to < onDate) continue;

    const rules = byProduct.get(row.product_id) ?? [];
    rules.push(toCalculatorRule(row));
    byProduct.set(row.product_id, rules);
  }

  return byProduct;
}
