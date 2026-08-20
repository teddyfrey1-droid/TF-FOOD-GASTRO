-- =====================================================================
-- Le rapport de relance transporte de quoi afficher une vignette
--
-- L'écran de comptage montre une pastille par produit ; le rapport, lui,
-- n'affichait que du texte. C'est pourtant l'écran sur lequel on travaille,
-- une gastro dans les mains. Les deux fonctions renvoient donc la photo et
-- la catégorie — ni l'une ni l'autre ne dit quoi que ce soit du chiffre
-- d'affaires, de la cible ou du minimum.
-- =====================================================================

-- La signature change : Postgres exige un `drop` avant de redéfinir le type
-- de retour d'une fonction.
drop function if exists public.mep_submit_count(uuid);

create function public.mep_submit_count(p_session_id uuid)
returns table (
  product_id     uuid,
  product_name   text,
  notes          text,
  qty_to_produce numeric,
  unit           public.product_unit,
  priority       integer,
  image_url      text,
  category_name  text
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_session public.count_sessions%rowtype;
  v_pending integer;
begin
  select * into v_session from public.count_sessions where id = p_session_id;
  if not found then
    raise exception 'Session de comptage introuvable.' using errcode = 'P0002';
  end if;

  if not public.is_manager()
     and (v_session.user_id <> auth.uid() or v_session.date <> current_date) then
    raise exception 'Accès refusé à cette session de comptage.' using errcode = '42501';
  end if;

  v_pending := public.mep_count_pending(p_session_id);
  if v_pending > 0 then
    raise exception 'Il reste % produit(s) à compter.', v_pending using errcode = 'P0001';
  end if;

  update public.count_lines cl
  set target_snapshot            = t.target,
      min_snapshot               = t.minimum,
      production_needed_snapshot = case
        when cl.is_not_applicable then 0
        when cl.qty_total < t.minimum
          then greatest(public.mep_ceil_to(t.target - cl.qty_total, 1), 0)
        else 0
      end
  from public.mep_targets_internal(v_session.date, v_session.session) t
  where cl.session_id = p_session_id and cl.product_id = t.product_id;

  update public.count_sessions
  set status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      forecast_revenue_snapshot = public.mep_forecast_internal(v_session.date)
  where id = p_session_id;

  delete from public.production_tasks
  where session_id = p_session_id and not is_done;

  insert into public.production_tasks (session_id, product_id, qty_to_produce, priority_snapshot)
  select p_session_id, cl.product_id, cl.production_needed_snapshot, p.priority
  from public.count_lines cl
  join public.products p on p.id = cl.product_id
  where cl.session_id = p_session_id
    and p.is_active
    and coalesce(cl.production_needed_snapshot, 0) > 0
  on conflict (session_id, product_id) do update
    set qty_to_produce = excluded.qty_to_produce,
        priority_snapshot = excluded.priority_snapshot;

  return query
  select pt.product_id, p.name, p.notes, pt.qty_to_produce, p.unit, pt.priority_snapshot,
         p.image_url, c.name
  from public.production_tasks pt
  join public.products p            on p.id = pt.product_id
  join public.product_categories c  on c.id = p.category_id
  join public.count_lines cl        on cl.session_id = pt.session_id
                                   and cl.product_id = pt.product_id
  where pt.session_id = p_session_id
  -- Priorité CROISSANTE : 1 est le plus urgent.
  order by pt.priority_snapshot asc,
           case when cl.target_snapshot > 0 then cl.qty_total / cl.target_snapshot else 1 end asc,
           p.name asc;
end;
$$;

revoke all on function public.mep_submit_count(uuid) from public, anon;
grant execute on function public.mep_submit_count(uuid) to authenticated;

drop function if exists public.mep_reorder_report(uuid);

create function public.mep_reorder_report(p_session_id uuid)
returns table (
  product_id     uuid,
  product_name   text,
  notes          text,
  qty_to_produce numeric,
  unit           public.product_unit,
  priority       integer,
  is_done        boolean,
  image_url      text,
  category_name  text
)
language sql
stable
security definer
set search_path = public
as $$
  select pt.product_id, p.name, p.notes, pt.qty_to_produce, p.unit,
         pt.priority_snapshot, pt.is_done, p.image_url, c.name
  from public.production_tasks pt
  join public.products p           on p.id = pt.product_id
  join public.product_categories c on c.id = p.category_id
  join public.count_sessions s     on s.id = pt.session_id
  where pt.session_id = p_session_id
    and (public.is_staff_lead() or s.date = current_date)
  order by pt.priority_snapshot asc, p.name asc;
$$;

revoke all on function public.mep_reorder_report(uuid) from public, anon;
grant execute on function public.mep_reorder_report(uuid) to authenticated;
