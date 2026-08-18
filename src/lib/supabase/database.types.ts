/**
 * Types de la base MEP.
 *
 * Ce fichier est normalement REGÉNÉRÉ depuis le schéma, jamais édité à la main :
 *
 *   pnpm db:types      (nécessite Docker et la CLI Supabase)
 *
 * Il est ici maintenu manuellement car l'environnement de développement
 * initial ne disposait pas de Docker. Toute migration doit s'y refléter.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type UserRole = 'employee' | 'manager' | 'owner';
export type SessionKind = 'morning' | 'afternoon';
export type SessionStatus = 'draft' | 'submitted';
export type CalculatorMode = 'bracket' | 'ratio';
export type ReorderMode = 'ratio' | 'fixed';
export type ForecastSource = 'auto' | 'manual';

type ProfileRow = {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ProductCategoryRow = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

type ProductRow = {
  id: string;
  name: string;
  category_id: string;
  gn_format: string | null;
  count_step: number;
  production_step: number;
  reorder_mode: ReorderMode;
  reorder_ratio: number | null;
  reorder_fixed: number | null;
  floor_qty: number | null;
  ceiling_qty: number | null;
  urgency_level: number;
  prep_time_min: number | null;
  weight_per_bac_kg: number | null;
  in_saladbar: boolean;
  in_fridge: boolean;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** Projection sans donnée sensible, seule table de produits visible d'un employé. */
type ProductForCountRow = {
  id: string;
  name: string;
  category_id: string;
  gn_format: string | null;
  count_step: number;
  in_saladbar: boolean;
  in_fridge: boolean;
  sort_order: number;
  notes: string | null;
};

type CalculatorRuleRow = {
  id: string;
  product_id: string;
  mode: CalculatorMode;
  ca_min: number | null;
  ca_max: number | null;
  target_qty: number | null;
  qty_per_1000_eur: number | null;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
  created_by: string | null;
};

type RevenueHistoryRow = {
  date: string;
  revenue_ht: number;
  is_closed_day: boolean;
  note: string | null;
  created_at: string;
};

type RevenueActualRow = {
  date: string;
  revenue_ht: number;
  revenue_lunch_ht: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type DailyForecastRow = {
  date: string;
  forecast_revenue: number | null;
  source: ForecastSource;
  coefficient: number;
  is_closed_day: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type RevenueSettingsRow = {
  id: boolean;
  growth_rate: number;
  safety_margin: number;
  afternoon_target_ratio: number;
  default_reorder_ratio: number;
  show_targets_to_employees: boolean;
  morning_reminder_time: string;
  afternoon_reminder_time: string;
  updated_at: string;
};

type CountSessionRow = {
  id: string;
  date: string;
  session: SessionKind;
  user_id: string;
  started_at: string;
  submitted_at: string | null;
  status: SessionStatus;
  forecast_revenue_snapshot: number | null;
  device_info: Json | null;
  created_at: string;
  updated_at: string;
};

type CountLineRow = {
  id: string;
  session_id: string;
  product_id: string;
  qty_saladbar: number;
  qty_fridge: number;
  qty_total: number;
  target_snapshot: number | null;
  reorder_threshold_snapshot: number | null;
  production_needed_snapshot: number | null;
  is_not_applicable: boolean;
  not_applicable_reason: string | null;
  updated_at: string;
};

type ProductionTaskRow = {
  id: string;
  session_id: string;
  product_id: string;
  qty_to_produce: number;
  urgency_level_snapshot: number;
  is_done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  before: Json | null;
  after: Json | null;
  created_at: string;
};

type Writable<T, Optional extends keyof T = never> = Omit<T, Optional> & Partial<Pick<T, Optional>>;

type Table<Row, InsertOptional extends keyof Row = never> = {
  Row: Row;
  Insert: Writable<Row, InsertOptional>;
  Update: Partial<Row>;
  Relationships: [];
};

type Generated = 'id' | 'created_at' | 'updated_at';

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, 'created_at' | 'updated_at' | 'role' | 'is_active'>;
      product_categories: Table<ProductCategoryRow, 'id' | 'created_at' | 'sort_order'>;
      products: Table<
        ProductRow,
        | Generated
        | 'count_step'
        | 'production_step'
        | 'reorder_mode'
        | 'reorder_ratio'
        | 'reorder_fixed'
        | 'floor_qty'
        | 'ceiling_qty'
        | 'urgency_level'
        | 'prep_time_min'
        | 'weight_per_bac_kg'
        | 'gn_format'
        | 'in_saladbar'
        | 'in_fridge'
        | 'sort_order'
        | 'is_active'
        | 'notes'
      >;
      calculator_rules: Table<
        CalculatorRuleRow,
        | 'id'
        | 'created_at'
        | 'created_by'
        | 'ca_min'
        | 'ca_max'
        | 'target_qty'
        | 'qty_per_1000_eur'
        | 'valid_from'
        | 'valid_to'
      >;
      revenue_history: Table<RevenueHistoryRow, 'created_at' | 'is_closed_day' | 'note'>;
      revenue_actuals: Table<
        RevenueActualRow,
        'created_at' | 'updated_at' | 'revenue_lunch_ht' | 'note'
      >;
      daily_forecast: Table<
        DailyForecastRow,
        | 'created_at'
        | 'updated_at'
        | 'forecast_revenue'
        | 'source'
        | 'coefficient'
        | 'is_closed_day'
        | 'note'
      >;
      revenue_settings: Table<RevenueSettingsRow, keyof RevenueSettingsRow>;
      count_sessions: Table<
        CountSessionRow,
        | Generated
        | 'date'
        | 'started_at'
        | 'submitted_at'
        | 'status'
        | 'forecast_revenue_snapshot'
        | 'device_info'
      >;
      count_lines: Table<
        CountLineRow,
        | 'id'
        | 'updated_at'
        | 'qty_total'
        | 'qty_saladbar'
        | 'qty_fridge'
        | 'target_snapshot'
        | 'reorder_threshold_snapshot'
        | 'production_needed_snapshot'
        | 'is_not_applicable'
        | 'not_applicable_reason'
      >;
      production_tasks: Table<
        ProductionTaskRow,
        'id' | 'created_at' | 'is_done' | 'done_at' | 'done_by'
      >;
      audit_log: Table<AuditLogRow, 'id' | 'created_at' | 'user_id' | 'record_id' | 'before' | 'after'>;
    };
    Views: {
      products_for_count: { Row: ProductForCountRow; Relationships: [] };
    };
    Functions: {
      /** Cible et seuil par produit. Back-office uniquement (§5.8). */
      mep_product_targets: {
        Args: { d: string; p_session: SessionKind };
        Returns: {
          product_id: string;
          product_name: string;
          target: number;
          reorder_threshold: number;
          has_rule: boolean;
        }[];
      };
      /**
       * Valide un comptage et renvoie la liste à relancer.
       * Ne contient NI cible, NI seuil, NI chiffre d'affaires.
       */
      mep_submit_count: {
        Args: { p_session_id: string };
        Returns: {
          product_id: string;
          product_name: string;
          gn_format: string | null;
          notes: string | null;
          qty_to_produce: number;
          urgency_level: number;
          is_critical: boolean;
        }[];
      };
      mep_reorder_report: {
        Args: { p_session_id: string };
        Returns: {
          product_id: string;
          product_name: string;
          gn_format: string | null;
          notes: string | null;
          qty_to_produce: number;
          urgency_level: number;
          is_done: boolean;
        }[];
      };
      mep_forecast_revenue: { Args: { d: string }; Returns: number | null };
      mep_reference_revenue: {
        Args: { d: string; p_session: SessionKind };
        Returns: number | null;
      };
      mep_reference_date: { Args: { d: string }; Returns: string };
    };
    Enums: {
      user_role: UserRole;
      session_kind: SessionKind;
      session_status: SessionStatus;
      calculator_mode: CalculatorMode;
      reorder_mode: ReorderMode;
      forecast_source: ForecastSource;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
