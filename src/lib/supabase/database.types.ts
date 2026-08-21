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
  crit_mode: MinMode;
  /** Diviseur du seuil critique (4 = le quart de la cible), en mode auto. */
  crit_divisor: number;
  crit_qty_manual: number | null;
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
  in_desserts: boolean;
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
  in_desserts: boolean;
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
  /** Diviseur de seuil critique par défaut (4 = le quart de la cible). */
  default_crit_divisor: number;
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
  /** Mot laissé par la personne qui a compté. */
  note: string | null;
  created_at: string;
  updated_at: string;
};

type CountLineRow = {
  id: string;
  session_id: string;
  product_id: string;
  qty_saladbar: number;
  qty_fridge: number;
  qty_desserts: number;
  qty_total: number;
  target_snapshot: number | null;
  min_snapshot: number | null;
  /** Seuil critique appliqué au moment du comptage. */
  crit_snapshot: number | null;
  /** Comptage reporté : ne bloque pas la validation, n'entre pas au rapport. */
  deferred_at: string | null;
  deferred_reason: string | null;
  production_needed_snapshot: number | null;
  is_not_applicable: boolean;
  not_applicable_reason: string | null;
  counted_at: string | null;
  counted_saladbar_at: string | null;
  counted_fridge_at: string | null;
  counted_desserts_at: string | null;
  updated_at: string;
};

type ProductionTaskRow = {
  id: string;
  session_id: string;
  product_id: string;
  qty_to_produce: number;
  priority_snapshot: number;
  /** Le stock était sous le seuil critique : passe AVANT la priorité au tri. */
  is_critical: boolean;
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
        | 'crit_mode'
        | 'crit_divisor'
        | 'crit_qty_manual'
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
        | 'in_desserts'
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
        | 'note'
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
        | 'crit_snapshot'
        | 'deferred_at'
        | 'deferred_reason'
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
      /**
       * Les envois de liens d'activation. En lecture seule pour le
       * directeur : le compteur ne se remet à zéro que par le temps qui
       * passe, jamais à la main.
       */
      activation_email_sends: Table<
        { id: string; email: string; sent_by: string; sent_at: string },
        'id' | 'sent_at'
      >;
      /**
       * Codes d'activation. Aucune clé publique n'y accède : seule la clé
       * de service peut les lire, puisqu'un code doit pouvoir être validé
       * par quelqu'un qui n'est justement pas encore connecté.
       */
      /** Droits réglables par rôle. En lecture seule depuis le navigateur. */
      role_permissions: Table<
        { permission: string; role: UserRole; allowed: boolean; updated_at: string },
        'updated_at'
      >;
      activation_codes: Table<
        {
          id: string;
          user_id: string;
          code_hash: string;
          expires_at: string;
          used_at: string | null;
          attempts: number;
          created_by: string;
          created_at: string;
        },
        'id' | 'used_at' | 'attempts' | 'created_at'
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
          /** Sous ce seuil, le produit passe en tête du rapport, en rouge. */
          critical: number;
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
          /** « À faire en premier ». Prime sur la priorité au tri. */
          is_critical: boolean;
          /** Libellés d'affichage : ni CA, ni cible, ni minimum. */
          image_url: string | null;
          category_name: string;
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
          is_critical: boolean;
          is_done: boolean;
          image_url: string | null;
          category_name: string;
        }[];
      };
      mep_forecast_revenue: { Args: { d: string }; Returns: number | null };
      /**
       * Un mois de prévisions en un seul aller-retour.
       * Appeler mep_forecast_revenue jour par jour coûtait trente-et-un
       * allers-retours pour afficher un tableau.
       */
      /** Produits qu'il reste à relever, zone par zone. */
      mep_count_pending: { Args: { p_session_id: string }; Returns: number };
      mep_forecast_range: {
        Args: { d_from: string; d_to: string };
        Returns: { date: string; forecast: number | null }[];
      };
      mep_reference_revenue: {
        Args: { d: string; p_session: SessionKind };
        Returns: number | null;
      };
      mep_reference_date: { Args: { d: string }; Returns: string };
      /** Supprime un produit jamais compté. Refuse sinon. */
      mep_supprimer_produit: { Args: { p_product_id: string }; Returns: undefined };
      /** Remet un comptage validé du jour en cours de saisie. */
      mep_rouvrir_comptage: { Args: { p_session_id: string }; Returns: undefined };
      /** Vrai si l'appelant a ce droit. Directeur et propriétaire : toujours vrai. */
      mep_a_le_droit: { Args: { p_permission: string }; Returns: boolean };
      /** Ouvre ou ferme un droit pour un statut. Directeur uniquement. */
      mep_regler_droit: {
        Args: { p_permission: string; p_role: UserRole; p_allowed: boolean };
        Returns: undefined;
      };
      /** Efface un comptage EN COURS et ses lignes. Jamais un validé. */
      mep_annuler_comptage: { Args: { p_session_id: string }; Returns: undefined };
      /** Crée un code d'activation et invalide les précédents. */
      mep_creer_code_activation: {
        Args: { p_user_id: string; p_code_hash: string; p_heures?: number };
        Returns: string;
      };
      /** Lève une erreur si l'appelant ne peut pas supprimer ce compte. */
      mep_peut_supprimer_compte: { Args: { p_user_id: string }; Returns: undefined };
      /** Heures d'ouverture des comptages. Lisibles par toute l'équipe. */
      mep_heures_comptage: {
        Args: Record<string, never>;
        Returns: { morning: string; afternoon: string }[];
      };
      /** Les régler. Directeur uniquement. */
      mep_regler_heures_comptage: {
        Args: { p_morning: string; p_afternoon: string };
        Returns: undefined;
      };
      /**
       * Quantités relevées par produit, avec un état en toutes lettres.
       *
       * Volontairement SANS cible ni seuil : l'état est calculé en base et
       * n'en ressort que sous forme de mot. Un salarié apprend qu'il y a
       * un surplus, jamais à partir de quel nombre.
       */
      mep_etat_stock: {
        Args: { p_session_id: string };
        Returns: {
          product_id: string;
          product_name: string;
          category_name: string;
          image_url: string | null;
          unit: ProductUnit;
          qty_saladbar: number;
          qty_fridge: number;
          qty_desserts: number;
          qty_total: number;
          in_saladbar: boolean;
          in_fridge: boolean;
          in_desserts: boolean;
          etat: 'rupture' | 'juste' | 'ok' | 'surplus' | 'surplus_fort' | 'absent' | 'reporte';
          surplus: number;
        }[];
      };
      /**
       * CA brut encaissé le jour de référence l'an dernier, AVANT
       * majoration — à ne pas confondre avec `mep_reference_revenue`,
       * qui renvoie la cible du service. La date accompagne le montant :
       * une journée fermée fait remonter d'une semaine.
       */
      mep_ca_an_dernier: {
        Args: { d: string };
        Returns: { jour: string; revenue_ht: number }[];
      };
      /**
       * Réserve un des deux créneaux d'envoi horaires et renvoie son
       * identifiant. Lève une erreur — portant l'heure du prochain
       * créneau — quand le quota est atteint.
       */
      mep_reserver_envoi_activation: { Args: { p_email: string }; Returns: string };
      /** Rend un créneau quand l'envoi a finalement échoué. */
      mep_annuler_envoi_activation: { Args: { p_id: string }; Returns: undefined };
      /**
       * L'équipe avec les adresses e-mail, réservée au directeur.
       * Les adresses vivent dans `auth.users`, hors de portée de la RLS :
       * cette fonction est le seul chemin, et elle refuse les autres rôles.
       */
      mep_equipe: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          full_name: string;
          email: string | null;
          role: UserRole;
          is_active: boolean;
          derniere_connexion: string | null;
        }[];
      };
      /**
       * Confirme l'adresse d'un compte tout juste inscrit et lui donne son
       * statut. Remplace la clé de service pour la création de comptes.
       */
      mep_activer_compte: {
        Args: { p_user_id: string; p_full_name: string; p_role: UserRole };
        Returns: undefined;
      };
      /**
       * Historique des comptages, pour tout chef de service.
       * `forecast_revenue` vaut null tant que l'appelant n'est pas directeur.
       */
      mep_count_history: {
        Args: { d_from: string; d_to: string };
        Returns: {
          id: string;
          date: string;
          session: SessionKind;
          status: 'draft' | 'submitted';
          started_at: string;
          submitted_at: string | null;
          user_id: string | null;
          author_name: string | null;
          forecast_revenue: number | null;
          products_counted: number;
          products_total: number;
          products_deferred: number;
          tasks_total: number;
          tasks_done: number;
          tasks_critical: number;
        }[];
      };
      /** Détail d'un comptage. Cibles et seuils nuls hors direction. */
      mep_count_detail: {
        Args: { p_session_id: string };
        Returns: {
          product_id: string;
          product_name: string;
          category_name: string;
          unit: ProductUnit;
          qty_saladbar: number;
          qty_fridge: number;
          qty_desserts: number;
          qty_total: number;
          counted_at: string | null;
          is_not_applicable: boolean;
          not_applicable_reason: string | null;
          deferred_at: string | null;
          deferred_reason: string | null;
          target: number | null;
          minimum: number | null;
          critical: number | null;
          to_produce: number | null;
        }[];
      };
      /** Observations ligne à ligne pour les anomalies. Directeur uniquement. */
      mep_count_observations: {
        Args: { d_from: string; d_to: string };
        Returns: {
          date: string;
          product_name: string;
          qty_total: number;
          target_snapshot: number | null;
          min_snapshot: number | null;
          is_not_applicable: boolean;
        }[];
      };
      /** Fréquence des ruptures par produit. Directeur uniquement. */
      mep_stockout_history: {
        Args: { d_from: string; d_to: string };
        Returns: {
          product_id: string;
          product_name: string;
          category_name: string;
          unit: ProductUnit;
          sessions_count: number;
          critical_count: number;
          empty_count: number;
          reorder_count: number;
          avg_coverage: number | null;
          base_qty: number;
          priority: number;
        }[];
      };
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
