-- =====================================================================
-- Deux pièges désamorcés
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La base raisonne désormais en heure de Paris
--
-- `current_date` gouverne TOUT : quelle session on ouvre, ce que la RLS
-- laisse voir, ce qu'un employé peut encore modifier. Sur une base en UTC,
-- entre minuit et 2 h du matin l'heure de Paris, cette date valait encore
-- la veille — alors que l'application, elle, calcule la date de Paris.
-- Les deux se contredisaient : « session introuvable » sur un comptage
-- pourtant ouvert.
--
-- Seul l'affichage change ; les `timestamptz` restent stockés en UTC.
-- ---------------------------------------------------------------------
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Europe/Paris');
end
$$;

-- ---------------------------------------------------------------------
-- 2. Un produit désactivé en cours de journée bloquait la validation
--
-- L'ouverture d'un comptage crée une ligne par produit ACTIF, et sait
-- rattraper un produit ajouté en cours de route. Mais rien ne retirait la
-- ligne d'un produit RETIRÉ : elle restait non comptée pour toujours.
-- Or l'écran ne l'affiche plus — il ne montre que les produits actifs.
-- L'employé comptait donc tout ce qu'il voyait, et la validation refusait
-- quand même : « il reste 3 produits à compter », introuvables.
--
-- Vécu le jour où Sunny, Daily et Berry Bowl ont laissé la place à l'açaï.
--
-- On ne supprime QUE les lignes jamais comptées : une ligne déjà relevée
-- est une mesure, elle appartient à l'historique.
-- ---------------------------------------------------------------------
create or replace function public.mep_open_count_session(
  p_session public.session_kind,
  p_device_info jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_user_id    uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select id into v_session_id
  from public.count_sessions
  where date = current_date and session = p_session;

  if v_session_id is null then
    insert into public.count_sessions (date, session, user_id, device_info)
    values (current_date, p_session, v_user_id, p_device_info)
    -- Deux téléphones qui ouvrent le même comptage en même temps : le premier
    -- gagne, le second récupère la session existante plutôt qu'une erreur.
    on conflict (date, session) do nothing
    returning id into v_session_id;

    if v_session_id is null then
      select id into v_session_id
      from public.count_sessions
      where date = current_date and session = p_session;
    end if;
  end if;

  -- Une ligne par produit actif. `on conflict do nothing` rend l'appel
  -- réentrant : un produit ajouté en cours de journée apparaît au rechargement.
  insert into public.count_lines (session_id, product_id)
  select v_session_id, p.id
  from public.products p
  where p.is_active
  on conflict (session_id, product_id) do nothing;

  -- Le pendant, qui manquait : la ligne d'un produit retiré du catalogue
  -- disparaît, tant qu'elle n'a jamais été relevée.
  delete from public.count_lines cl
  using public.products p
  where cl.session_id = v_session_id
    and p.id = cl.product_id
    and not p.is_active
    and cl.counted_at is null;

  return v_session_id;
end;
$$;

revoke all on function public.mep_open_count_session(public.session_kind, jsonb) from public, anon;
grant execute on function public.mep_open_count_session(public.session_kind, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. « Comptage terminé » se vérifie MAINTENANT côté serveur, par zone
--
-- Le contrôle vivait dans le navigateur, et le serveur se contentait de
-- regarder `counted_at` — renseigné dès qu'UNE seule zone est touchée.
-- Un client modifié, ou simplement une version en cache, pouvait donc
-- valider une journée où le frigo du bas n'avait jamais été ouvert : le
-- rapport aurait compté le stock du saladbar comme s'il était le stock
-- total, et sous-estimé chaque relance.
-- ---------------------------------------------------------------------
create or replace function public.mep_count_pending(p_session_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.count_lines cl
  join public.products p on p.id = cl.product_id
  where cl.session_id = p_session_id
    and p.is_active
    and not cl.is_not_applicable
    -- Chaque zone où le produit est stocké doit avoir été relevée.
    and (
      (p.in_saladbar and cl.counted_saladbar_at is null)
      or (p.in_fridge and cl.counted_fridge_at is null)
      -- Produit rangé nulle part : le relevé global fait foi.
      or (not p.in_saladbar and not p.in_fridge and cl.counted_at is null)
    );
$$;

comment on function public.mep_count_pending(uuid) is
  'Nombre de produits qu''il reste à relever, ZONE PAR ZONE.';

revoke all on function public.mep_count_pending(uuid) from public, anon;
grant execute on function public.mep_count_pending(uuid) to authenticated;

create or replace function public.mep_submit_count(p_session_id uuid)
returns table (
  product_id     uuid,
  product_name   text,
  notes          text,
  qty_to_produce numeric,
  unit           public.product_unit,
  priority       integer
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

  -- Snapshots : figent cible, minimum et besoin au moment du comptage.
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
  select pt.product_id, p.name, p.notes, pt.qty_to_produce, p.unit, pt.priority_snapshot
  from public.production_tasks pt
  join public.products p     on p.id = pt.product_id
  join public.count_lines cl on cl.session_id = pt.session_id and cl.product_id = pt.product_id
  where pt.session_id = p_session_id
  -- Priorité CROISSANTE : 1 est le plus urgent.
  order by pt.priority_snapshot asc,
           case when cl.target_snapshot > 0 then cl.qty_total / cl.target_snapshot else 1 end asc,
           p.name asc;
end;
$$;

revoke all on function public.mep_submit_count(uuid) from public, anon;
grant execute on function public.mep_submit_count(uuid) to authenticated;
