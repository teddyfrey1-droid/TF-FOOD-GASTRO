import 'server-only';

import { createClient } from '@/lib/supabase/server';
import {
  snap,
  averageObservedRatio,
  computeServiceConsumption,
  eveningToLunchRatio,
  per1000,
  ratioDeviation,
} from '@/lib/mep';
import { toNullableNumber, toNumber } from './mappers';
import { addDays } from '@/lib/mep/isoWeek';
import type { SessionKind } from '@/lib/supabase/database.types';

export interface SessionSummary {
  id: string;
  date: string;
  session: SessionKind;
  status: 'draft' | 'submitted';
  submittedAt: string | null;
  authorName: string | null;
  forecastSnapshot: number | null;
  productsCounted: number;
  productsTotal: number;
  productsDeferred: number;
  tasksTotal: number;
  tasksDone: number;
  /** Relances qui étaient sous le seuil critique ce jour-là. */
  tasksCritical: number;
  /** Durée entre l'ouverture et la validation, en minutes. */
  durationMinutes: number | null;
}

export interface HistoryFilters {
  from: string;
  to: string;
  session?: SessionKind;
  userId?: string;
  productId?: string;
}

/**
 * Historique des comptages.
 *
 * Passe par `mep_count_history` : le chiffre d'affaires figé n'est plus
 * lisible en colonne, et la fonction ne le renvoie qu'à un directeur. Un
 * assistant manager obtient donc les mêmes lignes, avec un CA à null.
 */
export async function getSessions(filters: HistoryFilters): Promise<SessionSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc('mep_count_history', {
    d_from: filters.from,
    d_to: filters.to,
  });

  return (data ?? [])
    .filter((row) => {
      if (filters.session && row.session !== filters.session) return false;
      if (filters.userId && row.user_id !== filters.userId) return false;
      return true;
    })
    .map((row) => ({
      id: row.id,
      date: row.date,
      session: row.session,
      status: row.status,
      submittedAt: row.submitted_at,
      authorName: row.author_name,
      forecastSnapshot: toNullableNumber(row.forecast_revenue),
      productsCounted: row.products_counted,
      productsTotal: row.products_total,
      productsDeferred: row.products_deferred,
      tasksTotal: row.tasks_total,
      tasksDone: row.tasks_done,
      tasksCritical: row.tasks_critical,
      durationMinutes:
        row.submitted_at && row.started_at
          ? Math.round(
              (new Date(row.submitted_at).getTime() - new Date(row.started_at).getTime()) / 60000,
            )
          : null,
    }));
}

export interface SessionDetailLine {
  productId: string;
  productName: string;
  categoryName: string;
  unit: string | null;
  qtySaladbar: number;
  qtyFridge: number;
  qtyTotal: number;
  /** Nul pour un assistant manager : les cibles restent au back-office. */
  targetSnapshot: number | null;
  thresholdSnapshot: number | null;
  criticalSnapshot: number | null;
  productionNeeded: number | null;
  isNotApplicable: boolean;
  notApplicableReason: string | null;
  isDeferred: boolean;
  deferredReason: string | null;
  taskDone: boolean | null;
}

/**
 * Détail d'un comptage passé.
 *
 * Passe par `mep_count_detail` plutôt que par la table : les cibles et
 * seuils figés ne sont plus lisibles en colonne, et la fonction les rend
 * NULLES pour un assistant manager. La confidentialité tient donc en base,
 * pas dans ce fichier.
 */
export async function getSessionDetail(sessionId: string): Promise<SessionDetailLine[]> {
  const supabase = await createClient();

  const [{ data: lines }, { data: tasks }] = await Promise.all([
    supabase.rpc('mep_count_detail', { p_session_id: sessionId }),
    supabase.from('production_tasks').select('product_id, is_done').eq('session_id', sessionId),
  ]);

  const taskByProduct = new Map((tasks ?? []).map((task) => [task.product_id, task.is_done]));

  return (lines ?? []).map((line) => ({
    productId: line.product_id,
    productName: line.product_name,
    categoryName: line.category_name,
    unit: line.unit,
    qtySaladbar: toNumber(line.qty_saladbar, 0),
    qtyFridge: toNumber(line.qty_fridge, 0),
    qtyTotal: toNumber(line.qty_total, 0),
    targetSnapshot: toNullableNumber(line.target),
    thresholdSnapshot: toNullableNumber(line.minimum),
    criticalSnapshot: toNullableNumber(line.critical),
    productionNeeded: toNullableNumber(line.to_produce),
    isNotApplicable: line.is_not_applicable,
    notApplicableReason: line.not_applicable_reason,
    isDeferred: line.deferred_at !== null,
    deferredReason: line.deferred_reason,
    taskDone: taskByProduct.get(line.product_id) ?? null,
  }));
}

export interface ConsumptionRow {
  productId: string;
  productName: string;
  /** Gastros consommés en moyenne au service du midi. */
  lunchAvg: number | null;
  /** Gastros consommés en moyenne au service du soir. */
  eveningAvg: number | null;
  /** Consommation moyenne de la journée entière, pour 1 000 € de CA. */
  dailyPer1000: number | null;
  /** Cible théorique du calculateur, pour les produits réglés au ratio. */
  theoreticalPer1000: number | null;
  /** Marge entre la cible et la consommation. Positive = marge de sécurité. */
  deviation: number | null;
  /** Soir / midi. Sous 1, la cible du soir peut être abaissée. */
  eveningRatio: number | null;
  /** Nombre de journées complètes (les deux services mesurés). */
  completeDays: number;
  /** Nombre de journées où seul le midi a pu être mesuré. */
  lunchOnlyDays: number;
  /** Base en vigueur (par tranche de 1 000 €), pour proposer une correction. */
  baseQty: number;
}

export interface ConsumptionReport {
  rows: ConsumptionRow[];
  /** Soir / midi, tous produits confondus : suggestion pour afternoon_target_ratio. */
  overallEveningRatio: number | null;
  /** Journées entièrement mesurées sur la période. */
  completeDays: number;
}

/**
 * §5.7 — Consommation réelle des deux services.
 *
 * Une journée est entièrement mesurable quand elle a ses deux comptages ET
 * que le comptage du LENDEMAIN matin existe : c'est lui qui ferme le service
 * du soir, puisque les invendus ne sont pas jetés.
 */
export async function getConsumption(from: string, to: string): Promise<ConsumptionReport> {
  const supabase = await createClient();

  // On lit un jour de plus que la période demandée : le comptage du lendemain
  // matin est nécessaire pour clore le dernier soir.
  const toPlusOne = addDays(to, 1);

  const [{ data: sessions }, { data: actuals }, { data: products }] =
    await Promise.all([
      supabase
        .from('count_sessions')
        .select('id, date, session, status')
        .gte('date', from)
        .lte('date', toPlusOne)
        .eq('status', 'submitted'),
      supabase.from('revenue_actuals').select('date, revenue_ht').gte('date', from).lte('date', to),
      supabase.from('products').select('id, name, base_qty, family').eq('is_active', true),
    ]);

  const sessionRows = sessions ?? [];
  const sessionId = (date: string, kind: 'morning' | 'afternoon') =>
    sessionRows.find((row) => row.date === date && row.session === kind)?.id ?? null;

  const dailyRevenue = new Map(
    (actuals ?? []).map((row) => [row.date, toNullableNumber(row.revenue_ht)] as const),
  );

  // Une journée exploitable a ses deux comptages validés et son CA connu.
  const dates = [...new Set(sessionRows.map((row) => row.date))]
    .filter((date) => date >= from && date <= to)
    .filter(
      (date) =>
        (dailyRevenue.get(date) ?? 0) > 0 &&
        sessionId(date, 'morning') !== null &&
        sessionId(date, 'afternoon') !== null,
    )
    .sort();

  const relevantSessionIds = sessionRows.map((row) => row.id);

  const [{ data: lines }, { data: tasks }] = relevantSessionIds.length
    ? await Promise.all([
        supabase
          .from('count_lines')
          .select('session_id, product_id, qty_total')
          .in('session_id', relevantSessionIds),
        supabase
          .from('production_tasks')
          .select('session_id, product_id, qty_to_produce, is_done')
          .in('session_id', relevantSessionIds),
      ])
    : [{ data: [] }, { data: [] }];

  const stockOf = (session: string | null, productId: string): number | null => {
    if (!session) return null;
    const line = (lines ?? []).find(
      (row) => row.session_id === session && row.product_id === productId,
    );
    return line ? toNumber(line.qty_total, 0) : null;
  };

  const producedIn = (session: string | null, productId: string): number =>
    (tasks ?? [])
      .filter((task) => task.session_id === session && task.product_id === productId && task.is_done)
      .reduce((sum, task) => sum + toNumber(task.qty_to_produce, 0), 0);

  // Consommation « théorique » pour 1 000 € de CA. La base EST cette
  // quantité : elle s'exprime déjà par tranche de 1 000 €.
  const theoreticalByProduct = new Map(
    (products ?? []).map(
      (product) => [product.id, snap(toNumber(product.base_qty, 0))] as const,
    ),
  );

  let overallLunch = 0;
  let overallEvening = 0;
  const completeDates = new Set<string>();

  const rows = (products ?? []).map((product) => {
    const lunchSamples: number[] = [];
    const eveningSamples: number[] = [];
    const dailyRatioSamples: (number | null)[] = [];
    let lunchOnlyDays = 0;

    for (const date of dates) {
      const morning = sessionId(date, 'morning');
      const afternoon = sessionId(date, 'afternoon');
      const nextMorning = sessionId(addDays(date, 1), 'morning');

      const stockMorning = stockOf(morning, product.id);
      const stockAfternoon = stockOf(afternoon, product.id);
      if (stockMorning === null || stockAfternoon === null) continue;

      const result = computeServiceConsumption({
        productId: product.id,
        stockMorning,
        productionMorningDone: producedIn(morning, product.id),
        stockAfternoon,
        productionAfternoonDone: producedIn(afternoon, product.id),
        stockNextMorning: stockOf(nextMorning, product.id),
      });

      // Une consommation négative est une erreur de comptage, pas une vente :
      // on l'écarte plutôt que de la laisser fausser la moyenne.
      if (result.lunch < 0) continue;
      lunchSamples.push(result.lunch);

      if (!result.isComplete || result.evening === null || result.evening < 0) {
        lunchOnlyDays += 1;
        continue;
      }

      eveningSamples.push(result.evening);
      dailyRatioSamples.push(per1000(result.daily, dailyRevenue.get(date) ?? null));
      completeDates.add(date);

      overallLunch += result.lunch;
      overallEvening += result.evening;
    }

    const lunchAvg = averageObservedRatio(lunchSamples);
    const eveningAvg = averageObservedRatio(eveningSamples);
    const dailyPer1000 = averageObservedRatio(dailyRatioSamples);
    const theoretical = theoreticalByProduct.get(product.id) ?? null;

    return {
      productId: product.id,
      productName: product.name,
      lunchAvg,
      eveningAvg,
      dailyPer1000,
      theoreticalPer1000: theoretical,
      deviation: ratioDeviation(theoretical, dailyPer1000),
      eveningRatio: eveningToLunchRatio(lunchAvg, eveningAvg),
      completeDays: eveningSamples.length,
      lunchOnlyDays,
      baseQty: toNumber(product.base_qty, 0),
    };
  });

  return {
    rows,
    overallEveningRatio: eveningToLunchRatio(overallLunch, overallEvening),
    completeDays: completeDates.size,
  };
}
