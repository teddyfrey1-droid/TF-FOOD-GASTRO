-- =====================================================================
-- MEP — Row Level Security
--
-- Règle de confidentialité absolue : un employé ne doit JAMAIS pouvoir
-- lire le chiffre d'affaires, les prévisions, les ratios du calculateur,
-- les cibles ni les seuils — même avec les outils de développement et une
-- requête forgée à la main.
--
-- La protection est ici, dans la base. Masquer un composant React ne
-- protège rien.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers. SECURITY DEFINER : ils lisent `profiles` sans déclencher la
-- RLS de `profiles` (ce qui provoquerait une récursion infinie).
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('manager', 'owner'), false)
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'owner', false)
$$;

revoke all on function public.current_user_role() from public;
revoke all on function public.is_manager() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- ---------------------------------------------------------------------
-- RLS activée partout, y compris pour le propriétaire des tables.
-- ---------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.product_categories enable row level security;
alter table public.products           enable row level security;
alter table public.calculator_rules   enable row level security;
alter table public.revenue_history    enable row level security;
alter table public.revenue_actuals    enable row level security;
alter table public.daily_forecast     enable row level security;
alter table public.revenue_settings   enable row level security;
alter table public.count_sessions     enable row level security;
alter table public.count_lines        enable row level security;
alter table public.production_tasks   enable row level security;
alter table public.audit_log          enable row level security;

alter table public.calculator_rules force row level security;
alter table public.revenue_history  force row level security;
alter table public.revenue_actuals  force row level security;
alter table public.daily_forecast   force row level security;
alter table public.revenue_settings force row level security;

-- =====================================================================
-- profiles — chacun sa ligne ; manager/owner voient tout
-- =====================================================================
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_manager());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_manager())
  with check (id = auth.uid() or public.is_manager());

create policy profiles_insert_manager on public.profiles
  for insert to authenticated
  with check (public.is_manager());

create policy profiles_delete_manager on public.profiles
  for delete to authenticated
  using (public.is_manager());

-- Un employé peut corriger son nom, jamais son rôle ni son activation.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is not distinct from old.role
     and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  -- auth.uid() nul = appel serveur (service_role, migrations, scripts d'admin).
  -- Un visiteur anonyme ne peut pas arriver ici : la RLS de `profiles` ne
  -- s'adresse qu'au rôle `authenticated`.
  if auth.uid() is null or public.is_manager() then
    return new;
  end if;

  raise exception 'Seul un directeur ou le propriétaire peut modifier le rôle ou l''activation d''un compte.'
    using errcode = '42501';
end;
$$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- =====================================================================
-- Catégories — lisibles par tous (nécessaire au regroupement au comptage)
-- =====================================================================
create policy product_categories_select_all on public.product_categories
  for select to authenticated using (true);

create policy product_categories_write_manager on public.product_categories
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- =====================================================================
-- products — RÉSERVÉE aux manager/owner.
--
-- La table porte les seuils, les cibles plancher/plafond, l'urgence et le
-- poids par bac : aucune de ces colonnes ne doit atteindre un employé.
-- Les employés passent par la vue `products_for_count` ci-dessous, qui
-- n'expose que les colonnes nécessaires au comptage.
-- =====================================================================
create policy products_all_manager on public.products
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- security_invoker = false : la vue s'exécute avec les droits de son
-- propriétaire, donc la RLS de `products` ne bloque pas les employés —
-- mais ils ne reçoivent QUE les colonnes listées ici.
create view public.products_for_count
with (security_invoker = false) as
select
  p.id,
  p.name,
  p.category_id,
  p.gn_format,
  p.count_step,
  p.in_saladbar,
  p.in_fridge,
  p.sort_order,
  p.notes
from public.products p
where p.is_active;

comment on view public.products_for_count is
  'Projection sans donnée sensible destinée à l''écran de comptage : ni seuil, ni cible, ni urgence, ni poids.';

revoke all on public.products_for_count from public;
grant select on public.products_for_count to authenticated;

-- =====================================================================
-- calculator_rules — aucun accès employé
-- =====================================================================
create policy calculator_rules_all_manager on public.calculator_rules
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- =====================================================================
-- Chiffre d'affaires — aucun accès employé
-- =====================================================================
create policy revenue_history_all_manager on public.revenue_history
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy revenue_actuals_all_manager on public.revenue_actuals
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy daily_forecast_all_manager on public.daily_forecast
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create policy revenue_settings_all_manager on public.revenue_settings
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- =====================================================================
-- count_sessions — un employé ne voit que SES sessions DU JOUR
-- =====================================================================
create policy count_sessions_select on public.count_sessions
  for select to authenticated
  using (public.is_manager() or (user_id = auth.uid() and date = current_date));

create policy count_sessions_insert on public.count_sessions
  for insert to authenticated
  with check (public.is_manager() or (user_id = auth.uid() and date = current_date));

-- Un comptage validé n'est plus modifiable par l'employé : il devient une
-- pièce d'historique.
create policy count_sessions_update on public.count_sessions
  for update to authenticated
  using (
    public.is_manager()
    or (user_id = auth.uid() and date = current_date and status = 'draft')
  )
  with check (public.is_manager() or (user_id = auth.uid() and date = current_date));

create policy count_sessions_delete_manager on public.count_sessions
  for delete to authenticated using (public.is_manager());

-- =====================================================================
-- count_lines — rattachées à une session accessible
-- =====================================================================
create policy count_lines_select on public.count_lines
  for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.count_sessions s
      where s.id = count_lines.session_id
        and s.user_id = auth.uid()
        and s.date = current_date
    )
  );

create policy count_lines_write on public.count_lines
  for all to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.count_sessions s
      where s.id = count_lines.session_id
        and s.user_id = auth.uid()
        and s.date = current_date
        and s.status = 'draft'
    )
  )
  with check (
    public.is_manager()
    or exists (
      select 1 from public.count_sessions s
      where s.id = count_lines.session_id
        and s.user_id = auth.uid()
        and s.date = current_date
        and s.status = 'draft'
    )
  );

-- Les colonnes de snapshot sont écrites par le serveur (§5.8), jamais par
-- le téléphone : l'employé n'a le droit d'écrire que ce qu'il a compté.
revoke update on public.count_lines from authenticated;
grant update (qty_saladbar, qty_fridge, is_not_applicable, not_applicable_reason)
  on public.count_lines to authenticated;

-- =====================================================================
-- production_tasks — l'employé lit et coche, rien de plus
-- =====================================================================
create policy production_tasks_select on public.production_tasks
  for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.count_sessions s
      where s.id = production_tasks.session_id and s.date = current_date
    )
  );

create policy production_tasks_update on public.production_tasks
  for update to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.count_sessions s
      where s.id = production_tasks.session_id and s.date = current_date
    )
  )
  with check (
    public.is_manager()
    or exists (
      select 1 from public.count_sessions s
      where s.id = production_tasks.session_id and s.date = current_date
    )
  );

create policy production_tasks_write_manager on public.production_tasks
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- La quantité à produire vient du calcul serveur : un employé ne peut
-- cocher la tâche, pas en réécrire la quantité ni l'urgence.
revoke update on public.production_tasks from authenticated;
grant update (is_done, done_at, done_by) on public.production_tasks to authenticated;

-- =====================================================================
-- audit_log — lecture manager/owner, écriture serveur uniquement
-- =====================================================================
create policy audit_log_select_manager on public.audit_log
  for select to authenticated using (public.is_manager());

revoke insert, update, delete on public.audit_log from authenticated;
