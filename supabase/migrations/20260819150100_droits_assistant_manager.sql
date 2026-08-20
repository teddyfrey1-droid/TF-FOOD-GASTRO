-- =====================================================================
-- MEP — Ce que peut l'assistant manager, et le comptage à l'unité
-- =====================================================================

-- ---------------------------------------------------------------------
-- Un cran entre le salarié et le directeur.
--
-- `is_manager()` reste la barrière du chiffre d'affaires : elle ne
-- s'ouvre PAS à l'assistant manager. `is_staff_lead()` autorise ce qui
-- relève du pilotage de service — historique, fiche produits — sans
-- jamais laisser filtrer un montant.
-- ---------------------------------------------------------------------
create or replace function public.is_staff_lead()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    public.current_user_role() in ('assistant_manager', 'manager', 'owner'),
    false
  )
$$;

comment on function public.is_staff_lead() is
  'Assistant manager, directeur ou propriétaire. Donne accès au pilotage de service, JAMAIS au chiffre d''affaires.';

revoke all on function public.is_staff_lead() from public, anon;
grant execute on function public.is_staff_lead() to authenticated;

-- L'assistant manager lit l'historique des comptages (mais pas les cibles
-- ni les minimums, qui restent des colonnes de `count_lines` filtrées plus
-- bas), et la liste des produits en lecture seule.
drop policy if exists count_sessions_select on public.count_sessions;
create policy count_sessions_select on public.count_sessions
  for select to authenticated
  using (
    public.is_staff_lead()
    or (public.is_active_user() and date = current_date)
  );

drop policy if exists count_lines_select on public.count_lines;
create policy count_lines_select on public.count_lines
  for select to authenticated
  using (
    public.is_staff_lead()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = count_lines.session_id and s.date = current_date
      )
    )
  );

drop policy if exists production_tasks_select on public.production_tasks;
create policy production_tasks_select on public.production_tasks
  for select to authenticated
  using (
    public.is_staff_lead()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.count_sessions s
        where s.id = production_tasks.session_id and s.date = current_date
      )
    )
  );

-- ---------------------------------------------------------------------
-- Le comptage passe à l'unité entière
--
-- Un demi-bao n'existe pas, et le demi-gastro ralentissait la saisie sans
-- rien apporter. Le pas de comptage rejoint donc le pas de production.
-- ---------------------------------------------------------------------
update public.products set count_step = 1 where count_step <> 1;

alter table public.products
  alter column count_step set default 1;

comment on column public.products.count_step is
  'Pas de saisie au comptage. 1 : on compte des gastros et des pièces entières.';

-- Les quantités déjà saisies en demis sont remontées à l'entier supérieur,
-- pour rester cohérentes avec le nouveau pas.
update public.count_lines
set qty_saladbar = ceil(qty_saladbar),
    qty_fridge   = ceil(qty_fridge)
where qty_saladbar <> ceil(qty_saladbar) or qty_fridge <> ceil(qty_fridge);
