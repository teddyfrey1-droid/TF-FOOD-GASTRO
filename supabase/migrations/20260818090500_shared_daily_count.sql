-- =====================================================================
-- MEP — Le comptage du jour est un travail d'équipe
--
-- Le §8 du cahier des charges décrit l'accès employé comme « ses propres
-- sessions du jour ». Pris au pied de la lettre, cela casse deux exigences
-- du §6 :
--
--   • §6.2 demande que l'accueil affiche « fait à 08h42 par Karim » — donc
--     qu'un employé voie les sessions de ses collègues ;
--   • il n'existe qu'UNE session par (date, moment). Si Karim ouvre le
--     comptage du matin, Sofia se retrouve sans aucun accès en écriture et
--     ne peut tout simplement plus compter.
--
-- On élargit donc l'accès au COMPTAGE DU JOUR à tout employé actif, en
-- gardant intactes les deux protections qui comptent vraiment :
--   • aucun accès au CA, au calculateur, aux cibles ni aux seuils ;
--   • un comptage validé n'est plus modifiable (il devient historique).
--
-- L'auteur de chaque session reste enregistré, et le journal reste lisible.
-- =====================================================================

-- ---------------------------------------------------------------------
-- count_sessions
-- ---------------------------------------------------------------------
drop policy if exists count_sessions_select on public.count_sessions;
create policy count_sessions_select on public.count_sessions
  for select to authenticated
  using (public.is_manager() or date = current_date);

drop policy if exists count_sessions_update on public.count_sessions;
create policy count_sessions_update on public.count_sessions
  for update to authenticated
  using (public.is_manager() or (date = current_date and status = 'draft'))
  with check (public.is_manager() or date = current_date);

-- L'insertion reste nominative : on n'ouvre une session qu'en son propre nom.
drop policy if exists count_sessions_insert on public.count_sessions;
create policy count_sessions_insert on public.count_sessions
  for insert to authenticated
  with check (public.is_manager() or (user_id = auth.uid() and date = current_date));

-- ---------------------------------------------------------------------
-- count_lines
-- ---------------------------------------------------------------------
drop policy if exists count_lines_select on public.count_lines;
create policy count_lines_select on public.count_lines
  for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.count_sessions s
      where s.id = count_lines.session_id and s.date = current_date
    )
  );

drop policy if exists count_lines_write on public.count_lines;
create policy count_lines_write on public.count_lines
  for all to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.count_sessions s
      where s.id = count_lines.session_id
        and s.date = current_date
        and s.status = 'draft'
    )
  )
  with check (
    public.is_manager()
    or exists (
      select 1 from public.count_sessions s
      where s.id = count_lines.session_id
        and s.date = current_date
        and s.status = 'draft'
    )
  );

-- ---------------------------------------------------------------------
-- La validation suit la même règle : le comptage du jour, pas le sien.
-- ---------------------------------------------------------------------
create or replace function public.mep_submit_count(p_session_id uuid)
returns table (
  product_id     uuid,
  product_name   text,
  gn_format      text,
  notes          text,
  qty_to_produce numeric,
  urgency_level  integer,
  is_critical    boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session public.count_sessions%rowtype;
begin
  select * into v_session from public.count_sessions where id = p_session_id;
  if not found then
    raise exception 'Session de comptage introuvable.' using errcode = 'P0002';
  end if;

  -- Un employé valide le comptage DU JOUR ; l'historique reste hors d'atteinte.
  if not public.is_manager() and v_session.date <> current_date then
    raise exception 'Accès refusé à cette session de comptage.' using errcode = '42501';
  end if;

  update public.count_lines cl
  set target_snapshot            = t.target,
      reorder_threshold_snapshot = t.reorder_threshold,
      production_needed_snapshot = case
        when cl.is_not_applicable then 0
        when cl.qty_total < t.reorder_threshold
          then greatest(public.mep_round_up_to_step(t.target - cl.qty_total, p.production_step), 0)
        else 0
      end
  from public.mep_product_targets(v_session.date, v_session.session) t
  join public.products p on p.id = t.product_id
  where cl.session_id = p_session_id and cl.product_id = t.product_id;

  update public.count_sessions
  set status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      forecast_revenue_snapshot = public.mep_forecast_revenue(v_session.date)
  where id = p_session_id;

  delete from public.production_tasks
  where session_id = p_session_id and not is_done;

  insert into public.production_tasks (session_id, product_id, qty_to_produce, urgency_level_snapshot)
  select p_session_id, cl.product_id, cl.production_needed_snapshot, p.urgency_level
  from public.count_lines cl
  join public.products p on p.id = cl.product_id
  where cl.session_id = p_session_id
    and coalesce(cl.production_needed_snapshot, 0) > 0
  on conflict (session_id, product_id) do update
    set qty_to_produce = excluded.qty_to_produce,
        urgency_level_snapshot = excluded.urgency_level_snapshot;

  return query
  select
    pt.product_id,
    p.name,
    p.gn_format,
    p.notes,
    pt.qty_to_produce,
    pt.urgency_level_snapshot,
    (cl.qty_total = 0
     or (p.urgency_level >= 4
         and cl.target_snapshot > 0
         and cl.qty_total / cl.target_snapshot < 0.25))
  from public.production_tasks pt
  join public.products p     on p.id = pt.product_id
  join public.count_lines cl on cl.session_id = pt.session_id and cl.product_id = pt.product_id
  where pt.session_id = p_session_id
  order by pt.urgency_level_snapshot desc,
           case when cl.target_snapshot > 0 then cl.qty_total / cl.target_snapshot else 1 end asc,
           p.name asc;
end;
$$;

-- Idem pour la relecture du rapport.
create or replace function public.mep_reorder_report(p_session_id uuid)
returns table (
  product_id     uuid,
  product_name   text,
  gn_format      text,
  notes          text,
  qty_to_produce numeric,
  urgency_level  integer,
  is_done        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select pt.product_id, p.name, p.gn_format, p.notes,
         pt.qty_to_produce, pt.urgency_level_snapshot, pt.is_done
  from public.production_tasks pt
  join public.products p on p.id = pt.product_id
  join public.count_sessions s on s.id = pt.session_id
  where pt.session_id = p_session_id
    and (public.is_manager() or s.date = current_date)
  order by pt.urgency_level_snapshot desc, p.name asc;
$$;

create or replace function public.mep_reorder_prep_time(p_session_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(pt.qty_to_produce * coalesce(p.prep_time_min, 0)), 0)
  from public.production_tasks pt
  join public.products p on p.id = pt.product_id
  join public.count_sessions s on s.id = pt.session_id
  where pt.session_id = p_session_id
    and not pt.is_done
    and (public.is_manager() or s.date = current_date);
$$;

-- ---------------------------------------------------------------------
-- « Fait à 08h42 par Karim » (§6.2)
--
-- Un employé doit pouvoir mettre un prénom sur le comptage du jour, sans
-- pour autant lire la table `profiles` (qui porte les rôles). Même procédé
-- que pour les produits : une vue qui n'expose que le strict nécessaire.
-- ---------------------------------------------------------------------
create view public.team_members
with (security_invoker = false) as
select p.id, p.full_name
from public.profiles p
where p.is_active;

comment on view public.team_members is
  'Prénoms de l''équipe, pour afficher l''auteur d''un comptage. Ni rôle, ni état d''activation.';

revoke all on public.team_members from public;
grant select on public.team_members to authenticated;
