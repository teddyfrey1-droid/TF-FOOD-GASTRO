/**
 * Types de la base de données.
 *
 * Ce fichier est normalement REGÉNÉRÉ depuis le schéma, jamais édité à la main :
 *
 *   pnpm db:types      (nécessite Docker et la CLI Supabase)
 *
 * Il est ici maintenu manuellement car l'environnement de développement
 * initial ne disposait pas de Docker. Toute migration doit s'y refléter.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type UserRole = 'employee' | 'assistant_manager' | 'manager' | 'owner';
export type SessionKind = 'morning' | 'afternoon';
export type SessionStatus = 'draft' | 'submitted';
export type ProductFamily = 'mise_en_place' | 'les_plus';
export type ProductUnit = 'gastro' | 'piece';
export type MinMode = 'auto' | 'manual';
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
  family: ProductFamily;
  unit: ProductUnit;
  /** Colonne « VENTE POUR » du Sheet : seule donnée qui pilote la cible. */
  base_qty: number;
  count_step: number;
  production_step: number;
  min_mode: MinMode;
  min_divisor: number;
  min_qty_manual: number | null;
  floor_qty: number | null;
  ceiling_qty: number | null;
  /** 1 = LE PLUS urgent, 5 = le moins. */
  priority: number;
  /** Conservé pour plus tard : aucune logique ni affichage en v1. */
  prep_time_min: number | null;
  /** DLC indicative (J, J+1, J+2, J+4). Stockée, non utilisée. */
  shelf_life_label: string | null;
  weight_per_bac_kg: number | null;
  /** Photo du produit. Vide : l'application affiche une vignette illustrée. */
  image_url: string | null;
  in_saladbar: boolean;
  in_fridge: boolean;
  sort_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ProductFamilySettingsRow = {
  family: ProductFamily;
  label: string;
  reference_revenue: number;
  target_multiplier: number;
  updated_at: string;
};

/** Projection sans donnée sensible, seule table de produits visible d'un employé. */
type ProductForCountRow = {
  id: string;
  name: string;
  category_id: string;
  unit: ProductUnit;
  count_step: number;
  in_saladbar: boolean;
  in_fridge: boolean;
  sort_order: number;
  notes: string | null;
  image_url: string | null;
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
  default_min_divisor: number;
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
  min_snapshot: number | null;
  production_needed_snapshot: number | null;
  is_not_applicable: boolean;
  not_applicable_reason: string | null;
  counted_at: string | null;
  counted_saladbar_at: string | null;
  counted_fridge_at: string | null;
  updated_at: string;
};

type ProductionTaskRow = {
  id: string;
  session_id: string;
  product_id: string;
  qty_to_produce: number;
  priority_snapshot: number;
  is_done: boolean;
  done_at: string | null;
  done_by: string | null;
  created_at: string;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
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
        | 'min_mode'
        | 'min_divisor'
        | 'min_qty_manual'
        | 'floor_qty'
        | 'ceiling_qty'
        | 'priority'
        | 'prep_time_min'
        | 'weight_per_bac_kg'
        | 'shelf_life_label'
        | 'image_url'
        | 'family'
        | 'unit'
        | 'base_qty'
        | 'in_saladbar'
        | 'in_fridge'
        | 'sort_order'
        | 'is_active'
        | 'notes'
      >;
      product_family_settings: Table<ProductFamilySettingsRow, 'updated_at'>;
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
        | 'min_snapshot'
        | 'production_needed_snapshot'
        | 'is_not_applicable'
        | 'not_applicable_reason'
        | 'counted_at'
        | 'counted_saladbar_at'
        | 'counted_fridge_at'
      >;
      production_tasks: Table<
        ProductionTaskRow,
        'id' | 'created_at' | 'is_done' | 'done_at' | 'done_by'
      >;
      audit_log: Table<AuditLogRow, 'id' | 'created_at' | 'user_id' | 'record_id' | 'before' | 'after'>;
      push_subscriptions: Table<
        PushSubscriptionRow,
        'id' | 'created_at' | 'last_used_at' | 'revoked_at' | 'user_agent'
      >;
    };
    Views: {
      products_for_count: { Row: ProductForCountRow; Relationships: [] };
      /** Prénoms de l'équipe, sans rôle ni état d'activation. */
      team_members: { Row: { id: string; full_name: string }; Relationships: [] };
    };
    Functions: {
      /** Cible et seuil par produit. Back-office uniquement (§5.8). */
      mep_product_targets: {
        Args: { d: string; p_session: SessionKind };
        Returns: {
          product_id: string;
          product_name: string;
          target: number;
          minimum: number;
          priority: number;
          unit: ProductUnit;
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
          notes: string | null;
          qty_to_produce: number;
          unit: ProductUnit;
          priority: number;
        }[];
      };
      mep_reorder_report: {
        Args: { p_session_id: string };
        Returns: {
          product_id: string;
          product_name: string;
          notes: string | null;
          qty_to_produce: number;
          unit: ProductUnit;
          priority: number;
          is_done: boolean;
        }[];
      };
      mep_forecast_revenue: { Args: { d: string }; Returns: number | null };
      /**
       * Un mois de prévisions en un seul aller-retour.
       * Appeler mep_forecast_revenue jour par jour coûtait trente-et-un
       * allers-retours pour afficher un tableau.
       */
      mep_forecast_range: {
        Args: { d_from: string; d_to: string };
        Returns: { date: string; forecast: number | null }[];
      };
      mep_reference_revenue: {
        Args: { d: string; p_session: SessionKind };
        Returns: number | null;
      };
      mep_reference_date: { Args: { d: string }; Returns: string };
      /** Réserve l'envoi du rappel du jour. Vrai une seule fois par session. */
      mep_claim_reminder: {
        Args: { p_session: SessionKind; p_now?: string | null };
        Returns: boolean;
      };
      /** Abonnements à notifier pour une session non encore validée. Serveur uniquement. */
      mep_pending_reminders: {
        Args: { p_session: SessionKind };
        Returns: {
          subscription_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          full_name: string;
        }[];
      };
      /** Ouvre la session du jour et crée une ligne vide par produit actif. */
      mep_open_count_session: {
        Args: { p_session: SessionKind; p_device_info?: Json | null };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      session_kind: SessionKind;
      session_status: SessionStatus;
      product_family: ProductFamily;
      product_unit: ProductUnit;
      min_mode: MinMode;
      forecast_source: ForecastSource;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
