-- =====================================================================
-- MEP — Moteur de calcul serveur, version « base_qty »
--
-- Reprend exactement la logique de src/lib/mep, en arithmétique `numeric`
-- (donc sans dérive flottante). Les deux implémentations sont couvertes par
-- le même tableau de vérification.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Arrondi : tout ce qui est visé ou produit monte au multiple supérieur.
-- Il n'existe volontairement aucun autre arrondi dans le moteur.
-- ---------------------------------------------------------------------
create or replace function public.mep_ceil_to(value numeric, step numeric)
returns numeric language sql immutable as $$
  select case when step is null or step <= 0 then value
              else ceil(value / step) * step end
$$;

comment on function public.mep_ceil_to(numeric, numeric) is
  'Arrondi SUPÉRIEUR au multiple du pas. 9,2 -> 10 avec un pas de 1.';

drop function if exists public.mep_round_up_to_step(numeric, numeric);
drop function if exists public.mep_round_nearest_step(numeric, numeric);

-- ---------------------------------------------------------------------
-- Cible et minimum, produit par produit.
--
-- SECURITY DEFINER : ne JAMAIS accorder l'exécution aux employés, la
-- fonction expose les cibles et les minimums.
-- ---------------------------------------------------------------------
drop function if exists public.mep_product_targets(date, public.session_kind);

create function public.mep_product_targets(
  d date,
  p_session public.session_kind
)
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
  v_ca_ref          numeric := coalesce(public.mep_reference_revenue(d, p_session), 0);
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

revoke all on function public.mep_product_targets(date, public.session_kind)
  from public, authenticated;

-- ---------------------------------------------------------------------
-- Validation d'un comptage.
--
-- Point d'entrée unique de l'employé. Le serveur calcule cibles et
-- minimums, écrit les snapshots, crée les tâches de production, et ne
-- renvoie que { produit, quantité, unité, priorité }.
-- ---------------------------------------------------------------------
drop function if exists public.mep_submit_count(uuid);

create function public.mep_submit_count(p_session_id uuid)
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
  from public.mep_product_targets(v_session.date, v_session.session) t
  where cl.session_id = p_session_id and cl.product_id = t.product_id;

  update public.count_sessions
  set status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      forecast_revenue_snapshot = public.mep_forecast_revenue(v_session.date)
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

grant execute on function public.mep_submit_count(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Relecture du rapport d'une session déjà validée.
-- ---------------------------------------------------------------------
drop function if exists public.mep_reorder_report(uuid);

create function public.mep_reorder_report(p_session_id uuid)
returns table (
  product_id     uuid,
  product_name   text,
  notes          text,
  qty_to_produce numeric,
  unit           public.product_unit,
  priority       integer,
  is_done        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select pt.product_id, p.name, p.notes, pt.qty_to_produce, p.unit,
         pt.priority_snapshot, pt.is_done
  from public.production_tasks pt
  join public.products p on p.id = pt.product_id
  join public.count_sessions s on s.id = pt.session_id
  where pt.session_id = p_session_id
    and (public.is_manager() or s.date = current_date)
  order by pt.priority_snapshot asc, p.name asc;
$$;

grant execute on function public.mep_reorder_report(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Les réglages de famille sont du back-office.
-- ---------------------------------------------------------------------
alter table public.product_family_settings enable row level security;
alter table public.product_family_settings force row level security;

create policy product_family_settings_all_manager on public.product_family_settings
  for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create trigger product_family_settings_audit
  after insert or update or delete on public.product_family_settings
  for each row execute function public.audit_trigger();
