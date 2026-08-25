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
    defaultCritDivisor: toNumber(data?.default_crit_divisor, 4),
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
async function collectGrowthSamples(from: string, to: string): Promise<GrowthSample[]> {
  const supabase = await createClient();

  const { data: actuals } = await supabase
    .from('revenue_actuals')
    .select('date, revenue_ht')
    .gte('date', from)
    .lte('date', to);

  if (!actuals || actuals.length === 0) return [];

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

  return samples;
}

export async function getObservedGrowth(from: string, to: string): Promise<GrowthObservation> {
  return observedGrowthRate(await collectGrowthSamples(from, to));
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

/** Décale une date ISO de N jours (calendrier, pas de fuseau). */
function shiftDays(date: string, days: number): string {
  const cursor = new Date(`${date}T12:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

export interface GrowthWindowResult {
  label: string;
  days: number;
  observation: GrowthObservation;
}

/**
 * La croissance constatée sur trois fenêtres.
 *
 * Trois plutôt qu'une : sur douze mois l'enseigne affiche une croissance très
 * forte, mais qui ralentit trimestre après trimestre. Montrer les trois
 * fenêtres côte à côte laisse choisir en connaissance de cause.
 */
export async function getGrowthWindows(today: string): Promise<GrowthWindowResult[]> {
  const windows = [
    { label: '3 derniers mois', days: 90 },
    { label: '6 derniers mois', days: 180 },
    { label: '12 derniers mois', days: 365 },
  ];

  // Les trois fenêtres se déduisent d'un SEUL jeu de données : la plus
  // large les contient toutes. Interroger la base une fois par fenêtre
  // coûtait six requêtes là où deux suffisent.
  const widest = Math.max(...windows.map((window) => window.days));
  const samples = await collectGrowthSamples(shiftDays(today, -widest), today);

  return windows.map((window) => {
    const since = shiftDays(today, -window.days);
    return {
      ...window,
      observation: observedGrowthRate(samples.filter((sample) => sample.date >= since)),
    };
  });
}

export interface RevenueCoverage {
  days: number;
  firstDate: string | null;
  lastDate: string | null;
  lastRevenue: number | null;
}

/**
 * Ce que la base sait vraiment du chiffre d'affaires.
 *
 * Affiché tel quel sur le tableau de bord : sans cela, une prévision vide
 * ressemble à une panne alors qu'il s'agit d'un historique manquant.
 */
export async function getRevenueCoverage(): Promise<RevenueCoverage> {
  const supabase = await createClient();

  const [{ count }, first, last] = await Promise.all([
    supabase.from('revenue_actuals').select('date', { count: 'exact', head: true }),
    supabase.from('revenue_actuals').select('date').order('date').limit(1).maybeSingle(),
    supabase
      .from('revenue_actuals')
      .select('date, revenue_ht')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    days: count ?? 0,
    firstDate: first.data?.date ?? null,
    lastDate: last.data?.date ?? null,
    lastRevenue: last.data ? toNumber(last.data.revenue_ht, 0) : null,
  };
}

/**
 * Le CA réellement encaissé le même jour de semaine l'an dernier.
 *
 * À ne pas confondre avec `getReferenceRevenue`, qui renvoie la CIBLE du
 * service — la prévision majorée de la marge de sécurité. Les deux se
 * ressemblaient à l'écran au point d'afficher le même nombre deux fois.
 */
export async function getLastYearRevenue(
  date: string,
): Promise<{ jour: string; revenueHt: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('mep_ca_an_dernier', { d: date });
  const ligne = data?.[0];
  return ligne ? { jour: ligne.jour, revenueHt: Number(ligne.revenue_ht) } : null;
}

/**
 * Les heures d'ouverture des deux comptages.
 *
 * Elles vivent dans `revenue_settings`, que la RLS réserve au directeur :
 * sans cette fonction, l'équipe ne pourrait pas savoir à quelle heure son
 * propre travail commence. Un horaire de service n'a rien de confidentiel.
 */
export async function getCountHours(): Promise<{ morning: string; afternoon: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('mep_heures_comptage');
  return data?.[0] ?? null;
}
