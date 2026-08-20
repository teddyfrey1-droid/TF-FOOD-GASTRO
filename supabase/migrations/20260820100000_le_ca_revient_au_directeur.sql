-- =====================================================================
-- RÉGRESSION CORRIGÉE — le directeur ne voyait plus aucun CA
--
-- En bouchant la faille d'`anon`, la migration 20260819140000 a révoqué
-- mep_forecast_revenue, mep_reference_revenue et mep_product_targets à
-- `public, anon, authenticated`. Or le back-office les appelle avec le
-- jeton du DIRECTEUR, qui est un `authenticated` : chaque appel repartait
-- en « permission denied », le client recevait null, et l'écran affichait
-- « — » à la place du chiffre d'affaires. Les 691 journées d'historique
-- étaient bien en base — elles n'étaient simplement plus lisibles.
--
-- La leçon : une fonction SECURITY DEFINER ne doit pas se protéger par
-- ses seuls droits d'exécution. Elle porte désormais son propre contrôle
-- de rôle, et le droit d'exécution redevient celui de tout compte
-- connecté. Un employé qui forcerait l'appel reçoit un refus explicite.
--
-- Pour que la validation d'un comptage continue de fonctionner — elle
-- calcule les cibles POUR un employé, sans jamais les lui montrer — la
-- logique descend dans trois fonctions internes, exécutables par
-- personne, et les fonctions publiques ne sont plus que des gardes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La logique, en interne. Aucun rôle applicatif ne peut les appeler.
-- ---------------------------------------------------------------------

create or replace function public.mep_forecast_internal(d date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_manual      numeric;
  v_source      public.forecast_source;
  v_coefficient numeric := 1;
  v_growth      numeric;
  v_ref         date;
  v_revenue     numeric;
  v_attempt     int := 0;
begin
  select forecast_revenue, coefficient, source
    into v_manual, v_coefficient, v_source
  from public.daily_forecast
  where date = d;

  -- Un écrasement manuel gagne toujours sur le calcul.
  if v_manual is not null and v_source = 'manual' then
    return v_manual;
  end if;

  v_coefficient := coalesce(v_coefficient, 1);
  select growth_rate into v_growth from public.revenue_settings where id;

  v_ref := public.mep_reference_date(d);

  -- Si la référence N-1 est un jour de fermeture (ou absente), on remonte
  -- au même jour de semaine de la semaine précédente.
  while v_attempt <= 8 loop
    select revenue_ht into v_revenue
    from public.revenue_history
    where date = v_ref and not is_closed_day;

    if found then
      return round(v_revenue * (1 + coalesce(v_growth, 0)) * v_coefficient, 2);
    end if;

    v_ref := v_ref - 7;
    v_attempt := v_attempt + 1;
  end loop;

  return null;
end;
$$;

comment on function public.mep_forecast_internal(date) is
  'CA prévisionnel, SANS contrôle de rôle. Réservé aux autres fonctions SECURITY DEFINER.';

create or replace function public.mep_reference_internal(d date, p_session public.session_kind)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_forecast numeric := public.mep_forecast_internal(d);
  v_margin   numeric;
  v_ratio    numeric;
begin
  if v_forecast is null then return null; end if;

  select safety_margin, afternoon_target_ratio
    into v_margin, v_ratio
  from public.revenue_settings where id;

  return round(
    v_forecast * (1 + v_margin) * case when p_session = 'afternoon' then v_ratio else 1 end,
    2
  );
end;
$$;

drop function if exists public.mep_targets_internal(date, public.session_kind);

create function public.mep_targets_internal(d date, p_session public.session_kind)
returns table (
  product_id   uuid,
  product_name text,
  target       numeric,
  minimum      numeric,
  priority     integer,
  unit         public.product_unit
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ca_ref          numeric := coalesce(public.mep_reference_internal(d, p_session), 0);
  v_default_divisor numeric;
begin
  select default_min_divisor into v_default_divisor from public.revenue_settings where id;

  return query
  with computed as (
    select
      p.id,
      p.name,
      p.priority,
      p.unit,
      p.count_step,
      p.min_mode,
      p.min_divisor,
      p.min_qty_manual,
      -- cible = base × multiplicateur × (CA_ref / référence), bornée puis
      -- arrondie à l'ENTIER supérieur.
      public.mep_ceil_to(
        greatest(
          least(
            greatest(p.base_qty * f.target_multiplier * (v_ca_ref / f.reference_revenue), 0),
            coalesce(p.ceiling_qty, 'infinity'::numeric)
          ),
          coalesce(p.floor_qty, 0)
        ),
        1
      ) as computed_target
    from public.products p
    join public.product_family_settings f on f.family = p.family
    where p.is_active
  )
  select
    c.id,
    c.name,
    c.computed_target,
    -- minimum : cible / diviseur (ou valeur manuelle), arrondi SUPÉRIEUR au
    -- pas de comptage, puis borné par la cible.
    least(
      public.mep_ceil_to(
        greatest(
          case
            when c.min_mode = 'manual' then coalesce(c.min_qty_manual, 0)
            else c.computed_target
                 / greatest(coalesce(nullif(c.min_divisor, 0), v_default_divisor), 0.001)
          end,
          0
        ),
        c.count_step
      ),
      c.computed_target
    ),
    c.priority,
    c.unit
  from computed c;
end;
$$;

revoke all on function public.mep_forecast_internal(date)                            from public, anon, authenticated;
revoke all on function public.mep_reference_internal(date, public.session_kind)      from public, anon, authenticated;
revoke all on function public.mep_targets_internal(date, public.session_kind)        from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Les fonctions publiques ne sont plus que des gardes.
--
-- Le refus est EXPLICITE : un employé qui forcerait l'appel obtient une
-- erreur 42501, pas un null silencieux qu'on prendrait pour une panne —
-- c'est précisément ce qui a rendu cette régression si difficile à voir.
-- ---------------------------------------------------------------------

create or replace function public.mep_forecast_revenue(d date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Le chiffre d''affaires est réservé au directeur.' using errcode = '42501';
  end if;
  return public.mep_forecast_internal(d);
end;
$$;

create or replace function public.mep_reference_revenue(d date, p_session public.session_kind)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Le chiffre d''affaires est réservé au directeur.' using errcode = '42501';
  end if;
  return public.mep_reference_internal(d, p_session);
end;
$$;

drop function if exists public.mep_product_targets(date, public.session_kind);

create function public.mep_product_targets(d date, p_session public.session_kind)
returns table (
  product_id   uuid,
  product_name text,
  target       numeric,
  minimum      numeric,
  priority     integer,
  unit         public.product_unit
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Les cibles sont réservées au directeur.' using errcode = '42501';
  end if;
  return query select * from public.mep_targets_internal(d, p_session);
end;
$$;

revoke all on function public.mep_forecast_revenue(date)                        from public, anon;
revoke all on function public.mep_reference_revenue(date, public.session_kind)  from public, anon;
revoke all on function public.mep_product_targets(date, public.session_kind)    from public, anon;
grant execute on function public.mep_forecast_revenue(date)                       to authenticated;
grant execute on function public.mep_reference_revenue(date, public.session_kind) to authenticated;
grant execute on function public.mep_product_targets(date, public.session_kind)   to authenticated;

-- ---------------------------------------------------------------------
-- 3. Un mois de prévisions en UN aller-retour
--
-- L'écran du chiffre d'affaires appelait la fonction une fois par jour du
-- mois : trente-et-un allers-retours réseau pour afficher un tableau.
-- C'est la première cause de sa lenteur.
-- ---------------------------------------------------------------------
drop function if exists public.mep_forecast_range(date, date);

create function public.mep_forecast_range(d_from date, d_to date)
returns table (date date, forecast numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Le chiffre d''affaires est réservé au directeur.' using errcode = '42501';
  end if;

  -- Garde-fou : une plage démesurée ferait tourner la boucle de repli
  -- des milliers de fois.
  if d_to < d_from or d_to - d_from > 400 then
    raise exception 'Plage de dates invalide.' using errcode = '22023';
  end if;

  return query
  select g::date, public.mep_forecast_internal(g::date)
  from generate_series(d_from, d_to, interval '1 day') g;
end;
$$;

revoke all on function public.mep_forecast_range(date, date) from public, anon;
grant execute on function public.mep_forecast_range(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 4. La validation d'un comptage passe par les fonctions internes
--
-- Elle calcule les cibles POUR un employé, en son nom : elle ne peut donc
-- pas franchir la garde `is_manager()`.
-- ---------------------------------------------------------------------
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
begin
  select * into v_session from public.count_sessions where id = p_session_id;
  if not found then
    raise exception 'Session de comptage introuvable.' using errcode = 'P0002';
  end if;

  if not public.is_manager()
     and (v_session.user_id <> auth.uid() or v_session.date <> current_date) then
    raise exception 'Accès refusé à cette session de comptage.' using errcode = '42501';
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
