/**
 * Passerelle entre les lignes Postgres et les types du moteur de calcul.
 *
 * Postgres renvoie les `numeric` en `string` via PostgREST dès que la précision
 * dépasse celle d'un double. On normalise ici une bonne fois pour toutes :
 * plus loin dans le code, tout est en `number`.
 */

import type { ProductCalcConfig, Priority } from '@/lib/mep';
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

function toPriority(value: number | string | null | undefined): Priority {
  const parsed = Math.round(toNumber(value, 3));
  return Math.min(5, Math.max(1, parsed)) as Priority;
}

export function toProductCalcConfig(row: Tables<'products'>): ProductCalcConfig {
  return {
    id: row.id,
    name: row.name,
    family: row.family,
    unit: row.unit,
    baseQty: toNumber(row.base_qty, 0),
    countStep: toNumber(row.count_step, 0.5),
    minMode: row.min_mode,
    minDivisor: toNumber(row.min_divisor, 2),
    minQtyManual: toNullableNumber(row.min_qty_manual),
    floorQty: toNullableNumber(row.floor_qty),
    ceilingQty: toNullableNumber(row.ceiling_qty),
    priority: toPriority(row.priority),
  };
}
