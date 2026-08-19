'use server';

import { simulateTargets, type SimulationRow } from '@/lib/admin/queries';
import { ceilTo } from '@/lib/mep';

export interface SimulationLine extends SimulationRow {
  /** Stock fictif saisi par le directeur, s'il en a saisi un. */
  stock: number | null;
  needsReorder: boolean;
  qtyToProduce: number;
}

export interface SimulationResult {
  caRef: number;
  lines: SimulationLine[];
  error?: string;
}

/**
 * « Je saisis un CA, j'obtiens la cible et le minimum de chaque produit ;
 * puis un stock fictif, et je vois la relance qui en découle. »
 *
 * Aucune écriture en base : c'est un bac à sable pour valider un réglage
 * avant de l'appliquer.
 */
export async function runSimulation(input: {
  caRef: number;
  stocks?: Record<string, number>;
}): Promise<SimulationResult> {
  if (!Number.isFinite(input.caRef) || input.caRef < 0) {
    return { caRef: 0, lines: [], error: 'Saisissez un chiffre d’affaires positif.' };
  }

  const rows = await simulateTargets(input.caRef);

  const lines: SimulationLine[] = rows.map((row) => {
    const stock = input.stocks?.[row.productId];
    const total = stock !== undefined && Number.isFinite(stock) ? stock : null;
    const needsReorder = total !== null && total < row.minimum;

    return {
      ...row,
      stock: total,
      needsReorder,
      qtyToProduce: needsReorder ? Math.max(ceilTo(row.target - total, 1), 0) : 0,
    };
  });

  return { caRef: input.caRef, lines };
}
