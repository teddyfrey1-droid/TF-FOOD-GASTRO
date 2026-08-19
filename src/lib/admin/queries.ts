import 'server-only';

import { createClient } from '@/lib/supabase/server';
import {
  computeProductTarget,
  observedGrowthRate,
  referenceDateLastYear,
  type GrowthObservation,
  type GrowthSample,
  type RevenueSettings,
} from '@/lib/mep';
import { toNumber, toProductCalcConfig } from './mappers';
import type { SessionKind, Tables } from '@/lib/supabase/database.types';

/**
 * Toutes les lectures passent par le client porteur du JWT : la RLS s'applique.
 * Un employé qui atteindrait ces fonctions recevrait des listes vides, pas une
 * fuite de données.
 */

export async function getRevenueSettings(): Promise<RevenueSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from('revenue_settings').select('*').maybeSingle();

  return {
    growthRate: toNumber(data?.growth_rate, 0),
    safetyMargin: toNumber(data?.safety_margin, 0.1),
    afternoonTargetRatio: toNumber(data?.afternoon_target_ratio, 1),
    defaultMinDivisor: toNumber(data?.default_min_divisor, 2),
    showTargetsToEmployees: data?.show_targets_to_employees ?? false,
    // Postgres renvoie « 07:30:00 » ; l'input type=time attend « 07:30 ».
    morningReminderTime: data?.morning_reminder_time?.slice(0, 5) ?? null,
    afternoonReminderTime: data?.afternoon_reminder_time?.slice(0, 5) ?? null,
  };
}

export interface ProductWithCategory extends Tables<'products'> {
  category: { id: string; name: string; sort_order: number } | null;
}

export async function getProducts(includeInactive = true): Promise<ProductWithCategory[]> {
  const supabase = await createClient();
  let query = supabase
    .from('products')
    .select('*, category:product_categories(id, name, sort_order)')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!includeInactive) query = query.eq('is_active', true);

  const { data } = await query;
  return (data ?? []) as unknown as ProductWithCategory[];
}

export async function getCategories(): Promise<Tables<'product_categories'>[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('product_categories')
    .select('*')
    .order('sort_order', { ascending: true });
  return data ?? [];
}

export async function getFamilySettings(): Promise<Tables<'product_family_settings'>[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('product_family_settings').select('*').order('family');
  return data ?? [];
}

/** CA prévisionnel d'un jour, calculé côté base (§5.1). */
export async function getForecastRevenue(date: string): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('mep_forecast_revenue', { d: date });
  return data === null || data === undefined ? null : toNumber(data as number, 0);
}

/** CA de référence d'un jour pour une session (§5.2). */
export async function getReferenceRevenue(
  date: string,
  session: SessionKind,
): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('mep_reference_revenue', { d: date, p_session: session });
  return data === null || data === undefined ? null : toNumber(data as number, 0);
}

export interface SimulationRow {
  productId: string;
  productName: string;
  categoryName: string;
  family: string;
  unit: string;
  baseQty: number;
  priority: number;
  target: number;
  minimum: number;
}

/**
 * Simulateur : « je saisis un CA, j'obtiens la cible et le minimum de chaque
 * produit ». Le calcul tourne ici en TypeScript, avec exactement les mêmes
 * règles que la fonction SQL utilisée à la validation d'un comptage — les deux
 * implémentations sont couvertes par le même tableau de vérification.
 */
export async function simulateTargets(caRef: number): Promise<SimulationRow[]> {
  const [products, settings] = await Promise.all([getProducts(false), getRevenueSettings()]);

  return products.map((product) => {
    const config = toProductCalcConfig(product);
    const target = computeProductTarget(config, caRef, settings.defaultMinDivisor);

    return {
      productId: product.id,
      productName: product.name,
      categoryName: product.category?.name ?? '—',
      family: product.family,
      unit: product.unit,
      baseQty: config.baseQty,
      priority: config.priority,
      target: target.target,
      minimum: target.minimum,
    };
  });
}

/**
 * Croissance réellement constatée sur une période.
 *
 * Compare, jour par jour, le CA réalisé au CA du même jour de semaine de
 * l'an dernier — exactement la référence qu'utilise la prévision.
 */
export async function getObservedGrowth(from: string, to: string): Promise<GrowthObservation> {
  const supabase = await createClient();

  const { data: actuals } = await supabase
    .from('revenue_actuals')
    .select('date, revenue_ht')
    .gte('date', from)
    .lte('date', to);

  if (!actuals || actuals.length === 0) {
    return { observedRate: null, sampleDays: 0, totalActual: 0, totalReference: 0 };
  }

  const referenceByDate = new Map(
    actuals.map((row) => [row.date, referenceDateLastYear(row.date)] as const),
  );

  const { data: history } = await supabase
    .from('revenue_history')
    .select('date, revenue_ht, is_closed_day')
    .in('date', [...new Set(referenceByDate.values())]);

  const historyByDate = new Map((history ?? []).map((row) => [row.date, row]));

  const samples: GrowthSample[] = [];
  for (const row of actuals) {
    const reference = historyByDate.get(referenceByDate.get(row.date)!);
    // Un jour de fermeture l'an dernier ne dit rien de la croissance.
    if (!reference || reference.is_closed_day) continue;
    samples.push({
      date: row.date,
      actualHt: toNumber(row.revenue_ht, 0),
      referenceHt: toNumber(reference.revenue_ht, 0),
    });
  }

  return observedGrowthRate(samples);
}

export interface DailyCountStatus {
  session: SessionKind;
  status: 'submitted' | 'draft' | null;
  submittedAt: string | null;
  userName: string | null;
  pendingTasks: number;
  doneTasks: number;
}

export async function getDailyCountStatus(date: string): Promise<DailyCountStatus[]> {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from('count_sessions')
    .select('id, session, status, submitted_at, profiles:user_id(full_name)')
    .eq('date', date);

  const { data: tasks } = await supabase
    .from('production_tasks')
    .select('session_id, is_done')
    .in('session_id', (sessions ?? []).map((s) => s.id));

  const rows = (sessions ?? []) as unknown as Array<{
    id: string;
    session: SessionKind;
    status: 'submitted' | 'draft';
    submitted_at: string | null;
    profiles: { full_name: string } | null;
  }>;

  return (['morning', 'afternoon'] as const).map((session) => {
    const row = rows.find((candidate) => candidate.session === session);
    const sessionTasks = (tasks ?? []).filter((task) => task.session_id === row?.id);

    return {
      session,
      status: row?.status ?? null,
      submittedAt: row?.submitted_at ?? null,
      userName: row?.profiles?.full_name ?? null,
      pendingTasks: sessionTasks.filter((task) => !task.is_done).length,
      doneTasks: sessionTasks.filter((task) => task.is_done).length,
    };
  });
}
