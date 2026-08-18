-- =====================================================================
-- MEP — Moteur de calcul côté serveur (§5.8)
--
-- Ces fonctions sont SECURITY DEFINER : elles lisent le CA et le
-- calculateur pour le compte de l'appelant, mais ne renvoient à un employé
-- que { product_id, qty_to_produce, urgency_level }.
--
-- Elles reproduisent exactement la logique de src/lib/mep (§5), en
-- arithmétique `numeric` — donc sans aucune dérive flottante.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Arrondis (§5.3, §5.4, §5.5)
-- ---------------------------------------------------------------------
create or replace function public.mep_round_up_to_step(value numeric, step numeric)
returns numeric language sql immutable as $$
  select case when step is null or step <= 0 then value
              else ceil(value / step) * step end
$$;

create or replace function public.mep_round_nearest_step(value numeric, step numeric)
returns numeric language sql immutable as $$
  select case when step is null or step <= 0 then value
              else round(value / step) * step end
$$;

-- ---------------------------------------------------------------------
-- §5.1 — Date de référence N-1 : même semaine ISO, même JOUR DE SEMAINE.
-- ---------------------------------------------------------------------
create or replace function public.mep_reference_date(d date)
returns date language sql immutable as $$
  with target as (
    select
      (extract(isoyear from d))::int - 1 as y,
      (extract(week    from d))::int     as w,
      (extract(isodow  from d))::int     as dow
  ),
  bounded as (
    -- L'année N-1 peut n'avoir que 52 semaines ISO : on retombe alors sur la 52.
    select y, dow,
           least(w, (extract(week from make_date(y, 12, 28)))::int) as w
    from target
  )
  select to_date(y || '-' || w || '-' || dow, 'IYYY-IW-ID') from bounded
$$;

comment on function public.mep_reference_date(date) is
  'Même jour de semaine, même semaine ISO, année N-1 (§5.1). Jamais la même date calendaire.';

-- ---------------------------------------------------------------------
-- §5.1 — CA prévisionnel du jour.
-- Un écrasement manuel (daily_forecast.source = 'manual') gagne toujours.
-- ---------------------------------------------------------------------
create or replace function public.mep_forecast_revenue(d date)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_manual      numeric;
  v_coefficient numeric := 1;
  v_growth      numeric;
  v_ref         date;
  v_revenue     numeric;
  v_attempt     int := 0;
begin
  select forecast_revenue, coefficient
    into v_manual, v_coefficient
  from public.daily_forecast
  where date = d;

  if found and v_manual is not null
     and (select source from public.daily_forecast where date = d) = 'manual' then
    return v_manual;
  end if;

  v_coefficient := coalesce(v_coefficient, 1);
  select growth_rate into v_growth from public.revenue_settings where id;

  v_ref := public.mep_reference_date(d);

  -- Si la référence N-1 est un jour de fermeture (ou absente), on remonte au
  -- même jour de semaine de la semaine précédente.
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

-- ---------------------------------------------------------------------
-- §5.2 — CA de référence selon la session.
-- ---------------------------------------------------------------------
create or replace function public.mep_reference_revenue(d date, p_session public.session_kind)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_forecast numeric := public.mep_forecast_revenue(d);
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

-- ---------------------------------------------------------------------
-- §5.3 et §5.4 — Cible et seuil de relance, produit par produit.
--
-- SECURITY DEFINER : ne JAMAIS accorder l'exécution aux employés, la
-- fonction expose cibles et seuils. Réservée au back-office.
-- ---------------------------------------------------------------------
create or replace function public.mep_product_targets(
  d date,
  p_session public.session_kind
)
returns table (
  product_id        uuid,
  product_name      text,
  target            numeric,
  reorder_threshold numeric,
  has_rule          boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ca_ref        numeric := coalesce(public.mep_reference_revenue(d, p_session), 0);
  v_default_ratio numeric;
begin
  select default_reorder_ratio into v_default_ratio from public.revenue_settings where id;

  return query
  with raw as (
    select
      p.id,
      p.name,
      p.count_step,
      p.production_step,
      p.reorder_mode,
      p.reorder_ratio,
      p.reorder_fixed,
      p.floor_qty,
      p.ceiling_qty,
      (
        -- Mode ratio prioritaire s'il existe, sinon le palier couvrant le CA.
        select case
                 when r.mode = 'ratio' then r.qty_per_1000_eur * (v_ca_ref / 1000)
                 else r.target_qty
               end
        from public.calculator_rules r
        where r.product_id = p.id
          and r.valid_from <= d
          and (r.valid_to is null or r.valid_to >= d)
          and (
            r.mode = 'ratio'
            or ((r.ca_min is null or v_ca_ref >= r.ca_min)
                and (r.ca_max is null or v_ca_ref < r.ca_max))
          )
        order by (r.mode = 'ratio') desc, r.valid_from desc
        limit 1
      ) as raw_target
    from public.products p
    where p.is_active
  ),
  bounded as (
    select
      raw.*,
      -- §5.3 : bornage PUIS arrondi supérieur au pas de production.
      public.mep_round_up_to_step(
        greatest(
          least(
            greatest(coalesce(raw.raw_target, 0), coalesce(raw.floor_qty, 0)),
            coalesce(raw.ceiling_qty, 'infinity'::numeric)
          ),
          0
        ),
        raw.production_step
      ) as computed_target
    from raw
  )
  select
    b.id,
    b.name,
    b.computed_target,
    -- §5.4 : seuil arrondi au pas de comptage, puis borné par la cible.
    least(
      greatest(
        public.mep_round_nearest_step(
          case
            when b.reorder_mode = 'fixed' then coalesce(b.reorder_fixed, 0)
            else b.computed_target * coalesce(b.reorder_ratio, v_default_ratio)
          end,
          b.count_step
        ),
        0
      ),
      b.computed_target
    ),
    b.raw_target is not null
  from bounded b;
end;
$$;

revoke all on function public.mep_forecast_revenue(date) from public, authenticated;
revoke all on function public.mep_reference_revenue(date, public.session_kind) from public, authenticated;
revoke all on function public.mep_product_targets(date, public.session_kind) from public, authenticated;

-- ---------------------------------------------------------------------
-- §5.5 — Validation d'un comptage.
--
-- Point d'entrée unique de l'employé : il envoie l'identifiant de sa
-- session, le serveur calcule cibles et seuils, écrit les snapshots, crée
-- les tâches de production, et ne renvoie QUE ce qu'il faut relancer.
-- Aucun CA, aucun ratio, aucune cible, aucun seuil ne transite (§5.8).
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
-- Les paramètres OUT (product_id, qty_to_produce...) portent le nom de colonnes
-- réelles. Sans cette directive, `on conflict (session_id, product_id)` résout
-- product_id comme une variable PL/pgSQL et non comme la colonne.
#variable_conflict use_column
declare
  v_session public.count_sessions%rowtype;
begin
  select * into v_session from public.count_sessions where id = p_session_id;
  if not found then
    raise exception 'Session de comptage introuvable.' using errcode = 'P0002';
  end if;

  -- Un employé ne valide que sa propre session du jour.
  if not public.is_manager()
     and (v_session.user_id <> auth.uid() or v_session.date <> current_date) then
    raise exception 'Accès refusé à cette session de comptage.' using errcode = '42501';
  end if;

  -- Snapshots : figent cible, seuil et besoin au moment du comptage. Sans eux,
  -- modifier un ratio demain réécrirait l'histoire d'aujourd'hui.
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

  -- Les tâches de production sont recréées à chaque validation : une session
  -- revalidée ne doit pas laisser traîner d'anciennes lignes.
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
    -- §5.6 : badge « RUPTURE IMMINENTE »
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

grant execute on function public.mep_submit_count(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Relecture du rapport d'une session déjà validée (retour sur l'écran).
-- Même projection sans donnée sensible.
-- ---------------------------------------------------------------------
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
    and (public.is_manager() or (s.user_id = auth.uid() and s.date = current_date))
  order by pt.urgency_level_snapshot desc, p.name asc;
$$;

grant execute on function public.mep_reorder_report(uuid) to authenticated;
