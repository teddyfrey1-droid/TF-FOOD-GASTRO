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
-- §5.3 / §5.4 — Cible et seuil : LE tableau de test
-- ---------------------------------------------------------------------
select pg_temp.check_equal(
  'Saumon @ CA 3 200 € -> cible 8',
  (select target from public.mep_product_targets(date '2026-08-18', 'morning') where product_name = 'Saumon'),
  8.0::numeric
);

select pg_temp.check_equal(
  'Saumon @ CA 3 200 € -> seuil 4',
  (select reorder_threshold from public.mep_product_targets(date '2026-08-18', 'morning') where product_name = 'Saumon'),
  4.0::numeric
);

-- CA 1 400 € pour le cas grenade.
insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (date '2025-08-20', 1400, false)
on conflict (date) do update set revenue_ht = 1400, is_closed_day = false;

select pg_temp.check_equal(
  'Grenade @ CA 1 400 € -> cible 2',
  (select target from public.mep_product_targets(date '2026-08-19', 'morning') where product_name = 'Grenade'),
  2.0::numeric
);

select pg_temp.check_equal(
  'Grenade @ CA 1 400 € -> seuil 1',
  (select reorder_threshold from public.mep_product_targets(date '2026-08-19', 'morning') where product_name = 'Grenade'),
  1.0::numeric
);

-- Toutes les cibles et tous les seuils tombent sur des multiples de 0,5.
do $$
declare bad int;
begin
  select count(*) into bad
  from public.mep_product_targets(date '2026-08-18', 'morning')
  where (target * 2) <> floor(target * 2) or (reorder_threshold * 2) <> floor(reorder_threshold * 2);
  if bad > 0 then
    raise exception 'ÉCHEC — % cibles/seuils hors du pas de 0,5', bad;
  end if;
  raise notice 'OK   — toutes les cibles et tous les seuils sont des multiples de 0,5';
end
$$;

-- Un seuil ne dépasse jamais la cible.
do $$
declare bad int;
begin
  select count(*) into bad
  from public.mep_product_targets(date '2026-08-18', 'morning')
  where reorder_threshold > target;
  if bad > 0 then raise exception 'ÉCHEC — % seuils dépassent leur cible', bad; end if;
  raise notice 'OK   — aucun seuil ne dépasse sa cible';
end
$$;

-- ---------------------------------------------------------------------
-- §5.5 — Décision de relance de bout en bout, via mep_submit_count
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
  v_grenade uuid;
  v_qty     numeric;
begin
  select id into v_saumon  from public.products where name = 'Saumon';
  select id into v_grenade from public.products where name = 'Grenade';

  -- Cas « stock 3 sur une cible de 8, seuil 4 » -> relancer 5.
  delete from public.count_sessions where date = current_date;
  insert into public.count_sessions (date, session, user_id)
  values (current_date, 'morning', '11111111-1111-1111-1111-111111111111')
  returning id into v_session;

  -- La prévision du jour courant doit valoir 3 200 € pour rejouer le cas.
  insert into public.revenue_history (date, revenue_ht, is_closed_day)
  values (public.mep_reference_date(current_date), 3200, false)
  on conflict (date) do update set revenue_ht = 3200, is_closed_day = false;

  insert into public.count_lines (session_id, product_id, qty_saladbar, qty_fridge)
  select v_session, p.id, 99, 0 from public.products p where p.is_active;

  -- Saumon : 2 au saladbar + 1 au frigo = 3.
  update public.count_lines set qty_saladbar = 2, qty_fridge = 1
    where session_id = v_session and product_id = v_saumon;

  perform public.mep_submit_count(v_session);

  select production_needed_snapshot into v_qty
  from public.count_lines where session_id = v_session and product_id = v_saumon;
  perform pg_temp.check_equal('Saumon stock 3 (2 saladbar + 1 frigo) -> relancer 5', v_qty, 5.0::numeric);

  -- Les produits largement au-dessus de leur seuil ne créent aucune tâche.
  perform pg_temp.check_equal(
    'Seul le saumon apparaît dans les tâches de production',
    (select count(*)::int from public.production_tasks where session_id = v_session),
    1
  );

  -- Stock exactement au seuil : aucune relance.
  update public.count_lines set qty_saladbar = 4, qty_fridge = 0
    where session_id = v_session and product_id = v_saumon;
  perform public.mep_submit_count(v_session);
  select production_needed_snapshot into v_qty
  from public.count_lines where session_id = v_session and product_id = v_saumon;
  perform pg_temp.check_equal('Saumon stock 4 = seuil -> aucune relance', v_qty, 0.0::numeric);
  perform pg_temp.check_equal(
    'Aucune tâche de production quand tout est au niveau',
    (select count(*)::int from public.production_tasks where session_id = v_session),
    0
  );

  -- Stock nul : relancer toute la cible.
  update public.count_lines set qty_saladbar = 0, qty_fridge = 0
    where session_id = v_session and product_id = v_saumon;
  perform public.mep_submit_count(v_session);
  select production_needed_snapshot into v_qty
  from public.count_lines where session_id = v_session and product_id = v_saumon;
  perform pg_temp.check_equal('Saumon stock 0 -> relancer 8', v_qty, 8.0::numeric);

  perform pg_temp.check_equal(
    'Stock 0 -> badge RUPTURE IMMINENTE',
    (select is_critical from public.mep_submit_count(v_session) where product_id = v_saumon),
    true
  );

  -- Les snapshots figent bien cible et seuil sur la ligne de comptage.
  perform pg_temp.check_equal(
    'Snapshot de cible écrit sur la ligne',
    (select target_snapshot from public.count_lines where session_id = v_session and product_id = v_saumon),
    8.0::numeric
  );
  perform pg_temp.check_equal(
    'Snapshot de seuil écrit sur la ligne',
    (select reorder_threshold_snapshot from public.count_lines where session_id = v_session and product_id = v_saumon),
    4.0::numeric
  );
end
$$;

-- ---------------------------------------------------------------------
-- Les snapshots protègent l'historique (critère d'acceptation)
-- ---------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_saumon  uuid;
  v_before  numeric;
  v_after   numeric;
begin
  select id into v_saumon from public.products where name = 'Saumon';
  select id into v_session from public.count_sessions where date = current_date limit 1;

  select target_snapshot into v_before
  from public.count_lines where session_id = v_session and product_id = v_saumon;

  -- On change le calculateur APRÈS la validation.
  update public.calculator_rules set target_qty = target_qty * 2
  where product_id = v_saumon and mode = 'bracket';

  select target_snapshot into v_after
  from public.count_lines where session_id = v_session and product_id = v_saumon;

  perform pg_temp.check_equal(
    'Modifier le calculateur ne réécrit pas l''historique',
    v_after, v_before
  );

  -- ... mais change bien la cible du jour.
  perform pg_temp.check_equal(
    'Modifier le calculateur change la cible du jour même',
    (select target from public.mep_product_targets(current_date, 'morning') where product_name = 'Saumon'),
    16.0::numeric
  );

  update public.calculator_rules set target_qty = target_qty / 2
  where product_id = v_saumon and mode = 'bracket';
end
$$;

-- ---------------------------------------------------------------------
-- Versionnage du calculateur (valid_from / valid_to)
-- ---------------------------------------------------------------------
do $$
declare v_saumon uuid;
begin
  select id into v_saumon from public.products where name = 'Saumon';

  -- Une règle expirée hier ne doit plus s'appliquer aujourd'hui.
  update public.calculator_rules set valid_to = current_date - 1 where product_id = v_saumon;
  perform pg_temp.check_equal(
    'Une règle expirée ne s''applique plus (cible ramenée au plancher)',
    (select target from public.mep_product_targets(current_date, 'morning') where product_name = 'Saumon'),
    4.0::numeric  -- floor_qty du saumon
  );
  update public.calculator_rules set valid_to = null where product_id = v_saumon;
end
$$;


-- ---------------------------------------------------------------------
-- Versionnage : deux versions ne doivent jamais s'appliquer le même jour
--
-- Reproduit ce que fait le back-office quand on modifie une cellule du
-- calculateur : la version en cours est close à hier, une nouvelle est
-- ouverte aujourd'hui.
-- ---------------------------------------------------------------------
do $$
declare
  v_saumon uuid;
  v_rule   uuid;
  v_count  int;
begin
  select id into v_saumon from public.products where name = 'Saumon';

  -- La règle qui couvre 3 520 € aujourd'hui.
  select id into v_rule
  from public.calculator_rules
  where product_id = v_saumon
    and mode = 'bracket'
    and 3520 >= coalesce(ca_min, -1)
    and 3520 <  coalesce(ca_max, 1e9)
    and valid_from <= current_date
    and (valid_to is null or valid_to >= current_date)
  limit 1;

  -- On la clôt à hier et on ouvre une nouvelle version aujourd'hui.
  update public.calculator_rules set valid_to = current_date - 1 where id = v_rule;

  insert into public.calculator_rules (product_id, mode, ca_min, ca_max, target_qty, valid_from)
  select product_id, mode, ca_min, ca_max, 10, current_date
  from public.calculator_rules where id = v_rule;

  select count(*)::int into v_count
  from public.calculator_rules
  where product_id = v_saumon
    and mode = 'bracket'
    and 3520 >= coalesce(ca_min, -1)
    and 3520 <  coalesce(ca_max, 1e9)
    and valid_from <= current_date
    and (valid_to is null or valid_to >= current_date);

  perform pg_temp.check_equal(
    'Une seule version de règle s''applique aujourd''hui', v_count, 1);

  perform pg_temp.check_equal(
    'La nouvelle version pilote la cible du jour',
    (select target from public.mep_product_targets(current_date, 'morning') where product_name = 'Saumon'),
    10.0::numeric);

  perform pg_temp.check_equal(
    'L''ancienne version reste consultable pour les dates passées',
    (select count(*)::int from public.calculator_rules
     where id = v_rule and valid_to = current_date - 1),
    1);

  -- Nettoyage : on rétablit l'état d'origine.
  delete from public.calculator_rules
  where product_id = v_saumon and valid_from = current_date and target_qty = 10;
  update public.calculator_rules set valid_to = null where id = v_rule;
end
$$;

\echo ''
\echo '===== TESTS DE CALCUL : TOUS PASSÉS ====='
