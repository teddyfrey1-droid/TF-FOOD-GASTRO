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
--
-- Ces contrôles portent sur les fonctions INTERNES, qui ne font que le
-- calcul. Les fonctions publiques du même nom ne sont que des gardes de
-- rôle : elles sont vérifiées en fin de fichier, avec de vraies sessions.
-- ---------------------------------------------------------------------
-- CA de référence N-1 calé pour que la prévision du 18/08/2026 vaille 3 200 €.
insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (date '2025-08-19', 3200, false)
on conflict (date) do update set revenue_ht = excluded.revenue_ht, is_closed_day = false;

update public.revenue_settings set growth_rate = 0, safety_margin = 0.10, afternoon_target_ratio = 1.0;

select pg_temp.check_equal(
  'CA prévisionnel du 18/08/2026',
  public.mep_forecast_internal(date '2026-08-18'),
  3200.00::numeric
);

select pg_temp.check_equal(
  'CA de référence MATIN = prévision x (1 + marge)',
  public.mep_reference_internal(date '2026-08-18', 'morning'),
  3520.00::numeric
);

select pg_temp.check_equal(
  'CA de référence APRÈS-MIDI identique au matin (ratio 1,0)',
  public.mep_reference_internal(date '2026-08-18', 'afternoon'),
  3520.00::numeric
);

-- Jour de fermeture N-1 : on remonte d'une semaine.
insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (date '2025-08-12', 2000, false)
on conflict (date) do update set revenue_ht = 2000, is_closed_day = false;

update public.revenue_history set is_closed_day = true where date = date '2025-08-19';
select pg_temp.check_equal(
  'Jour N-1 fermé -> même jour de la semaine précédente',
  public.mep_forecast_internal(date '2026-08-18'),
  2000.00::numeric
);
update public.revenue_history set is_closed_day = false where date = date '2025-08-19';

-- Coefficient manuel du jour.
insert into public.daily_forecast (date, coefficient, source)
values (date '2026-08-18', 0.5, 'auto')
on conflict (date) do update set coefficient = 0.5, source = 'auto';
select pg_temp.check_equal(
  'Coefficient manuel appliqué à la prévision',
  public.mep_forecast_internal(date '2026-08-18'),
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
    public.mep_forecast_internal(date '2026-06-25'), 2000.00::numeric);

  update public.revenue_settings set growth_rate = 0.25;
  perform pg_temp.check_equal(
    'Avec +25 %, la prévision passe à 2 500 €',
    public.mep_forecast_internal(date '2026-06-25'), 2500.00::numeric);

  -- Le taux se change à tout moment et agit immédiatement : rien n'est figé.
  update public.revenue_settings set growth_rate = 0.30;
  perform pg_temp.check_equal(
    'Passer à +30 % change la prévision dans la foulée',
    public.mep_forecast_internal(date '2026-06-25'), 2600.00::numeric);

  -- Le coefficient du jour se cumule au taux de croissance.
  insert into public.daily_forecast (date, coefficient, source)
  values (date '2026-06-25', 0.8, 'auto')
  on conflict (date) do update set coefficient = 0.8, source = 'auto';
  perform pg_temp.check_equal(
    'Un coefficient de 0,8 s''applique par-dessus les +30 %',
    public.mep_forecast_internal(date '2026-06-25'), 2080.00::numeric);
  delete from public.daily_forecast where date = date '2026-06-25';

  update public.revenue_settings set growth_rate = 0;
end
$$;

-- ---------------------------------------------------------------------
-- Cible et minimum — modèle « base par tranche de 1 000 € »
--
--   cible   = base × (CA_ref / 1000), PLAFOND à l'entier
--   minimum = cible / diviseur, PLAFOND au pas de comptage, borné par la cible
-- ---------------------------------------------------------------------

-- CA de référence calé à 4 000 € pour rejouer le tableau de vérification.
-- La marge de sécurité est à 0 : la sécurité est déjà portée par les bases
-- de la mise en place, qui couvrent deux services.
update public.revenue_settings
set growth_rate = 0, safety_margin = 0, afternoon_target_ratio = 1.0, default_min_divisor = 2;

insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (public.mep_reference_date(current_date), 4000, false)
on conflict (date) do update set revenue_ht = 4000, is_closed_day = false;

select pg_temp.check_equal(
  'CA de référence du jour ramené à 4 000 €',
  public.mep_reference_internal(current_date, 'morning'),
  4000.00::numeric
);

select pg_temp.check_equal(
  'Saumon (base 2,3) @ 4 000 € -> 9,2 -> cible 10',
  (select target from public.mep_targets_internal(current_date, 'morning') where product_name = 'Saumon'),
  10::numeric
);

select pg_temp.check_equal(
  'Saumon -> minimum 5',
  (select minimum from public.mep_targets_internal(current_date, 'morning') where product_name = 'Saumon'),
  5.0::numeric
);

select pg_temp.check_equal(
  'Thon (base 0,2) @ 4 000 € -> 0,8 -> cible 1',
  (select target from public.mep_targets_internal(current_date, 'morning') where product_name = 'Thon'),
  1::numeric
);

-- Le tableau du cahier des charges donnait 0,5. Le comptage se fait
-- désormais à l'unité entière : 0,5 remonte à 1, puis se borne à la cible.
select pg_temp.check_equal(
  'Thon -> minimum 1 (0,5 remonté au pas entier, borné par la cible)',
  (select minimum from public.mep_targets_internal(current_date, 'morning') where product_name = 'Thon'),
  1::numeric
);

-- Contrôle du §1 à 5 000 € : Saumon 11,5 -> 12, Gyoza Poulet 24 pile.
insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (public.mep_reference_date(current_date + 1), 5000, false)
on conflict (date) do update set revenue_ht = 5000, is_closed_day = false;

select pg_temp.check_equal(
  'Saumon @ 5 000 € -> 11,5 -> cible 12',
  (select target from public.mep_targets_internal(current_date + 1, 'morning') where product_name = 'Saumon'),
  12::numeric
);

select pg_temp.check_equal(
  'Gyoza Poulet (base 4,8) @ 5 000 € -> cible 24',
  (select target from public.mep_targets_internal(current_date + 1, 'morning') where product_name = 'Gyoza Poulet'),
  24::numeric
);

select pg_temp.check_equal(
  'Gyoza Poulet -> minimum 12',
  (select minimum from public.mep_targets_internal(current_date + 1, 'morning') where product_name = 'Gyoza Poulet'),
  12::numeric
);

-- ---------------------------------------------------------------------
-- La tranche de 1 000 €, telle qu'elle a été demandée
--
-- « 4 puddings par tranche de 1 000 €, donc 6 puddings à 1 500 € ». C'est
-- l'exemple qui définit le modèle : s'il tombe, plus rien ne veut dire ce
-- que l'écran Produits annonce.
--
-- Le second contrôle est le garde-fou de la migration : la famille ne doit
-- plus peser sur la cible. Deux produits de familles différentes avec la
-- même base doivent sortir la même cible — c'était faux avant, la mise en
-- place étant exprimée pour 2 000 € et les plus pour 1 000 €.
-- ---------------------------------------------------------------------
do $$
declare
  v_cat_mep  uuid;
  v_cat_plus uuid;
begin
  insert into public.revenue_history (date, revenue_ht, is_closed_day)
  values (public.mep_reference_date(current_date + 2), 1500, false)
  on conflict (date) do update set revenue_ht = 1500, is_closed_day = false;

  select id into v_cat_mep  from public.product_categories where name = 'Protéines';
  select id into v_cat_plus from public.product_categories where name = 'Desserts';

  insert into public.products (name, category_id, family, unit, base_qty, count_step,
                               min_mode, min_divisor, priority, in_saladbar, in_fridge)
  values
    ('ZZ Pudding tranche', v_cat_plus, 'les_plus',      'piece',  4, 1, 'auto', 2, 3, true, false),
    ('ZZ Témoin mep',      v_cat_mep,  'mise_en_place', 'gastro', 4, 1, 'auto', 2, 3, true, true);

  perform pg_temp.check_equal(
    '4 par tranche de 1 000 € @ 1 500 € -> cible 6',
    (select target from public.mep_targets_internal(current_date + 2, 'morning')
     where product_name = 'ZZ Pudding tranche'),
    6::numeric);

  perform pg_temp.check_equal(
    'La famille n''entre plus dans le calcul : même base, même cible',
    (select target from public.mep_targets_internal(current_date + 2, 'morning')
     where product_name = 'ZZ Témoin mep'),
    6::numeric);

  delete from public.products where name in ('ZZ Pudding tranche', 'ZZ Témoin mep');
end
$$;

-- Toutes les cibles tombent sur des entiers, et aucun minimum ne dépasse sa cible.
do $$
declare bad int;
begin
  select count(*) into bad
  from public.mep_targets_internal(current_date, 'morning')
  where target <> floor(target);
  if bad > 0 then raise exception 'ÉCHEC — % cibles non entières', bad; end if;
  raise notice 'OK   — toutes les cibles sont des entiers';

  select count(*) into bad
  from public.mep_targets_internal(current_date, 'morning')
  where minimum > target;
  if bad > 0 then raise exception 'ÉCHEC — % minimums dépassent leur cible', bad; end if;
  raise notice 'OK   — aucun minimum ne dépasse sa cible';

  select count(*) into bad
  from public.mep_targets_internal(current_date, 'morning')
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
    (select minimum from public.mep_targets_internal(current_date, 'morning') where product_name = 'Saumon'),
    8::numeric);

  -- Un minimum manuel supérieur à la cible est ramené à la cible.
  update public.products set min_qty_manual = 40 where name = 'Saumon';
  perform pg_temp.check_equal(
    'Un minimum manuel de 40 est ramené à la cible de 10',
    (select minimum from public.mep_targets_internal(current_date, 'morning') where product_name = 'Saumon'),
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
update public.profiles set full_name = 'Karim (test)', role = 'employee', is_active = true
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

  -- Les deux zones sont marquées relevées, comme le ferait un vrai
  -- comptage : depuis que la validation le vérifie côté serveur, une ligne
  -- relevée d'un seul côté bloque la session — et c'est voulu.
  insert into public.count_lines (
    session_id, product_id, qty_saladbar, qty_fridge,
    counted_at, counted_saladbar_at, counted_fridge_at
  )
  select v_session, p.id, 999, 0, now(), now(), now()
  from public.products p where p.is_active;

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

  -- Thon : cible 1, minimum 1 (voir plus haut).
  for v_case in
    select * from (values (0::numeric, 1::numeric), (1, 0)) as t(stock, attendu)
  loop
    update public.count_lines set qty_saladbar = v_case.stock, qty_fridge = 0
      where session_id = v_session and product_id = v_thon;
    perform public.mep_submit_count(v_session);

    select production_needed_snapshot into v_qty
    from public.count_lines where session_id = v_session and product_id = v_thon;

    perform pg_temp.check_equal(
      format('Thon cible 1 minimum 1, stock %s -> %s', v_case.stock, v_case.attendu),
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
  update public.products set base_qty = 4.6 where id = v_saumon;

  perform pg_temp.check_equal(
    'Modifier la base ne réécrit pas l''historique',
    (select target_snapshot from public.count_lines
     where session_id = v_session and product_id = v_saumon),
    v_before);

  perform pg_temp.check_equal(
    'Modifier la base change la cible du jour même',
    (select target from public.mep_targets_internal(current_date, 'morning') where product_name = 'Saumon'),
    19::numeric);  -- 4,6 x (4 000 / 1 000) = 18,4 -> 19

  update public.products set base_qty = 2.3 where id = v_saumon;
end
$$;

-- ---------------------------------------------------------------------
-- La garde de rôle des fonctions publiques de CA
--
-- RÉGRESSION VÉCUE : en bouchant la faille d'`anon`, le droit d'exécution
-- a été retiré à `authenticated` — donc aussi au DIRECTEUR. Le back-office
-- recevait « permission denied », l'affichait comme un null, et montrait
-- « — » partout. Les tests de sécurité vérifiaient bien que l'employé
-- n'obtenait RIEN ; aucun ne vérifiait que le directeur obtenait QUELQUE
-- CHOSE. Un accès refusé et un accès cassé se ressemblent trop pour
-- n'en tester qu'une moitié.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('22222222-2222-2222-2222-222222222222', 'directrice-calcul@heiko.test')
on conflict (id) do nothing;
update public.profiles set full_name = 'Directrice (test)', role = 'manager', is_active = true
  where id = '22222222-2222-2222-2222-222222222222';

insert into public.revenue_history (date, revenue_ht, is_closed_day)
values (public.mep_reference_date(current_date), 4000, false)
on conflict (date) do update set revenue_ht = 4000, is_closed_day = false;

create or replace function pg_temp.check_not_null(label text, actual anyelement)
returns void language plpgsql as $$
begin
  if actual is null then
    raise exception 'ÉCHEC — % : null, alors qu''une valeur était attendue', label;
  end if;
  raise notice 'OK   — % (%)', label, actual;
end;
$$;

create or replace function pg_temp.check_denied(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ÉCHEC — % : la requête a réussi alors qu''elle devait être refusée', label;
exception
  when insufficient_privilege then
    raise notice 'OK   — % (refusé)', label;
end;
$$;

-- --- Le directeur, lui, DOIT obtenir un chiffre.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select pg_temp.check_not_null(
  'Le directeur obtient le CA prévisionnel',
  public.mep_forecast_revenue(current_date));

select pg_temp.check_not_null(
  'Le directeur obtient le CA de référence',
  public.mep_reference_revenue(current_date, 'morning'));

select pg_temp.check_not_null(
  'Le directeur obtient les cibles',
  (select count(*) from public.mep_product_targets(current_date, 'morning')));

select pg_temp.check_not_null(
  'Le directeur obtient un mois de prévisions en un appel',
  (select count(*) from public.mep_forecast_range(current_date, current_date + 30)));

select pg_temp.check_equal(
  'La plage couvre bien chaque jour demandé',
  (select count(*)::int from public.mep_forecast_range(current_date, current_date + 30)),
  31);

reset role;
reset "request.jwt.claim.sub";

-- --- L'employé, lui, reste dehors.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select pg_temp.check_denied(
  'CA prévisionnel refusé à l''employé',
  'select public.mep_forecast_revenue(current_date)');
select pg_temp.check_denied(
  'CA de référence refusé à l''employé',
  'select public.mep_reference_revenue(current_date, ''morning'')');
select pg_temp.check_denied(
  'Cibles refusées à l''employé',
  'select * from public.mep_product_targets(current_date, ''morning'')');
select pg_temp.check_denied(
  'Plage de prévisions refusée à l''employé',
  'select * from public.mep_forecast_range(current_date, current_date + 7)');
select pg_temp.check_denied(
  'Les fonctions internes ne sont appelables par personne',
  'select public.mep_forecast_internal(current_date)');

reset role;
reset "request.jwt.claim.sub";

-- ---------------------------------------------------------------------
-- Le seuil CRITIQUE passe devant la PRIORITÉ
--
-- Cas donné par le restaurant, reproduit à l'identique :
--   Edamame     — priorité 3, seuil critique 3, stock 2  -> CRITIQUE
--   Poulet Mayo — priorité 1, minimum 2,        stock 1  -> à relancer
--
-- Le Poulet Mayo est « normalement » plus urgent : sa priorité vaut 1.
-- Mais l'Edamame est sous son seuil critique, donc il manquera PENDANT le
-- service. C'est lui qui doit arriver en tête, en rouge.
-- ---------------------------------------------------------------------
do $$
declare
  v_session  uuid;
  v_edamame  uuid;
  v_poulet   uuid;
  v_premier  text;
  v_crit_eda boolean;
begin
  select id into v_edamame from public.products where name = 'Edamame';
  select id into v_poulet  from public.products where name = 'Poulet Mayo';

  -- Seuils posés à la main : le test doit tenir quel que soit le CA du jour.
  update public.products
  set priority = 3, min_mode = 'manual', min_qty_manual = 6,
      crit_mode = 'manual', crit_qty_manual = 3, floor_qty = 12
  where id = v_edamame;

  update public.products
  set priority = 1, min_mode = 'manual', min_qty_manual = 2,
      crit_mode = 'manual', crit_qty_manual = 0, floor_qty = 8
  where id = v_poulet;

  delete from public.count_sessions where date = current_date;
  insert into public.count_sessions (date, session, user_id)
  values (current_date, 'morning', '11111111-1111-1111-1111-111111111111')
  returning id into v_session;

  insert into public.count_lines (
    session_id, product_id, qty_saladbar, qty_fridge,
    counted_at, counted_saladbar_at, counted_fridge_at
  )
  select v_session, p.id, 999, 0, now(), now(), now()
  from public.products p where p.is_active;

  update public.count_lines set qty_saladbar = 2, qty_fridge = 0
    where session_id = v_session and product_id = v_edamame;
  update public.count_lines set qty_saladbar = 1, qty_fridge = 0
    where session_id = v_session and product_id = v_poulet;

  perform public.mep_submit_count(v_session);

  select product_name, is_critical into v_premier, v_crit_eda
  from public.mep_submit_count(v_session) limit 1;

  perform pg_temp.check_equal(
    'L''Edamame critique passe devant le Poulet Mayo prioritaire',
    v_premier, 'Edamame');

  perform pg_temp.check_equal(
    'Et il est marqué critique', v_crit_eda, true);

  perform pg_temp.check_equal(
    'Le Poulet Mayo, lui, n''est pas critique',
    (select is_critical from public.mep_submit_count(v_session)
     where product_name = 'Poulet Mayo'),
    false);

  -- Une fois l'Edamame remonté au-dessus de son critique, l'ordre normal
  -- reprend : la priorité redevient le premier critère.
  update public.count_lines set qty_saladbar = 5
    where session_id = v_session and product_id = v_edamame;
  perform public.mep_submit_count(v_session);

  select product_name into v_premier
  from public.mep_submit_count(v_session) limit 1;

  perform pg_temp.check_equal(
    'Hors du critique, la priorité reprend la main',
    v_premier, 'Poulet Mayo');

  -- Remise en état pour les contrôles suivants.
  update public.products
  set priority = 3, min_mode = 'auto', min_qty_manual = null,
      crit_mode = 'auto', crit_qty_manual = null, floor_qty = null
  where id in (v_edamame, v_poulet);
end
$$;

-- ---------------------------------------------------------------------
-- Le critique ne dépasse JAMAIS le minimum
--
-- Sinon un produit serait « critique » avant d'être seulement à relancer,
-- et le rapport afficherait du rouge sur des bacs encore pleins.
-- ---------------------------------------------------------------------
do $$
declare v_saumon uuid;
begin
  select id into v_saumon from public.products where name = 'Saumon';

  update public.products
  set min_mode = 'manual', min_qty_manual = 2,
      crit_mode = 'manual', crit_qty_manual = 99
  where id = v_saumon;

  perform pg_temp.check_equal(
    'Un critique démesuré est ramené au minimum',
    (select critical from public.mep_targets_internal(current_date, 'morning')
     where product_name = 'Saumon'),
    2::numeric);

  update public.products
  set min_mode = 'auto', min_qty_manual = null,
      crit_mode = 'auto', crit_qty_manual = null
  where id = v_saumon;
end
$$;

-- ---------------------------------------------------------------------
-- Un produit REPORTÉ ne bloque pas et n'entre pas au rapport
--
-- Reporté n'est pas « absent » : on ne sait RIEN de son stock. Le traiter
-- comme un zéro ferait produire à l'aveugle une cible entière.
-- ---------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_melon   uuid;
begin
  select id into v_melon from public.products where name = 'Melon';

  delete from public.count_sessions where date = current_date;
  insert into public.count_sessions (date, session, user_id)
  values (current_date, 'morning', '11111111-1111-1111-1111-111111111111')
  returning id into v_session;

  insert into public.count_lines (
    session_id, product_id, qty_saladbar, qty_fridge,
    counted_at, counted_saladbar_at, counted_fridge_at
  )
  select v_session, p.id, 999, 0, now(), now(), now()
  from public.products p where p.is_active;

  -- Le melon n'a pas pu être compté.
  update public.count_lines
  set qty_saladbar = 0, qty_fridge = 0,
      counted_at = null, counted_saladbar_at = null, counted_fridge_at = null
  where session_id = v_session and product_id = v_melon;

  perform pg_temp.check_equal(
    'Non compté, il bloque la validation',
    public.mep_count_pending(v_session), 1);

  update public.count_lines
  set deferred_at = now(), deferred_reason = 'Bac au passe, à recompter'
  where session_id = v_session and product_id = v_melon;

  perform pg_temp.check_equal(
    'Reporté, il ne bloque plus',
    public.mep_count_pending(v_session), 0);

  perform public.mep_submit_count(v_session);

  perform pg_temp.check_equal(
    'Reporté, il n''entre pas au rapport de production',
    (select count(*)::int from public.production_tasks
     where session_id = v_session and product_id = v_melon),
    0);
end
$$;

\echo ''
\echo '===== TESTS DE CALCUL : TOUS PASSÉS ====='
