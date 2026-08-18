-- =====================================================================
-- Tests du parcours de comptage (§6)
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.check_equal(label text, actual anyelement, expected anyelement)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC — % : attendu %, obtenu %', label, expected, actual;
  end if;
  raise notice 'OK   — %', label;
end;
$$;

create or replace function pg_temp.check_denied(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ÉCHEC — % : la requête a réussi alors qu''elle devait être refusée', label;
exception
  -- generated_always : tentative d'écriture sur une colonne calculée (qty_total).
  when insufficient_privilege or undefined_table or undefined_column
     or check_violation or generated_always then
    raise notice 'OK   — % (refusé : %)', label, sqlerrm;
end;
$$;

/**
 * Vérifie qu'une écriture reste SANS EFFET : soit refusée, soit filtrée par la
 * RLS et donc appliquée à zéro ligne.
 */
create or replace function pg_temp.check_no_effect(label text, stmt text)
returns void language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'ÉCHEC — % : % ligne(s) modifiée(s), 0 attendue(s)', label, n;
  end if;
  raise notice 'OK   — % (0 ligne modifiée)', label;
exception
  when insufficient_privilege or undefined_table or undefined_column
     or check_violation or generated_always then
    raise notice 'OK   — % (refusé)', label;
end;
$$;

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-00000000000e', 'comptage@heiko.test')
on conflict (id) do nothing;
update public.profiles set full_name = 'Karim', role = 'employee'
  where id = 'b0000000-0000-0000-0000-00000000000e';

delete from public.count_sessions where date = current_date;

set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000e';

-- ---------------------------------------------------------------------
-- Ouverture de session
-- ---------------------------------------------------------------------
do $$
declare
  v_first  uuid;
  v_second uuid;
  v_actives int;
begin
  v_first := public.mep_open_count_session('morning', '{"ua":"test"}'::jsonb);
  perform pg_temp.check_equal('Ouvrir un comptage renvoie une session', v_first is not null, true);

  select count(*)::int into v_actives from public.products_for_count;
  perform pg_temp.check_equal(
    'Une ligne vide est créée par produit actif',
    (select count(*)::int from public.count_lines where session_id = v_first),
    v_actives);

  perform pg_temp.check_equal(
    'Aucune ligne n''est marquée comptée à l''ouverture',
    (select count(*)::int from public.count_lines where session_id = v_first and counted_at is not null),
    0);

  -- Réentrance : rouvrir ne duplique rien et rend la même session.
  v_second := public.mep_open_count_session('morning');
  perform pg_temp.check_equal('Rouvrir rend la même session', v_second, v_first);
  perform pg_temp.check_equal(
    'Rouvrir ne duplique aucune ligne',
    (select count(*)::int from public.count_lines where session_id = v_first),
    v_actives);

  -- Matin et après-midi sont deux sessions distinctes.
  perform pg_temp.check_equal(
    'L''après-midi ouvre une session différente',
    public.mep_open_count_session('afternoon') <> v_first,
    true);
end
$$;

-- ---------------------------------------------------------------------
-- Saisie : l'employé ne renseigne QUE ce qu'il a compté
-- ---------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_saumon  uuid;
begin
  select id into v_session from public.count_sessions
  where date = current_date and session = 'morning';
  select id into v_saumon from public.products_for_count where name = 'Saumon';

  update public.count_lines
  set qty_saladbar = 2, qty_fridge = 1, counted_at = now()
  where session_id = v_session and product_id = v_saumon;

  perform pg_temp.check_equal(
    'Le total est calculé par la base, pas par le téléphone',
    (select qty_total from public.count_lines where session_id = v_session and product_id = v_saumon),
    3.000::numeric);

  perform pg_temp.check_equal(
    'La progression compte une ligne renseignée',
    (select count(*)::int from public.count_lines where session_id = v_session and counted_at is not null),
    1);

  -- Un produit compté à 0 est bien « renseigné », pas « oublié ».
  update public.count_lines
  set qty_saladbar = 0, qty_fridge = 0, counted_at = now()
  where session_id = v_session
    and product_id = (select id from public.products_for_count where name = 'Grenade');

  perform pg_temp.check_equal(
    'Compté à 0 compte comme renseigné',
    (select count(*)::int from public.count_lines where session_id = v_session and counted_at is not null),
    2);
end
$$;

select pg_temp.check_denied('Écrire soi-même le total est refusé',
  'update public.count_lines set qty_total = 99
   where session_id = (select id from public.count_sessions where date = current_date and session = ''morning'')');

select pg_temp.check_denied('Une quantité négative est refusée',
  'update public.count_lines set qty_saladbar = -1
   where session_id = (select id from public.count_sessions where date = current_date and session = ''morning'')');

-- ---------------------------------------------------------------------
-- Produit non applicable : tracé avec son motif
-- ---------------------------------------------------------------------
select pg_temp.check_denied('« Non applicable » sans motif est refusé',
  'update public.count_lines set is_not_applicable = true, counted_at = now()
   where session_id = (select id from public.count_sessions where date = current_date and session = ''morning'')
     and product_id = (select id from public.products_for_count where name = ''Wakamé'')');

do $$
declare v_session uuid;
begin
  select id into v_session from public.count_sessions
  where date = current_date and session = 'morning';

  update public.count_lines
  set is_not_applicable = true, not_applicable_reason = 'Produit non reçu ce matin', counted_at = now()
  where session_id = v_session
    and product_id = (select id from public.products_for_count where name = 'Wakamé');

  perform pg_temp.check_equal(
    '« Non applicable » avec motif est accepté',
    (select not_applicable_reason from public.count_lines
     where session_id = v_session
       and product_id = (select id from public.products_for_count where name = 'Wakamé')),
    'Produit non reçu ce matin');
end
$$;

-- ---------------------------------------------------------------------
-- Validation : un produit non applicable ne génère jamais de relance
-- ---------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_wakame  uuid;
begin
  select id into v_session from public.count_sessions
  where date = current_date and session = 'morning';
  select id into v_wakame from public.products_for_count where name = 'Wakamé';

  perform public.mep_submit_count(v_session);

  perform pg_temp.check_equal(
    'Un produit non applicable ne crée pas de tâche',
    (select count(*)::int from public.production_tasks
     where session_id = v_session and product_id = v_wakame),
    0);

  perform pg_temp.check_equal(
    'La session passe à l''état validé',
    (select status::text from public.count_sessions where id = v_session),
    'submitted');
end
$$;

-- Un comptage validé n'est plus modifiable par l'employé (il devient historique).
select pg_temp.check_no_effect('Modifier un comptage déjà validé reste sans effet',
  'update public.count_lines set qty_saladbar = 99
   where session_id = (select id from public.count_sessions where date = current_date and session = ''morning'')
     and product_id = (select id from public.products_for_count where name = ''Saumon'')');

-- La valeur d'origine est intacte : la RLS a bien filtré, elle n'a pas laissé
-- passer une écriture silencieuse.
select pg_temp.check_equal('Le comptage validé a conservé sa valeur',
  (select qty_saladbar from public.count_lines
   where session_id = (select id from public.count_sessions where date = current_date and session = 'morning')
     and product_id = (select id from public.products_for_count where name = 'Saumon')),
  2.000::numeric);

-- ---------------------------------------------------------------------
-- Travail d'équipe : un collègue reprend le comptage du jour
--
-- Il n'existe qu'UNE session par (date, moment). Le second employé de la
-- journée doit pouvoir compter, et l'accueil doit afficher qui a fait quoi.
-- ---------------------------------------------------------------------
reset role;
reset "request.jwt.claim.sub";

insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-00000000000f', 'collegue@heiko.test')
on conflict (id) do nothing;
update public.profiles set full_name = 'Sofia', role = 'employee'
  where id = 'b0000000-0000-0000-0000-00000000000f';

set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000f';

do $$
declare
  v_session uuid;
  v_saumon  uuid;
begin
  -- L'après-midi a été ouvert par Karim et n'est pas encore validé.
  select id into v_session from public.count_sessions
  where date = current_date and session = 'afternoon';
  select id into v_saumon from public.products_for_count where name = 'Saumon';

  perform pg_temp.check_equal(
    'Un collègue voit la session du jour ouverte par un autre',
    (select count(*)::int from public.count_sessions where id = v_session), 1);

  perform pg_temp.check_equal(
    'Un collègue voit qui a ouvert la session',
    (select count(*)::int from public.count_sessions s
     join public.team_members m on m.id = s.user_id
     where s.id = v_session and m.full_name = 'Karim'), 1);

  perform pg_temp.check_equal(
    'La vue d''équipe n''expose pas les rôles',
    (select count(*)::int from information_schema.columns
     where table_schema = 'public' and table_name = 'team_members'
       and column_name in ('role', 'is_active')), 0);

  update public.count_lines
  set qty_saladbar = 1.5, qty_fridge = 0, counted_at = now()
  where session_id = v_session and product_id = v_saumon;

  perform pg_temp.check_equal(
    'Un collègue peut contribuer au comptage du jour',
    (select qty_total from public.count_lines
     where session_id = v_session and product_id = v_saumon),
    1.500::numeric);
end
$$;

-- Ce qui reste interdit, malgré l'élargissement.
select pg_temp.check_no_effect('Le comptage d''hier reste hors d''atteinte',
  'update public.count_lines set qty_saladbar = 99
   where session_id in (select id from public.count_sessions where date < current_date)');

select pg_temp.check_equal('Le CA reste invisible pour ce collègue',
  (select count(*)::int from public.revenue_history), 0);
select pg_temp.check_equal('Le calculateur reste invisible pour ce collègue',
  (select count(*)::int from public.calculator_rules), 0);
select pg_temp.check_equal('Les seuils restent invisibles pour ce collègue',
  (select count(*)::int from public.products), 0);

reset role;
reset "request.jwt.claim.sub";

\echo ''
\echo '===== TESTS DE COMPTAGE : TOUS PASSÉS ====='
