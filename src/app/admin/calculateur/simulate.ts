'use server';

import { simulateTargets, type SimulationRow } from '@/lib/admin/queries';
import { todayInParis } from '@/lib/format';
import { referenceRevenueForSession, roundUpToStep, snap } from '@/lib/mep';
import type { RevenueSettings } from '@/lib/mep';
import type { SessionKind } from '@/lib/supabase/database.types';

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
 * Simulateur du §7.3 : « je saisis un CA, j'obtiens la cible et le seuil de
 * chaque produit ; puis un stock fictif, et je vois la relance qui en découle ».
 *
 * Aucune écriture en base : c'est un bac à sable pour valider un réglage avant
 * de l'appliquer.
 */
export async function runSimulation(input: {
  forecastRevenue: number;
  session: SessionKind;
  settings: RevenueSettings;
  stocks?: Record<string, number>;
}): Promise<SimulationResult> {
  if (!Number.isFinite(input.forecastRevenue) || input.forecastRevenue < 0) {
    return { caRef: 0, lines: [], error: 'Saisissez un chiffre d’affaires positif.' };
  }

  const caRef = referenceRevenueForSession(input.forecastRevenue, input.session, input.settings);
  const rows = await simulateTargets(caRef, todayInParis());

  const lines: SimulationLine[] = rows.map((row) => {
    const stock = input.stocks?.[row.productId];
    const hasStock = stock !== undefined && Number.isFinite(stock);
    const total = hasStock ? snap(stock) : null;
    const needsReorder = total !== null && total < row.reorderThreshold;

    return {
      ...row,
      stock: total,
      needsReorder,
      qtyToProduce: needsReorder ? Math.max(roundUpToStep(row.target - total, 0.5), 0) : 0,
    };
  });

  return { caRef, lines };
}
