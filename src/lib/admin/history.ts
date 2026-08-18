import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { averageObservedRatio, computeLunchConsumption, ratioDeviation } from '@/lib/mep';
import { toNullableNumber, toNumber } from './mappers';
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
  tasksTotal: number;
  tasksDone: number;
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

export async function getSessions(filters: HistoryFilters): Promise<SessionSummary[]> {
  const supabase = await createClient();

  let query = supabase
    .from('count_sessions')
    .select('id, date, session, status, started_at, submitted_at, user_id, forecast_revenue_snapshot')
    .gte('date', filters.from)
    .lte('date', filters.to)
    .order('date', { ascending: false })
    .order('session', { ascending: true });

  if (filters.session) query = query.eq('session', filters.session);
  if (filters.userId) query = query.eq('user_id', filters.userId);

  const [{ data: sessions }, { data: team }] = await Promise.all([
    query,
    supabase.from('team_members').select('id, full_name'),
  ]);

  const ids = (sessions ?? []).map((session) => session.id);
  if (ids.length === 0) return [];

  const [{ data: lines }, { data: tasks }] = await Promise.all([
    supabase.from('count_lines').select('session_id, counted_at, product_id').in('session_id', ids),
    supabase.from('production_tasks').select('session_id, is_done').in('session_id', ids),
  ]);

  const nameById = new Map((team ?? []).map((member) => [member.id, member.full_name]));

  return (sessions ?? []).map((session) => {
    const sessionLines = (lines ?? []).filter((line) => line.session_id === session.id);
    const sessionTasks = (tasks ?? []).filter((task) => task.session_id === session.id);

    const durationMinutes =
      session.submitted_at && session.started_at
        ? Math.round(
            (new Date(session.submitted_at).getTime() - new Date(session.started_at).getTime()) /
              60000,
          )
        : null;

    return {
      id: session.id,
      date: session.date,
      session: session.session,
      status: session.status,
      submittedAt: session.submitted_at,
      authorName: nameById.get(session.user_id) ?? null,
      forecastSnapshot: toNullableNumber(session.forecast_revenue_snapshot),
      productsCounted: sessionLines.filter((line) => line.counted_at !== null).length,
      productsTotal: sessionLines.length,
      tasksTotal: sessionTasks.length,
      tasksDone: sessionTasks.filter((task) => task.is_done).length,
      durationMinutes,
    };
  });
}

export interface SessionDetailLine {
  productId: string;
  productName: string;
  categoryName: string;
  gnFormat: string | null;
  qtySaladbar: number;
  qtyFridge: number;
  qtyTotal: number;
  targetSnapshot: number | null;
  thresholdSnapshot: number | null;
  productionNeeded: number | null;
  isNotApplicable: boolean;
  notApplicableReason: string | null;
  taskDone: boolean | null;
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetailLine[]> {
  const supabase = await createClient();

  const [{ data: lines }, { data: products }, { data: categories }, { data: tasks }] =
    await Promise.all([
      supabase.from('count_lines').select('*').eq('session_id', sessionId),
      supabase.from('products').select('id, name, category_id, gn_format'),
      supabase.from('product_categories').select('id, name'),
      supabase.from('production_tasks').select('product_id, is_done').eq('session_id', sessionId),
    ]);

  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const categoryById = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const taskByProduct = new Map((tasks ?? []).map((task) => [task.product_id, task.is_done]));

  return (lines ?? [])
    .map((line) => {
      const product = productById.get(line.product_id);
      return {
        productId: line.product_id,
        productName: product?.name ?? '—',
        categoryName: product ? (categoryById.get(product.category_id) ?? '—') : '—',
        gnFormat: product?.gn_format ?? null,
        qtySaladbar: toNumber(line.qty_saladbar, 0),
        qtyFridge: toNumber(line.qty_fridge, 0),
        qtyTotal: toNumber(line.qty_total, 0),
        targetSnapshot: toNullableNumber(line.target_snapshot),
        thresholdSnapshot: toNullableNumber(line.reorder_threshold_snapshot),
        productionNeeded: toNullableNumber(line.production_needed_snapshot),
        isNotApplicable: line.is_not_applicable,
        notApplicableReason: line.not_applicable_reason,
        taskDone: taskByProduct.get(line.product_id) ?? null,
      };
    })
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'fr') || a.productName.localeCompare(b.productName, 'fr'));
}

export interface ConsumptionRow {
  productId: string;
  productName: string;
  /** Moyenne des gastros consommés le midi, par tranche de 1 000 € de CA. */
  observedPer1000: number | null;
  /** Ratio théorique du calculateur, s'il est exprimé en ratio. */
  theoreticalPer1000: number | null;
  deviation: number | null;
  sampleDays: number;
}

/**
 * §5.7 — Consommation réelle du midi, sur une fenêtre glissante.
 *
 *   conso_midi = (stock_matin + production_matin_cochée) − stock_aprem
 *   conso_pour_1000€ = conso_midi / (CA_réel_midi / 1000)
 *
 * Ne retient que les jours où les DEUX comptages ont été validés et où le CA
 * du midi est connu : sans cela, le ratio n'est pas comparable.
 */
export async function getConsumption(from: string, to: string): Promise<ConsumptionRow[]> {
  const supabase = await createClient();

  const [{ data: sessions }, { data: actuals }, { data: products }, { data: rules }] =
    await Promise.all([
      supabase
        .from('count_sessions')
        .select('id, date, session, status')
        .gte('date', from)
        .lte('date', to)
        .eq('status', 'submitted'),
      supabase.from('revenue_actuals').select('date, revenue_lunch_ht').gte('date', from).lte('date', to),
      supabase.from('products').select('id, name').eq('is_active', true),
      supabase.from('calculator_rules').select('product_id, mode, qty_per_1000_eur, valid_to'),
    ]);

  const lunchByDate = new Map(
    (actuals ?? [])
      .map((row) => [row.date, toNullableNumber(row.revenue_lunch_ht)] as const)
      .filter(([, value]) => value !== null && value > 0),
  );

  // Un jour n'est exploitable que s'il a ses deux comptages ET un CA du midi.
  const usableDates = [...new Set((sessions ?? []).map((session) => session.date))].filter(
    (date) =>
      lunchByDate.has(date) &&
      (sessions ?? []).some((s) => s.date === date && s.session === 'morning') &&
      (sessions ?? []).some((s) => s.date === date && s.session === 'afternoon'),
  );

  if (usableDates.length === 0) {
    return (products ?? []).map((product) => ({
      productId: product.id,
      productName: product.name,
      observedPer1000: null,
      theoreticalPer1000: null,
      deviation: null,
      sampleDays: 0,
    }));
  }

  const sessionIds = (sessions ?? [])
    .filter((session) => usableDates.includes(session.date))
    .map((session) => session.id);

  const [{ data: lines }, { data: tasks }] = await Promise.all([
    supabase.from('count_lines').select('session_id, product_id, qty_total').in('session_id', sessionIds),
    supabase
      .from('production_tasks')
      .select('session_id, product_id, qty_to_produce, is_done')
      .in('session_id', sessionIds),
  ]);

  const theoreticalByProduct = new Map(
    (rules ?? [])
      .filter((rule) => rule.mode === 'ratio' && rule.valid_to === null)
      .map((rule) => [rule.product_id, toNullableNumber(rule.qty_per_1000_eur)] as const),
  );

  return (products ?? []).map((product) => {
    const samples: (number | null)[] = [];

    for (const date of usableDates) {
      const morning = (sessions ?? []).find((s) => s.date === date && s.session === 'morning');
      const afternoon = (sessions ?? []).find((s) => s.date === date && s.session === 'afternoon');
      if (!morning || !afternoon) continue;

      const stockMorning = (lines ?? []).find(
        (line) => line.session_id === morning.id && line.product_id === product.id,
      );
      const stockAfternoon = (lines ?? []).find(
        (line) => line.session_id === afternoon.id && line.product_id === product.id,
      );
      if (!stockMorning || !stockAfternoon) continue;

      const producedMorning = (tasks ?? [])
        .filter(
          (task) =>
            task.session_id === morning.id && task.product_id === product.id && task.is_done,
        )
        .reduce((sum, task) => sum + toNumber(task.qty_to_produce, 0), 0);

      const result = computeLunchConsumption(
        {
          productId: product.id,
          stockMorning: toNumber(stockMorning.qty_total, 0),
          productionMorningDone: producedMorning,
          stockAfternoon: toNumber(stockAfternoon.qty_total, 0),
        },
        lunchByDate.get(date) ?? null,
      );

      // Une consommation négative signale une erreur de comptage, pas une vente.
      if (result.consumedLunch >= 0) samples.push(result.consumedPer1000Eur);
    }

    const observed = averageObservedRatio(samples);
    const theoretical = theoreticalByProduct.get(product.id) ?? null;

    return {
      productId: product.id,
      productName: product.name,
      observedPer1000: observed,
      theoreticalPer1000: theoretical,
      deviation: ratioDeviation(theoretical, observed),
      sampleDays: samples.filter((sample) => sample !== null).length,
    };
  });
}
