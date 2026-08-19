-- =====================================================================
-- Tests du moteur de calcul EN BASE (§5).
--
-- Le calcul existe en deux exemplaires : TypeScript (src/lib/mep, pour le
-- simulateur du back-office) et SQL (pour la validation d'un comptage).
-- Les deux doivent donner exactement le même résultat — ces tests le
-- vérifient côté SQL avec le tableau du §5.5.
-- =====================================================================

\set ON_ERROR_STOP on
\timing off
set client_min_messages = notice;

create or replace function pg_temp.check_equal(label text, actual anyelement, expected anyelement)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC — % : attendu %, obtenu %', label, expected, actual;
  end if;
  raise notice 'OK   — % (%)', label, actual;
end;
$$;

-- ---------------------------------------------------------------------
-- §5.1 — Date de référence N-1 alignée sur le JOUR DE SEMAINE
-- ---------------------------------------------------------------------
select pg_temp.check_equal(
  'mep_reference_date garde le jour de semaine',
  extract(isodow from public.mep_reference_date(date '2026-08-18'))::int,
  extract(isodow from date '2026-08-18')::int
);

select pg_temp.check_equal(
  'mep_reference_date : mardi S34 2026 -> mardi S34 2025',
  public.mep_reference_date(date '2026-08-18'),
  date '2025-08-19'
);

-- Cas donné par le restaurant : « le 25 juin 2026 se compare au 26 juin 2025 ».
-- Deux jeudis de la semaine ISO 26. Comparer les 25 juin entre eux
-- comparerait un jeudi à un mercredi.
select pg_temp.check_equal(
  'Cas du restaurant : 25/06/2026 -> 26/06/2025',
  public.mep_reference_date(date '2026-06-25'),
  date '2025-06-26'
);

select pg_temp.check_equal(
  'mep_reference_date : semaine 53 -> semaine 52 quand N-1 n''en a que 52',
  extract(week from public.mep_reference_date(date '2026-12-31'))::int,
  52
);

-- Cohérence avec l'implémentation TypeScript sur une année entière.
do $$
declare d date := date '2026-01-01';
begin
  while d < date '2027-01-01' loop
    if extract(isodow from public.mep_reference_date(d)) <> extract(isodow from d) then
      raise exception 'ÉCHEC — jour de semaine non conservé pour %', d;
    end if;
    d := d + 1;
  end loop;
  raise notice 'OK   — jour de semaine conservé sur 365 jours';
end
$$;

-- ---------------------------------------------------------------------
-- §5.1 / §5.2 — Prévision et CA de référence
-- ---------------------------------------------------------------------
-- CA de référence N-1 calé pour que la prévision du 18/08/2026 vaille 3 200 €.
insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (date '2025-08-19', 3200, false)
on conflict (date) do update set revenue_ht = excluded.revenue_ht, is_closed_day = false;

update public.revenue_settings set growth_rate = 0, safety_margin = 0.10, afternoon_target_ratio = 1.0;

select pg_temp.check_equal(
  'CA prévisionnel du 18/08/2026',
  public.mep_forecast_revenue(date '2026-08-18'),
  3200.00::numeric
);

select pg_temp.check_equal(
  'CA de référence MATIN = prévision x (1 + marge)',
  public.mep_reference_revenue(date '2026-08-18', 'morning'),
  3520.00::numeric
);

select pg_temp.check_equal(
  'CA de référence APRÈS-MIDI identique au matin (ratio 1,0)',
  public.mep_reference_revenue(date '2026-08-18', 'afternoon'),
  3520.00::numeric
);

-- Jour de fermeture N-1 : on remonte d'une semaine.
insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (date '2025-08-12', 2000, false)
on conflict (date) do update set revenue_ht = 2000, is_closed_day = false;

update public.revenue_history set is_closed_day = true where date = date '2025-08-19';
select pg_temp.check_equal(
  'Jour N-1 fermé -> même jour de la semaine précédente',
  public.mep_forecast_revenue(date '2026-08-18'),
  2000.00::numeric
);
update public.revenue_history set is_closed_day = false where date = date '2025-08-19';

-- Coefficient manuel du jour.
insert into public.daily_forecast (date, coefficient, source)
values (date '2026-08-18', 0.5, 'auto')
on conflict (date) do update set coefficient = 0.5, source = 'auto';
select pg_temp.check_equal(
  'Coefficient manuel appliqué à la prévision',
  public.mep_forecast_revenue(date '2026-08-18'),
  1600.00::numeric
);
delete from public.daily_forecast where date = date '2026-08-18';

-- ---------------------------------------------------------------------
-- Scénario du restaurant : anticiper la production sur le CA estimé
--
-- « le 26 juin 2025 a fait 2 000 € ; avec 25 % de croissance, le 25 juin 2026
--   est estimé à 2 500 € — et le taux se change à tout moment »
-- ---------------------------------------------------------------------
insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (date '2025-06-26', 2000, false)
on conflict (date) do update set revenue_ht = 2000, is_closed_day = false;

do $$
begin
  update public.revenue_settings set growth_rate = 0;
  perform pg_temp.check_equal(
    'Sans croissance, le 25/06/2026 reprend les 2 000 € de l''an dernier',
    public.mep_forecast_revenue(date '2026-06-25'), 2000.00::numeric);

  update public.revenue_settings set growth_rate = 0.25;
  perform pg_temp.check_equal(
    'Avec +25 %, la prévision passe à 2 500 €',
    public.mep_forecast_revenue(date '2026-06-25'), 2500.00::numeric);

  -- Le taux se change à tout moment et agit immédiatement : rien n'est figé.
  update public.revenue_settings set growth_rate = 0.30;
  perform pg_temp.check_equal(
    'Passer à +30 % change la prévision dans la foulée',
    public.mep_forecast_revenue(date '2026-06-25'), 2600.00::numeric);

  -- Le coefficient du jour se cumule au taux de croissance.
  insert into public.daily_forecast (date, coefficient, source)
  values (date '2026-06-25', 0.8, 'auto')
  on conflict (date) do update set coefficient = 0.8, source = 'auto';
  perform pg_temp.check_equal(
    'Un coefficient de 0,8 s''applique par-dessus les +30 %',
    public.mep_forecast_revenue(date '2026-06-25'), 2080.00::numeric);
  delete from public.daily_forecast where date = date '2026-06-25';

  update public.revenue_settings set growth_rate = 0;
end
$$;

-- ---------------------------------------------------------------------
-- Cible et minimum — modèle « base_qty »
--
--   cible   = base × multiplicateur × (CA_ref / référence), PLAFOND à l'entier
--   minimum = cible / diviseur, PLAFOND au pas de comptage, borné par la cible
-- ---------------------------------------------------------------------

-- CA de référence calé à 4 000 € pour rejouer le tableau de vérification.
-- La marge de sécurité est à 0 : le multiplicateur de famille (x2) porte
-- déjà la sécurité.
update public.revenue_settings
set growth_rate = 0, safety_margin = 0, afternoon_target_ratio = 1.0, default_min_divisor = 2;

insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (public.mep_reference_date(current_date), 4000, false)
on conflict (date) do update set revenue_ht = 4000, is_closed_day = false;

select pg_temp.check_equal(
  'CA de référence du jour ramené à 4 000 €',
  public.mep_reference_revenue(current_date, 'morning'),
  4000.00::numeric
);

select pg_temp.check_equal(
  'Saumon (base 4,6) @ 4 000 € -> 9,2 -> cible 10',
  (select target from public.mep_product_targets(current_date, 'morning') where product_name = 'Saumon'),
  10::numeric
);

select pg_temp.check_equal(
  'Saumon -> minimum 5',
  (select minimum from public.mep_product_targets(current_date, 'morning') where product_name = 'Saumon'),
  5.0::numeric
);

select pg_temp.check_equal(
  'Thon (base 0,4) @ 4 000 € -> 0,8 -> cible 1',
  (select target from public.mep_product_targets(current_date, 'morning') where product_name = 'Thon'),
  1::numeric
);

select pg_temp.check_equal(
  'Thon -> minimum 0,5',
  (select minimum from public.mep_product_targets(current_date, 'morning') where product_name = 'Thon'),
  0.5::numeric
);

-- Contrôle du §1 à 5 000 € : Saumon 11,5 -> 12, Gyoza Poulet 24 pile.
insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (public.mep_reference_date(current_date + 1), 5000, false)
on conflict (date) do update set revenue_ht = 5000, is_closed_day = false;

select pg_temp.check_equal(
  'Saumon @ 5 000 € -> 11,5 -> cible 12',
  (select target from public.mep_product_targets(current_date + 1, 'morning') where product_name = 'Saumon'),
  12::numeric
);

select pg_temp.check_equal(
  'Gyoza Poulet (base 4,8, les_plus) @ 5 000 € -> cible 24',
  (select target from public.mep_product_targets(current_date + 1, 'morning') where product_name = 'Gyoza Poulet'),
  24::numeric
);

select pg_temp.check_equal(
  'Gyoza Poulet -> minimum 12',
  (select minimum from public.mep_product_targets(current_date + 1, 'morning') where product_name = 'Gyoza Poulet'),
  12::numeric
);

-- Toutes les cibles tombent sur des entiers, et aucun minimum ne dépasse sa cible.
do $$
declare bad int;
begin
  select count(*) into bad
  from public.mep_product_targets(current_date, 'morning')
  where target <> floor(target);
  if bad > 0 then raise exception 'ÉCHEC — % cibles non entières', bad; end if;
  raise notice 'OK   — toutes les cibles sont des entiers';

  select count(*) into bad
  from public.mep_product_targets(current_date, 'morning')
  where minimum > target;
  if bad > 0 then raise exception 'ÉCHEC — % minimums dépassent leur cible', bad; end if;
  raise notice 'OK   — aucun minimum ne dépasse sa cible';

  select count(*) into bad
  from public.mep_product_targets(current_date, 'morning')
  where (minimum * 2) <> floor(minimum * 2);
  if bad > 0 then raise exception 'ÉCHEC — % minimums hors du pas de 0,5', bad; end if;
  raise notice 'OK   — tous les minimums tombent sur un demi';
end
$$;

-- Mode manuel, réglable produit par produit.
do $$
begin
  update public.products set min_mode = 'manual', min_qty_manual = 8 where name = 'Saumon';
  perform pg_temp.check_equal(
    'Saumon en mode manuel -> minimum 8',
    (select minimum from public.mep_product_targets(current_date, 'morning') where product_name = 'Saumon'),
    8::numeric);

  -- Un minimum manuel supérieur à la cible est ramené à la cible.
  update public.products set min_qty_manual = 40 where name = 'Saumon';
  perform pg_temp.check_equal(
    'Un minimum manuel de 40 est ramené à la cible de 10',
    (select minimum from public.mep_product_targets(current_date, 'morning') where product_name = 'Saumon'),
    10::numeric);

  update public.products set min_mode = 'auto', min_qty_manual = null where name = 'Saumon';
end
$$;

-- ---------------------------------------------------------------------
-- Décision de relance — tableau de vérification du §1, de bout en bout
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'employe@heiko.test')
on conflict (id) do nothing;
update public.profiles set full_name = 'Karim (test)', role = 'employee'
  where id = '11111111-1111-1111-1111-111111111111';

do $$
declare
  v_session uuid;
  v_saumon  uuid;
  v_thon    uuid;
  v_qty     numeric;
  v_case    record;
begin
  select id into v_saumon from public.products where name = 'Saumon';
  select id into v_thon   from public.products where name = 'Thon';

  delete from public.count_sessions where date = current_date;
  insert into public.count_sessions (date, session, user_id)
  values (current_date, 'morning', '11111111-1111-1111-1111-111111111111')
  returning id into v_session;

  insert into public.count_lines (session_id, product_id, qty_saladbar, qty_fridge, counted_at)
  select v_session, p.id, 999, 0, now() from public.products p where p.is_active;

  -- Saumon : cible 10, minimum 5.
  for v_case in
    select * from (values
      (3::numeric, 7::numeric), (6, 0), (5, 0), (0, 10), (3.5, 7)
    ) as t(stock, attendu)
  loop
    update public.count_lines set qty_saladbar = v_case.stock, qty_fridge = 0
      where session_id = v_session and product_id = v_saumon;
    perform public.mep_submit_count(v_session);

    select production_needed_snapshot into v_qty
    from public.count_lines where session_id = v_session and product_id = v_saumon;

    perform pg_temp.check_equal(
      format('Saumon cible 10 minimum 5, stock %s -> %s', v_case.stock, v_case.attendu),
      v_qty, v_case.attendu);
  end loop;

  -- Thon : cible 1, minimum 0,5.
  for v_case in
    select * from (values (0::numeric, 1::numeric), (0.5, 0)) as t(stock, attendu)
  loop
    update public.count_lines set qty_saladbar = v_case.stock, qty_fridge = 0
      where session_id = v_session and product_id = v_thon;
    perform public.mep_submit_count(v_session);

    select production_needed_snapshot into v_qty
    from public.count_lines where session_id = v_session and product_id = v_thon;

    perform pg_temp.check_equal(
      format('Thon cible 1 minimum 0,5, stock %s -> %s', v_case.stock, v_case.attendu),
      v_qty, v_case.attendu);
  end loop;

  -- Saladbar + frigo s'additionnent avant comparaison au minimum.
  update public.count_lines set qty_saladbar = 3, qty_fridge = 2
    where session_id = v_session and product_id = v_saumon;
  perform public.mep_submit_count(v_session);
  select production_needed_snapshot into v_qty
  from public.count_lines where session_id = v_session and product_id = v_saumon;
  perform pg_temp.check_equal('Saumon 3 saladbar + 2 frigo = 5 = minimum -> rien', v_qty, 0::numeric);

  -- Le besoin est toujours un entier, même sur un stock en demis.
  update public.count_lines set qty_saladbar = 4.5, qty_fridge = 0
    where session_id = v_session and product_id = v_saumon;
  perform public.mep_submit_count(v_session);
  select production_needed_snapshot into v_qty
  from public.count_lines where session_id = v_session and product_id = v_saumon;
  perform pg_temp.check_equal('Saumon stock 4,5 -> PLAFOND(10 − 4,5) = 6', v_qty, 6::numeric);

  -- Les snapshots figent cible et minimum sur la ligne.
  perform pg_temp.check_equal(
    'Snapshot de cible écrit sur la ligne',
    (select target_snapshot from public.count_lines
     where session_id = v_session and product_id = v_saumon), 10::numeric);
  perform pg_temp.check_equal(
    'Snapshot de minimum écrit sur la ligne',
    (select min_snapshot from public.count_lines
     where session_id = v_session and product_id = v_saumon), 5.0::numeric);
end
$$;

-- ---------------------------------------------------------------------
-- Priorité : 1 est LE PLUS urgent, le rapport trie par ordre croissant
-- ---------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_first   text;
begin
  select id into v_session from public.count_sessions where date = current_date limit 1;

  update public.products set priority = 1 where name = 'Thon';
  update public.products set priority = 5 where name = 'Saumon';

  -- Les deux sont à zéro : c'est la priorité qui départage.
  update public.count_lines set qty_saladbar = 0, qty_fridge = 0
  where session_id = v_session
    and product_id in (select id from public.products where name in ('Saumon', 'Thon'));

  select product_name into v_first
  from public.mep_submit_count(v_session)
  where product_name in ('Saumon', 'Thon')
  limit 1;

  perform pg_temp.check_equal(
    'Le produit en priorité 1 passe avant celui en priorité 5', v_first, 'Thon');

  update public.products set priority = 3 where name in ('Saumon', 'Thon');
end
$$;

-- ---------------------------------------------------------------------
-- Les snapshots protègent l'historique
-- ---------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_saumon  uuid;
  v_before  numeric;
begin
  select id into v_saumon from public.products where name = 'Saumon';
  select id into v_session from public.count_sessions where date = current_date limit 1;

  select target_snapshot into v_before
  from public.count_lines where session_id = v_session and product_id = v_saumon;

  -- On change la base APRÈS la validation.
  update public.products set base_qty = 9.2 where id = v_saumon;

  perform pg_temp.check_equal(
    'Modifier la base ne réécrit pas l''historique',
    (select target_snapshot from public.count_lines
     where session_id = v_session and product_id = v_saumon),
    v_before);

  perform pg_temp.check_equal(
    'Modifier la base change la cible du jour même',
    (select target from public.mep_product_targets(current_date, 'morning') where product_name = 'Saumon'),
    19::numeric);  -- 9,2 x 2 x 1 = 18,4 -> 19

  update public.products set base_qty = 4.6 where id = v_saumon;
end
$$;

\echo ''
\echo '===== TESTS DE CALCUL : TOUS PASSÉS ====='
