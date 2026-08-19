-- =====================================================================
-- MEP — Un compte doit être validé avant de servir
--
-- Le dépôt est public : l'URL du projet et la clé « anon » sont donc
-- connues de tous. C'est sans danger pour les données — la RLS ne renvoie
-- rien à un visiteur anonyme — mais si l'inscription par e-mail est
-- ouverte, n'importe qui peut devenir `authenticated`.
--
-- Or les politiques de comptage s'adressaient à TOUT compte authentifié,
-- sans vérifier qu'il est actif. Un inconnu inscrit de lui-même aurait pu
-- lire, et surtout MODIFIER, le comptage du jour.
--
-- Deux verrous :
--   1. un compte créé par inscription libre naît DÉSACTIVÉ ;
--   2. les politiques de comptage exigent un compte actif.
--
-- Le directeur active les comptes depuis le back-office. Rien ne change
-- pour les comptes qu'il crée lui-même : ils naissent actifs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Un compte actif, et rien d'autre
-- ---------------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  )
$$;

comment on function public.is_active_user() is
  'Vrai si l''appelant a un profil ACTIF. Un compte auto-inscrit naît inactif et ne peut donc rien faire.';

revoke all on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;

-- ---------------------------------------------------------------------
-- 2. L'inscription libre crée un compte en attente
--
-- `handle_new_user` ne peut pas distinguer une inscription libre d'une
-- création par le directeur. On marque donc le compte inactif par défaut,
-- et le back-office l'active explicitement après création.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Le rôle n'est JAMAIS lu depuis les métadonnées : un compte qui s'inscrit
  -- lui-même pourrait sinon se déclarer 'owner' et lire tout le CA.
  -- Il naît en outre DÉSACTIVÉ : tant que le directeur ne l'a pas validé,
  -- il ne peut ni lire ni écrire quoi que ce soit.
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'employee',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Le comptage exige un compte actif
--
-- `is_manager()` vérifie déjà l'activation ; c'est le chemin « employé »
-- qui ne la vérifiait pas.
-- ---------------------------------------------------------------------
drop policy if exists count_sessions_select on public.count_sessions;
create policy count_sessions_select on public.count_sessions
  for select to authenticated
  using (public.is_manager() or (public.is_active_user() and date = current_date));

drop policy if exists count_sessions_insert on public.count_sessions;
create policy count_sessions_insert on public.count_sessions
  for insert to authenticated
  with check (
    public.is_manager()
    or (public.is_active_user() and user_id = auth.uid() and date = current_date)
  );

drop policy if exists count_sessions_update on public.count_sessions;
create policy count_sessions_update on public.count_sessions
  for update to authenticated
  using (
    public.is_manager()
    or (public.is_active_user() and date = current_date and status = 'draft')
  )
  with check (public.is_manager() or (public.is_active_user() and date = current_date));

drop policy if exists count_lines_select on public.count_lines;
create policy count_lines_select on public.count_lines
  for select to authenticated
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = count_lines.session_id and s.date = current_date
      )
    )
  );

drop policy if exists count_lines_write on public.count_lines;
create policy count_lines_write on public.count_lines
  for all to authenticated
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = count_lines.session_id and s.date = current_date and s.status = 'draft'
      )
    )
  )
  with check (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = count_lines.session_id and s.date = current_date and s.status = 'draft'
      )
    )
  );

drop policy if exists production_tasks_select on public.production_tasks;
create policy production_tasks_select on public.production_tasks
  for select to authenticated
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = production_tasks.session_id and s.date = current_date
      )
    )
  );

drop policy if exists production_tasks_update on public.production_tasks;
create policy production_tasks_update on public.production_tasks
  for update to authenticated
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = production_tasks.session_id and s.date = current_date
      )
    )
  )
  with check (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = production_tasks.session_id and s.date = current_date
      )
    )
  );

-- ---------------------------------------------------------------------
-- 4. Les vues d'appoint aussi
--
-- `products_for_count` et `team_members` s'exécutent avec les droits de leur
-- propriétaire : sans filtre, un compte en attente y lirait la liste des
-- produits et les prénoms de l'équipe.
-- ---------------------------------------------------------------------
create or replace view public.products_for_count
with (security_invoker = false) as
select p.id, p.name, p.category_id, p.unit, p.count_step,
       p.in_saladbar, p.in_fridge, p.sort_order, p.notes
from public.products p
where p.is_active
  and (public.is_active_user() or public.is_manager());

create or replace view public.team_members
with (security_invoker = false) as
select p.id, p.full_name
from public.profiles p
where p.is_active
  and (public.is_active_user() or public.is_manager());
