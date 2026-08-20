-- =====================================================================
-- L'historique s'ouvre aux chefs de service — sans ouvrir le CA
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les colonnes sensibles sortent de la portée d'un compte connecté
--
-- Jusqu'ici, la RLS filtrait les LIGNES mais pas les COLONNES : tout
-- compte authentifié pouvant lire une session pouvait lire son
-- `forecast_revenue_snapshot`, c'est-à-dire le chiffre d'affaires
-- prévisionnel du jour. Sans conséquence tant que seul le directeur
-- accédait à l'historique — mais on l'ouvre maintenant à l'assistant
-- manager, et la promesse du produit est que le CA ne lui parvient pas.
--
-- Idem pour les cibles et seuils figés sur chaque ligne de comptage.
--
-- Le retrait vaut pour TOUS les rôles applicatifs, directeur compris :
-- une permission qui dépend d'un rôle métier ne s'exprime pas en droits
-- de colonne. Le directeur relit ces valeurs par les fonctions ci-dessous,
-- qui portent le contrôle explicitement.
-- ---------------------------------------------------------------------
-- ⚠️ Révoquer une COLONNE reste sans effet tant que le droit existe sur la
-- TABLE : le grant de table couvre toutes ses colonnes, présentes et à
-- venir. Il faut donc retirer le droit global, puis le rendre colonne par
-- colonne — en laissant de côté celles qu'on protège.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'count_sessions'
    and column_name <> 'forecast_revenue_snapshot';

  execute 'revoke select on public.count_sessions from authenticated, anon';
  execute format('grant select (%s) on public.count_sessions to authenticated', v_cols);

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'count_lines'
    and column_name not in ('target_snapshot', 'min_snapshot', 'crit_snapshot',
                            'production_needed_snapshot');

  execute 'revoke select on public.count_lines from authenticated, anon';
  execute format('grant select (%s) on public.count_lines to authenticated', v_cols);
end
$$;

-- ---------------------------------------------------------------------
-- 2. L'historique des comptages, pour tout chef de service
--
-- Le CA n'apparaît QUE pour un directeur ou le propriétaire. Pour un
-- assistant manager la colonne vaut null — pas « zéro », qui se lirait
-- comme une journée à zéro euro.
-- ---------------------------------------------------------------------
drop function if exists public.mep_count_history(date, date);

create function public.mep_count_history(d_from date, d_to date)
returns table (
  id                uuid,
  date              date,
  session           public.session_kind,
  status            public.session_status,
  started_at        timestamptz,
  submitted_at      timestamptz,
  user_id           uuid,
  author_name       text,
  forecast_revenue  numeric,
  products_counted  integer,
  products_total    integer,
  products_deferred integer,
  tasks_total       integer,
  tasks_done        integer,
  tasks_critical    integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff_lead() then
    raise exception 'Historique réservé à l''encadrement.' using errcode = '42501';
  end if;

  if d_to < d_from or d_to - d_from > 400 then
    raise exception 'Plage de dates invalide.' using errcode = '22023';
  end if;

  return query
  select
    s.id, s.date, s.session, s.status, s.started_at, s.submitted_at, s.user_id,
    p.full_name,
    case when public.is_manager() then s.forecast_revenue_snapshot end,
    (select count(*)::int from public.count_lines cl
      where cl.session_id = s.id and cl.counted_at is not null),
    (select count(*)::int from public.count_lines cl where cl.session_id = s.id),
    (select count(*)::int from public.count_lines cl
      where cl.session_id = s.id and cl.deferred_at is not null),
    (select count(*)::int from public.production_tasks pt where pt.session_id = s.id),
    (select count(*)::int from public.production_tasks pt
      where pt.session_id = s.id and pt.is_done),
    (select count(*)::int from public.production_tasks pt
      where pt.session_id = s.id and pt.is_critical)
  from public.count_sessions s
  left join public.profiles p on p.id = s.user_id
  where s.date between d_from and d_to
  order by s.date desc, s.session asc;
end;
$$;

revoke all on function public.mep_count_history(date, date) from public, anon;
grant execute on function public.mep_count_history(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Le détail d'un comptage
--
-- Mêmes règles : quantités et motifs pour tout le monde, cibles et seuils
-- pour le seul directeur.
-- ---------------------------------------------------------------------
drop function if exists public.mep_count_detail(uuid);

create function public.mep_count_detail(p_session_id uuid)
returns table (
  product_id       uuid,
  product_name     text,
  category_name    text,
  unit             public.product_unit,
  qty_saladbar     numeric,
  qty_fridge       numeric,
  qty_total        numeric,
  counted_at       timestamptz,
  is_not_applicable boolean,
  not_applicable_reason text,
  deferred_at      timestamptz,
  deferred_reason  text,
  target           numeric,
  minimum          numeric,
  critical         numeric,
  to_produce       numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff_lead() then
    raise exception 'Historique réservé à l''encadrement.' using errcode = '42501';
  end if;

  return query
  select
    cl.product_id, p.name, c.name, p.unit,
    cl.qty_saladbar, cl.qty_fridge, cl.qty_total, cl.counted_at,
    cl.is_not_applicable, cl.not_applicable_reason,
    cl.deferred_at, cl.deferred_reason,
    case when public.is_manager() then cl.target_snapshot end,
    case when public.is_manager() then cl.min_snapshot end,
    case when public.is_manager() then cl.crit_snapshot end,
    cl.production_needed_snapshot
  from public.count_lines cl
  join public.products p           on p.id = cl.product_id
  join public.product_categories c on c.id = p.category_id
  where cl.session_id = p_session_id
  order by c.sort_order, p.sort_order, p.name;
end;
$$;

revoke all on function public.mep_count_detail(uuid) from public, anon;
grant execute on function public.mep_count_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. L'historique des RUPTURES
--
-- Combien de fois chaque produit est passé sous son seuil critique, et
-- combien de fois il est tombé à zéro. C'est la seule façon de savoir si
-- une base « VENTE POUR » est juste : trois semaines de mesures valent
-- mieux qu'une impression.
--
-- Réservé au directeur : le taux de rupture se lit avec les cibles.
-- ---------------------------------------------------------------------
drop function if exists public.mep_stockout_history(date, date);

create function public.mep_stockout_history(d_from date, d_to date)
returns table (
  product_id     uuid,
  product_name   text,
  category_name  text,
  unit           public.product_unit,
  sessions_count integer,
  critical_count integer,
  empty_count    integer,
  reorder_count  integer,
  avg_coverage   numeric,
  base_qty       numeric,
  priority       integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Réservé au directeur.' using errcode = '42501';
  end if;

  if d_to < d_from or d_to - d_from > 400 then
    raise exception 'Plage de dates invalide.' using errcode = '22023';
  end if;

  return query
  select
    p.id, p.name, c.name, p.unit,
    count(*)::int,
    -- Un comptage « critique » : le stock relevé était sous le seuil figé
    -- ce jour-là. On relit le snapshot, jamais le seuil d'aujourd'hui —
    -- sinon changer un réglage réécrirait le passé.
    count(*) filter (where cl.crit_snapshot is not null
                       and cl.qty_total < cl.crit_snapshot)::int,
    count(*) filter (where cl.qty_total = 0)::int,
    count(*) filter (where coalesce(cl.production_needed_snapshot, 0) > 0)::int,
    round(avg(case when cl.target_snapshot > 0
                   then cl.qty_total / cl.target_snapshot end), 3),
    p.base_qty,
    p.priority
  from public.count_lines cl
  join public.count_sessions s     on s.id = cl.session_id
  join public.products p           on p.id = cl.product_id
  join public.product_categories c on c.id = p.category_id
  where s.date between d_from and d_to
    and s.status = 'submitted'
    and not cl.is_not_applicable
    and cl.deferred_at is null
    and cl.counted_at is not null
  group by p.id, p.name, c.name, p.unit, p.base_qty, p.priority
  having count(*) > 0
  order by
    -- Les plus souvent en rupture d'abord : ce sont eux dont la base est
    -- probablement sous-évaluée.
    (count(*) filter (where cl.crit_snapshot is not null
                       and cl.qty_total < cl.crit_snapshot))::numeric
      / greatest(count(*), 1) desc,
    p.name;
end;
$$;

revoke all on function public.mep_stockout_history(date, date) from public, anon;
grant execute on function public.mep_stockout_history(date, date) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Observations ligne à ligne, pour la détection d'anomalies
--
-- Le tableau des anomalies compare le stock relevé à la cible du jour :
-- il lui faut donc les snapshots, qui ne sont plus lisibles en colonne.
-- Réservé au directeur, comme tout ce qui touche aux cibles.
-- ---------------------------------------------------------------------
drop function if exists public.mep_count_observations(date, date);

create function public.mep_count_observations(d_from date, d_to date)
returns table (
  date              date,
  product_name      text,
  qty_total         numeric,
  target_snapshot   numeric,
  min_snapshot      numeric,
  is_not_applicable boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Réservé au directeur.' using errcode = '42501';
  end if;

  if d_to < d_from or d_to - d_from > 400 then
    raise exception 'Plage de dates invalide.' using errcode = '22023';
  end if;

  return query
  select s.date, p.name, cl.qty_total, cl.target_snapshot, cl.min_snapshot,
         cl.is_not_applicable
  from public.count_lines cl
  join public.count_sessions s on s.id = cl.session_id
  join public.products p       on p.id = cl.product_id
  where s.date between d_from and d_to
    and cl.deferred_at is null;
end;
$$;

revoke all on function public.mep_count_observations(date, date) from public, anon;
grant execute on function public.mep_count_observations(date, date) to authenticated;
