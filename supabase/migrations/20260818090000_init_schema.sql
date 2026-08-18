-- =====================================================================
-- MEP — Schéma initial
-- Application de mise en place, Heiko Poké Bowl Lafayette.
--
-- Tout se compte en gastros : les quantités sont des multiples du pas
-- (0,5 par défaut), jamais des kilos ni des portions.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
create type public.user_role       as enum ('employee', 'manager', 'owner');
create type public.session_kind    as enum ('morning', 'afternoon');
create type public.session_status  as enum ('draft', 'submitted');
create type public.calculator_mode as enum ('bracket', 'ratio');
create type public.reorder_mode    as enum ('ratio', 'fixed');
create type public.forecast_source as enum ('auto', 'manual');

-- ---------------------------------------------------------------------
-- profiles — un profil par utilisateur Supabase Auth
-- ---------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text        not null,
  role       public.user_role not null default 'employee',
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Profil applicatif. Le rôle pilote toute la confidentialité : un employee ne voit jamais le CA.';

-- ---------------------------------------------------------------------
-- Référentiel produits
-- ---------------------------------------------------------------------
create table public.product_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text    not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category_id uuid not null references public.product_categories (id) on delete restrict,

  -- Format du bac de référence, affiché au comptage pour lever toute ambiguïté.
  gn_format   text,

  -- Pas de saisie et pas de production, en gastros.
  count_step      numeric(6, 3) not null default 0.5 check (count_step > 0),
  production_step numeric(6, 3) not null default 0.5 check (production_step > 0),

  -- SEUIL DE RELANCE : ce qui DÉCLENCHE la reproduction.
  reorder_mode  public.reorder_mode not null default 'ratio',
  reorder_ratio numeric(5, 4) check (reorder_ratio >= 0 and reorder_ratio <= 2),
  reorder_fixed numeric(8, 3) check (reorder_fixed >= 0),

  -- BORNES DE LA CIBLE : ce qui ENCADRE le calcul. À ne pas confondre
  -- avec le seuil de relance ci-dessus.
  floor_qty   numeric(8, 3) check (floor_qty >= 0),
  ceiling_qty numeric(8, 3) check (ceiling_qty >= 0),

  urgency_level integer not null default 3 check (urgency_level between 1 and 5),
  prep_time_min numeric(6, 2) check (prep_time_min >= 0),

  -- Indicatif, back-office uniquement : n'apparaît JAMAIS à l'écran de comptage.
  weight_per_bac_kg numeric(8, 3) check (weight_per_bac_kg >= 0),

  in_saladbar boolean not null default true,
  in_fridge   boolean not null default true,

  sort_order integer not null default 0,
  is_active  boolean not null default true,
  notes      text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint products_name_unique unique (name),
  constraint products_floor_le_ceiling
    check (floor_qty is null or ceiling_qty is null or floor_qty <= ceiling_qty),
  constraint products_reorder_config_present
    check (
      (reorder_mode = 'ratio' and reorder_ratio is not null)
      or (reorder_mode = 'fixed' and reorder_fixed is not null)
    ),
  constraint products_stored_somewhere check (in_saladbar or in_fridge)
);

comment on column public.products.floor_qty is
  'Plancher de la CIBLE (borne le calcul). Ne pas confondre avec le seuil de relance.';
comment on column public.products.reorder_fixed is
  'SEUIL DE RELANCE en valeur absolue (déclenche l''action). Ne pas confondre avec floor_qty.';

create index products_category_idx on public.products (category_id, sort_order);
create index products_active_idx on public.products (is_active) where is_active;

-- ---------------------------------------------------------------------
-- Calculateur — versionné par valid_from / valid_to
-- ---------------------------------------------------------------------
create table public.calculator_rules (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  mode       public.calculator_mode not null,

  -- Mode 'bracket' : borne basse INCLUSE, borne haute EXCLUE.
  ca_min     numeric(12, 2) check (ca_min >= 0),
  ca_max     numeric(12, 2) check (ca_max >= 0),
  target_qty numeric(8, 3)  check (target_qty >= 0),

  -- Mode 'ratio' : gastros par tranche de 1 000 € de CA.
  qty_per_1000_eur numeric(8, 3) check (qty_per_1000_eur >= 0),

  valid_from date not null default current_date,
  valid_to   date,

  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),

  constraint calculator_rules_bracket_shape check (
    mode <> 'bracket'
    or (target_qty is not null and (ca_min is null or ca_max is null or ca_min < ca_max))
  ),
  constraint calculator_rules_ratio_shape check (
    mode <> 'ratio' or qty_per_1000_eur is not null
  ),
  constraint calculator_rules_validity check (valid_to is null or valid_to >= valid_from)
);

comment on table public.calculator_rules is
  'Règles de calcul de la cible. Versionnées : modifier le calculateur en octobre ne doit pas réécrire septembre.';

create index calculator_rules_product_idx
  on public.calculator_rules (product_id, valid_from desc);

-- ---------------------------------------------------------------------
-- Chiffre d'affaires
-- ---------------------------------------------------------------------
create table public.revenue_history (
  date          date primary key,
  revenue_ht    numeric(12, 2) not null check (revenue_ht >= 0),
  is_closed_day boolean not null default false,
  note          text,
  created_at    timestamptz not null default now()
);

comment on table public.revenue_history is 'CA réalisé l''an dernier, base de la prévision (§5.1).';

create table public.revenue_actuals (
  date             date primary key,
  revenue_ht       numeric(12, 2) not null check (revenue_ht >= 0),
  revenue_lunch_ht numeric(12, 2) check (revenue_lunch_ht >= 0),
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.daily_forecast (
  date             date primary key,
  forecast_revenue numeric(12, 2) check (forecast_revenue >= 0),
  source           public.forecast_source not null default 'auto',
  coefficient      numeric(6, 4) not null default 1 check (coefficient >= 0),
  is_closed_day    boolean not null default false,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Table de configuration à ligne unique.
create table public.revenue_settings (
  id                       boolean primary key default true check (id),
  growth_rate              numeric(6, 4) not null default 0    check (growth_rate > -1),
  safety_margin            numeric(6, 4) not null default 0.10 check (safety_margin >= 0),
  afternoon_target_ratio   numeric(6, 4) not null default 1.00 check (afternoon_target_ratio >= 0),
  default_reorder_ratio    numeric(5, 4) not null default 0.50 check (default_reorder_ratio between 0 and 1),
  show_targets_to_employees boolean not null default false,
  morning_reminder_time    time not null default '07:30',
  afternoon_reminder_time  time not null default '15:00',
  updated_at               timestamptz not null default now()
);

insert into public.revenue_settings (id) values (true);

-- ---------------------------------------------------------------------
-- Comptages
-- ---------------------------------------------------------------------
create table public.count_sessions (
  id      uuid primary key default gen_random_uuid(),
  date    date not null default current_date,
  session public.session_kind not null,
  user_id uuid not null references public.profiles (id),

  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  status       public.session_status not null default 'draft',

  -- Snapshot du CA prévisionnel au moment du comptage : l'historique reste
  -- lisible même si la prévision est modifiée plus tard.
  forecast_revenue_snapshot numeric(12, 2),
  device_info               jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint count_sessions_unique_per_day unique (date, session),
  constraint count_sessions_submitted_has_timestamp
    check (status <> 'submitted' or submitted_at is not null)
);

create index count_sessions_date_idx on public.count_sessions (date desc, session);

create table public.count_lines (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.count_sessions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,

  qty_saladbar numeric(8, 3) not null default 0 check (qty_saladbar >= 0),
  qty_fridge   numeric(8, 3) not null default 0 check (qty_fridge >= 0),
  -- Le TOTAL est ce qui est comparé au seuil et à la cible. L'employé compte
  -- zone par zone, la base fait l'addition.
  qty_total    numeric(9, 3) generated always as (qty_saladbar + qty_fridge) stored,

  -- Snapshots non négociables : sans eux, changer un ratio réécrit l'histoire.
  target_snapshot             numeric(8, 3),
  reorder_threshold_snapshot  numeric(8, 3),
  production_needed_snapshot  numeric(8, 3),

  is_not_applicable boolean not null default false,
  not_applicable_reason text,

  updated_at timestamptz not null default now(),

  constraint count_lines_unique_product unique (session_id, product_id),
  constraint count_lines_na_has_reason
    check (not is_not_applicable or not_applicable_reason is not null)
);

create index count_lines_session_idx on public.count_lines (session_id);
create index count_lines_product_idx on public.count_lines (product_id);

create table public.production_tasks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.count_sessions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,

  qty_to_produce         numeric(8, 3) not null check (qty_to_produce > 0),
  urgency_level_snapshot integer not null check (urgency_level_snapshot between 1 and 5),

  is_done boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.profiles (id),

  created_at timestamptz not null default now(),

  constraint production_tasks_unique_product unique (session_id, product_id),
  constraint production_tasks_done_has_timestamp check (not is_done or done_at is not null)
);

create index production_tasks_session_idx on public.production_tasks (session_id);

-- ---------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id),
  action     text not null,
  table_name text not null,
  record_id  text,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_table_idx on public.audit_log (table_name, record_id);

-- ---------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at        before update on public.profiles        for each row execute function public.set_updated_at();
create trigger products_updated_at        before update on public.products        for each row execute function public.set_updated_at();
create trigger revenue_actuals_updated_at before update on public.revenue_actuals for each row execute function public.set_updated_at();
create trigger daily_forecast_updated_at  before update on public.daily_forecast  for each row execute function public.set_updated_at();
create trigger revenue_settings_updated_at before update on public.revenue_settings for each row execute function public.set_updated_at();
create trigger count_sessions_updated_at  before update on public.count_sessions  for each row execute function public.set_updated_at();
create trigger count_lines_updated_at     before update on public.count_lines     for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Création automatique du profil à l'inscription
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Le rôle n'est JAMAIS lu depuis les métadonnées utilisateur : un compte qui
  -- s'inscrit lui-même pourrait sinon se déclarer 'owner' et lire tout le CA.
  -- Tout nouveau compte naît 'employee' ; seul un manager/owner peut le promouvoir.
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'employee'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
