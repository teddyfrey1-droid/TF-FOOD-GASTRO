-- =====================================================================
-- MEP — Recadrage du modèle de calcul
--
-- Le calculateur à paliers de CA est abandonné. Une seule donnée pilote
-- désormais un produit : sa `base_qty`, reprise de la colonne « VENTE POUR »
-- du Google Sheet.
--
--   cible = base_qty × target_multiplier × (CA_ref / reference_revenue)
--   cible = clamp(cible, floor_qty, ceiling_qty)
--   cible = PLAFOND(cible)          -- à l'ENTIER supérieur
--
--   minimum auto   = cible / min_divisor
--   minimum manual = min_qty_manual
--   minimum = PLAFOND(minimum, count_step) puis borné par la cible
--
-- Ce fichier fait aussi trois corrections de fond :
--   1. la priorité s'inverse — 1 = LE PLUS urgent, 5 = le moins ;
--   2. les arrondis passent au demi au ENTIER supérieur ;
--   3. la colonne « conso/1000 » disparaît : c'était la base divisée par
--      deux, elle faussait le calcul du minimum.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Familles de produits
-- ---------------------------------------------------------------------
create type public.product_family as enum ('mise_en_place', 'les_plus');
create type public.product_unit   as enum ('gastro', 'piece');
create type public.min_mode       as enum ('auto', 'manual');

create table public.product_family_settings (
  family             public.product_family primary key,
  label              text not null,
  -- CA pour lequel les `base_qty` de la famille sont exprimées.
  reference_revenue  numeric(12, 2) not null check (reference_revenue > 0),
  target_multiplier  numeric(6, 3)  not null check (target_multiplier > 0),
  updated_at         timestamptz not null default now()
);

insert into public.product_family_settings (family, label, reference_revenue, target_multiplier)
values
  ('mise_en_place', 'Mise en place', 4000, 2),
  ('les_plus',      'Les plus',      1000, 1);

create trigger product_family_settings_updated_at
  before update on public.product_family_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Nouvelles colonnes produit
-- ---------------------------------------------------------------------
alter table public.products
  add column family    public.product_family not null default 'mise_en_place',
  add column unit      public.product_unit   not null default 'gastro',
  -- Colonne « VENTE POUR » du Sheet.
  add column base_qty  numeric(8, 3) not null default 0 check (base_qty >= 0),
  add column min_mode  public.min_mode not null default 'auto',
  add column min_divisor numeric(6, 3) not null default 2 check (min_divisor > 0),
  add column min_qty_manual numeric(8, 3) check (min_qty_manual >= 0),
  -- DLC du Sheet (J, J+1, J+2, J+4). STOCKÉE, non utilisée en v1.
  add column shelf_life_label text;

comment on column public.products.base_qty is
  'Colonne « VENTE POUR » du Google Sheet. Seule donnée qui pilote la cible.';
comment on column public.products.shelf_life_label is
  'DLC indicative (J, J+1, J+2, J+4). Stockée pour plus tard, aucune logique en v1.';
comment on column public.products.min_qty_manual is
  'Minimum en valeur absolue, utilisé si min_mode = manual.';

alter table public.products
  add constraint products_min_config_present
    check (min_mode <> 'manual' or min_qty_manual is not null);

-- ---------------------------------------------------------------------
-- 3. La priorité s'inverse et se renomme
--
-- L'ancien `urgency_level` se lisait 1 = faible ... 5 = critique.
-- Le nouveau `priority` se lit comme un classement : 1 = LE PLUS urgent.
-- Les valeurs existantes sont donc retournées (1<->5, 2<->4).
-- ---------------------------------------------------------------------
alter table public.products rename column urgency_level to priority;
update public.products set priority = 6 - priority;

alter table public.products
  rename constraint products_urgency_level_check to products_priority_check;

comment on column public.products.priority is
  'Priorité de relance : 1 = LE PLUS urgent, 5 = le moins. Le rapport trie par ordre croissant.';

alter table public.production_tasks
  rename column urgency_level_snapshot to priority_snapshot;
update public.production_tasks set priority_snapshot = 6 - priority_snapshot;

-- ---------------------------------------------------------------------
-- 4. Renommage du snapshot de minimum
-- ---------------------------------------------------------------------
alter table public.count_lines
  rename column reorder_threshold_snapshot to min_snapshot;

comment on column public.count_lines.min_snapshot is
  'Minimum appliqué au moment du comptage. Sans lui, changer un minimum réécrirait l''historique.';

-- ---------------------------------------------------------------------
-- 5. Ce qui disparaît
-- ---------------------------------------------------------------------

-- Le calculateur à paliers, et avec lui la colonne conso/1000
-- (`qty_per_1000_eur`) qui valait la moitié de la base et faussait le minimum.
drop table if exists public.calculator_rules cascade;
drop type  if exists public.calculator_mode;

-- Les formats GN détaillés : l'unité se dit simplement « gastro » ou « pièce ».
-- La vue de comptage est reconstruite plus bas, sans cette colonne.
drop view if exists public.products_for_count;
alter table public.products drop column if exists gn_format;

-- L'ancien mode de seuil, remplacé par min_mode / min_divisor / min_qty_manual.
alter table public.products
  drop constraint if exists products_reorder_config_present,
  drop column if exists reorder_mode,
  drop column if exists reorder_ratio,
  drop column if exists reorder_fixed;
drop type if exists public.reorder_mode;

-- `prep_time_min` reste EN BASE mais sort de toute la logique et de l'UI.
drop function if exists public.mep_reorder_prep_time(uuid);
comment on column public.products.prep_time_min is
  'Temps de prépa. Conservé pour plus tard : aucune logique ni affichage en v1.';

-- ---------------------------------------------------------------------
-- 6. Réglages globaux
-- ---------------------------------------------------------------------
alter table public.revenue_settings
  rename column default_reorder_ratio to default_min_divisor;

alter table public.revenue_settings
  drop constraint if exists revenue_settings_default_reorder_ratio_check;

update public.revenue_settings set default_min_divisor = 2;

alter table public.revenue_settings
  alter column default_min_divisor set default 2,
  add constraint revenue_settings_default_min_divisor_check check (default_min_divisor > 0);

comment on column public.revenue_settings.default_min_divisor is
  'Diviseur de minimum par défaut (2 = la moitié de la cible), pour les produits en mode auto.';

-- La marge de sécurité passe à 0 : le multiplicateur de famille (x2 pour la
-- mise en place) porte déjà la sécurité. Sans cela, un CA prévu de 4 000 €
-- entrerait dans le calcul à 4 400 € et donnerait 11 gastros de saumon au
-- lieu des 10 attendus.
update public.revenue_settings set safety_margin = 0;
alter table public.revenue_settings alter column safety_margin set default 0;

-- ---------------------------------------------------------------------
-- 7. Vue de comptage reconstruite
--
-- Elle ne doit exposer NI base_qty, NI famille, NI multiplicateur, NI
-- minimum, NI priorité : un employé qui connaîtrait sa base et sa cible
-- pourrait en déduire le chiffre d'affaires du restaurant.
-- ---------------------------------------------------------------------
create view public.products_for_count
with (security_invoker = false) as
select
  p.id,
  p.name,
  p.category_id,
  p.unit,
  p.count_step,
  p.in_saladbar,
  p.in_fridge,
  p.sort_order,
  p.notes
from public.products p
where p.is_active;

comment on view public.products_for_count is
  'Projection destinée à l''écran de comptage. Ni base, ni famille, ni cible, ni minimum, ni priorité.';

revoke all on public.products_for_count from public;
grant select on public.products_for_count to authenticated;
