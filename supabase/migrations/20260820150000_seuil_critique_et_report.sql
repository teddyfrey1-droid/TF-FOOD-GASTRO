-- =====================================================================
-- Deux seuils, et la possibilité de reporter un produit
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Le seuil CRITIQUE, distinct du minimum
--
-- Le minimum dit « il faut en refaire ». Le critique dit « on va en
-- manquer PENDANT le service ». Ce ne sont pas les mêmes urgences, et
-- jusqu'ici seul le premier existait : le rapport se contentait de la
-- priorité, qui est un jugement général et non l'état du jour.
--
-- Cas qui a motivé le changement : 2 Edamame en stock pour un critique à
-- 3, face à un Poulet Mayo de priorité 1 encore au-dessus de son minimum.
-- L'Edamame doit passer devant — c'est lui qui manquera à midi.
--
-- Le critique est BORNÉ PAR LE MINIMUM. Un critique supérieur au minimum
-- rendrait un produit « critique » avant même d'être à relancer, et le
-- rapport afficherait du rouge sur des bacs encore pleins.
-- ---------------------------------------------------------------------
alter table public.products
  add column crit_mode      public.min_mode not null default 'auto',
  add column crit_divisor   numeric(6, 3) not null default 4 check (crit_divisor > 0),
  add column crit_qty_manual numeric(8, 3) check (crit_qty_manual >= 0);

alter table public.products
  add constraint products_crit_config_present
    check (crit_mode <> 'manual' or crit_qty_manual is not null);

comment on column public.products.crit_divisor is
  'Diviseur du seuil critique (4 = le quart de la cible), en mode auto.';
comment on column public.products.crit_qty_manual is
  'Seuil critique en valeur absolue, utilisé si crit_mode = manual.';

alter table public.revenue_settings
  add column default_crit_divisor numeric(6, 3) not null default 4
    check (default_crit_divisor > 0);

comment on column public.revenue_settings.default_crit_divisor is
  'Diviseur de seuil critique par défaut (4 = le quart de la cible).';

alter table public.count_lines add column crit_snapshot numeric(8, 3);
comment on column public.count_lines.crit_snapshot is
  'Seuil critique appliqué au moment du comptage. Sans lui, le régler après coup réécrirait l''historique.';

alter table public.production_tasks
  add column is_critical boolean not null default false;

comment on column public.production_tasks.is_critical is
  'Le stock était sous le seuil critique. Passe AVANT la priorité dans le tri du rapport.';

-- ---------------------------------------------------------------------
-- 2. Reporter un produit à plus tard, avec un motif
--
-- Différent de « produit absent » : absent veut dire qu'il n'y en a nulle
-- part et que le comptage vaut zéro. Reporté veut dire « je ne peux pas
-- le compter maintenant » — la chambre froide est en livraison, le bac est
-- au passe. On ne sait donc RIEN de son stock, et il serait faux de le
-- traiter comme un zéro : il sort du rapport plutôt que d'y entrer avec
-- une quantité inventée.
-- ---------------------------------------------------------------------
alter table public.count_lines
  add column deferred_at     timestamptz,
  add column deferred_reason text;

alter table public.count_lines
  add constraint count_lines_deferred_reason_present
    check (deferred_at is null or deferred_reason is not null);

comment on column public.count_lines.deferred_at is
  'Comptage reporté : le produit ne bloque plus la validation et n''entre pas au rapport.';

-- ---------------------------------------------------------------------
-- 3. Le calcul renvoie désormais les trois seuils
-- ---------------------------------------------------------------------
drop function if exists public.mep_targets_internal(date, public.session_kind);

create function public.mep_targets_internal(d date, p_session public.session_kind)
returns table (
  product_id   uuid,
  product_name text,
  target       numeric,
  minimum      numeric,
  critical     numeric,
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
  v_default_crit    numeric;
begin
  select default_min_divisor, default_crit_divisor
    into v_default_divisor, v_default_crit
  from public.revenue_settings where id;

  return query
  with computed as (
    select
      p.id, p.name, p.priority, p.unit, p.count_step,
      p.min_mode, p.min_divisor, p.min_qty_manual,
      p.crit_mode, p.crit_divisor, p.crit_qty_manual,
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
  ),
  avec_min as (
    select
      c.*,
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
      ) as computed_min
    from computed c
  )
  select
    m.id,
    m.name,
    m.computed_target,
    m.computed_min,
    -- Critique : borné par le MINIMUM, jamais au-dessus.
    least(
      public.mep_ceil_to(
        greatest(
          case
            when m.crit_mode = 'manual' then coalesce(m.crit_qty_manual, 0)
            else m.computed_target
                 / greatest(coalesce(nullif(m.crit_divisor, 0), v_default_crit), 0.001)
          end,
          0
        ),
        m.count_step
      ),
      m.computed_min
    ),
    m.priority,
    m.unit
  from avec_min m;
end;
$$;

revoke all on function public.mep_targets_internal(date, public.session_kind)
  from public, anon, authenticated;

drop function if exists public.mep_product_targets(date, public.session_kind);

create function public.mep_product_targets(d date, p_session public.session_kind)
returns table (
  product_id   uuid,
  product_name text,
  target       numeric,
  minimum      numeric,
  critical     numeric,
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

revoke all on function public.mep_product_targets(date, public.session_kind) from public, anon;
grant execute on function public.mep_product_targets(date, public.session_kind) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Un produit reporté ne bloque plus la validation
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
    and cl.deferred_at is null
    and (
      (p.in_saladbar and cl.counted_saladbar_at is null)
      or (p.in_fridge and cl.counted_fridge_at is null)
      or (not p.in_saladbar and not p.in_fridge and cl.counted_at is null)
    );
$$;

revoke all on function public.mep_count_pending(uuid) from public, anon;
grant execute on function public.mep_count_pending(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Validation : le critique passe AVANT la priorité
-- ---------------------------------------------------------------------
drop function if exists public.mep_submit_count(uuid);

create function public.mep_submit_count(p_session_id uuid)
returns table (
  product_id     uuid,
  product_name   text,
  notes          text,
  qty_to_produce numeric,
  unit           public.product_unit,
  priority       integer,
  is_critical    boolean,
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
      crit_snapshot              = t.critical,
      production_needed_snapshot = case
        -- Un produit reporté n'a PAS été mesuré : son stock est inconnu.
        -- Le traiter comme un zéro ferait produire à l'aveugle.
        when cl.deferred_at is not null then 0
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

  insert into public.production_tasks
    (session_id, product_id, qty_to_produce, priority_snapshot, is_critical)
  select p_session_id, cl.product_id, cl.production_needed_snapshot, p.priority,
         cl.qty_total < coalesce(cl.crit_snapshot, 0)
  from public.count_lines cl
  join public.products p on p.id = cl.product_id
  where cl.session_id = p_session_id
    and p.is_active
    and coalesce(cl.production_needed_snapshot, 0) > 0
  on conflict (session_id, product_id) do update
    set qty_to_produce = excluded.qty_to_produce,
        priority_snapshot = excluded.priority_snapshot,
        is_critical = excluded.is_critical;

  return query
  select pt.product_id, p.name, p.notes, pt.qty_to_produce, p.unit, pt.priority_snapshot,
         pt.is_critical, p.image_url, c.name
  from public.production_tasks pt
  join public.products p            on p.id = pt.product_id
  join public.product_categories c  on c.id = p.category_id
  join public.count_lines cl        on cl.session_id = pt.session_id
                                   and cl.product_id = pt.product_id
  where pt.session_id = p_session_id
  -- Le CRITIQUE d'abord, la priorité ensuite : un produit qui manquera
  -- pendant le service passe devant un produit plus prioritaire mais
  -- encore confortable.
  order by pt.is_critical desc,
           pt.priority_snapshot asc,
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
  is_critical    boolean,
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
         pt.priority_snapshot, pt.is_critical, pt.is_done, p.image_url, c.name
  from public.production_tasks pt
  join public.products p           on p.id = pt.product_id
  join public.product_categories c on c.id = p.category_id
  join public.count_sessions s     on s.id = pt.session_id
  where pt.session_id = p_session_id
    and (public.is_staff_lead() or s.date = current_date)
  order by pt.is_critical desc, pt.priority_snapshot asc, p.name asc;
$$;

revoke all on function public.mep_reorder_report(uuid) from public, anon;
grant execute on function public.mep_reorder_report(uuid) to authenticated;
