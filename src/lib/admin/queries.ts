import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { computeProductTarget, type ProductTarget, type RevenueSettings } from '@/lib/mep';
import { groupRulesByProduct, toNumber, toProductCalcConfig } from './mappers';
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
    defaultReorderRatio: toNumber(data?.default_reorder_ratio, 0.5),
    showTargetsToEmployees: data?.show_targets_to_employees ?? false,
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

export async function getCalculatorRules(): Promise<Tables<'calculator_rules'>[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('calculator_rules')
    .select('*')
    .order('ca_min', { ascending: true, nullsFirst: true });
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
  gnFormat: string | null;
  urgencyLevel: number;
  target: number;
  reorderThreshold: number;
  hasRule: boolean;
}

/**
 * Simulateur (§7.3) : « je saisis un CA, j'obtiens la cible et le seuil de
 * chaque produit ». Le calcul tourne ici en TypeScript, avec exactement les
 * mêmes règles que la fonction SQL utilisée à la validation d'un comptage —
 * les deux implémentations sont couvertes par les mêmes cas de test.
 */
export async function simulateTargets(
  caRef: number,
  onDate: string,
): Promise<SimulationRow[]> {
  const [products, rules, settings] = await Promise.all([
    getProducts(false),
    getCalculatorRules(),
    getRevenueSettings(),
  ]);

  const rulesByProduct = groupRulesByProduct(rules, onDate);

  return products.map((product) => {
    const config = toProductCalcConfig(product);
    const target: ProductTarget = computeProductTarget(
      config,
      rulesByProduct.get(product.id) ?? [],
      caRef,
      settings.defaultReorderRatio,
    );

    return {
      productId: product.id,
      productName: product.name,
      categoryName: product.category?.name ?? '—',
      gnFormat: product.gn_format,
      urgencyLevel: product.urgency_level,
      target: target.target,
      reorderThreshold: target.reorderThreshold,
      hasRule: target.hasRule,
    };
  });
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
