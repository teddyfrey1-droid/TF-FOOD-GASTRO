-- =====================================================================
-- Performance : ce que l'analyseur Supabase a relevé
--
-- Aucun changement de RÈGLE ici — qui voit quoi reste identique, et la
-- suite de tests de sécurité le vérifie. Seule l'exécution change.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. `auth.uid()` était réévalué À CHAQUE LIGNE
--
-- Écrit tel quel, Postgres traite `auth.uid()` comme dépendant de la ligne
-- et le rappelle pour chacune. Enveloppé dans un `select`, il devient un
-- InitPlan : évalué UNE fois, puis comparé. Sur les 39 lignes d'un
-- comptage, c'est 39 appels contre 1.
-- ---------------------------------------------------------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_manager());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.is_manager())
  with check (id = (select auth.uid()) or public.is_manager());

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_manager());

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_manager());

drop policy if exists count_sessions_insert on public.count_sessions;
create policy count_sessions_insert on public.count_sessions
  for insert to authenticated
  with check (
    public.is_manager()
    or (public.is_active_user() and user_id = (select auth.uid()) and date = current_date)
  );

-- ---------------------------------------------------------------------
-- 2. Des politiques permissives se doublaient sur le SELECT
--
-- Une politique `for all` couvre aussi la LECTURE. Là où une politique de
-- lecture dédiée existe déjà, les deux étaient évaluées à chaque ligne
-- pour un résultat identique. Les politiques d'écriture sont donc
-- restreintes à ce qu'elles décrivent : écrire.
--
-- Aucune permission n'est retirée : `count_lines_write` accordait la
-- lecture à `is_manager()`, or `count_lines_select` l'accorde déjà à
-- `is_staff_lead()`, qui contient les directeurs. Idem ailleurs.
-- ---------------------------------------------------------------------
drop policy if exists count_lines_write on public.count_lines;

create policy count_lines_insert on public.count_lines
  for insert to authenticated
  with check (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = count_lines.session_id
          and s.date = current_date
          and s.status = 'draft'
      )
    )
  );

create policy count_lines_update on public.count_lines
  for update to authenticated
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = count_lines.session_id
          and s.date = current_date
          and s.status = 'draft'
      )
    )
  )
  with check (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = count_lines.session_id
          and s.date = current_date
          and s.status = 'draft'
      )
    )
  );

create policy count_lines_delete on public.count_lines
  for delete to authenticated
  using (
    public.is_manager()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = count_lines.session_id
          and s.date = current_date
          and s.status = 'draft'
      )
    )
  );

drop policy if exists product_categories_write_manager on public.product_categories;
create policy product_categories_insert_manager on public.product_categories
  for insert to authenticated with check (public.is_manager());
create policy product_categories_update_manager on public.product_categories
  for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy product_categories_delete_manager on public.product_categories
  for delete to authenticated using (public.is_manager());

drop policy if exists production_tasks_write_manager on public.production_tasks;
create policy production_tasks_insert_manager on public.production_tasks
  for insert to authenticated with check (public.is_manager());
create policy production_tasks_delete_manager on public.production_tasks
  for delete to authenticated using (public.is_manager());
-- L'UPDATE reste couvert par `production_tasks_update`, qui autorise déjà
-- le directeur : une seconde politique ferait doublon.

-- ---------------------------------------------------------------------
-- 3. Clés étrangères sans index
--
-- Sans index, chaque jointure du rapport de production balaie la table,
-- et supprimer un compte impose un balayage complet du journal d'audit.
-- ---------------------------------------------------------------------
create index if not exists production_tasks_product_idx
  on public.production_tasks (product_id);
create index if not exists production_tasks_done_by_idx
  on public.production_tasks (done_by) where done_by is not null;
create index if not exists count_sessions_user_idx
  on public.count_sessions (user_id);
create index if not exists audit_log_user_idx
  on public.audit_log (user_id) where user_id is not null;
