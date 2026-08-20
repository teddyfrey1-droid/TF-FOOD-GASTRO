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
update public.profiles set full_name = 'Karim', role = 'employee', is_active = true
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
    and product_id = (select id from public.products_for_count where name = 'Avocat');

  perform pg_temp.check_equal(
    'Compté à 0 compte comme renseigné',
    (select count(*)::int from public.count_lines where session_id = v_session and counted_at is not null),
    2);
end
$$;

-- ---------------------------------------------------------------------
-- L'ordre EXACT que l'écran de comptage envoie
--
-- Ce test ne vérifie pas une règle métier : il rejoue mot pour mot les
-- colonnes que `saveCountLine` écrit. Une colonne ajoutée au schéma sans
-- son GRANT passait inaperçue ici — les tests écrivaient un sous-ensemble
-- plus étroit que l'application — et l'écran renvoyait alors « permission
-- denied for table count_lines » à chaque saisie. Toute nouvelle colonne
-- écrite par le téléphone doit être ajoutée à cet ordre.
-- ---------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_produit uuid;
  v_touchees int;
begin
  select id into v_session from public.count_sessions
  where date = current_date and session = 'morning';
  select id into v_produit from public.products_for_count where name = 'Saumon';

  update public.count_lines
  set qty_saladbar          = 2,
      qty_fridge            = 1,
      is_not_applicable     = false,
      not_applicable_reason = null,
      counted_at            = now(),
      counted_saladbar_at   = now(),
      counted_fridge_at     = now(),
      deferred_at           = null,
      deferred_reason       = null
  where session_id = v_session and product_id = v_produit;

  get diagnostics v_touchees = row_count;

  perform pg_temp.check_equal(
    'La saisie de l''écran passe en entier, colonne pour colonne',
    v_touchees, 1);
end
$$;

-- Reporter un produit s'écrit depuis le téléphone, motif compris.
do $$
declare
  v_session uuid;
  v_produit uuid;
begin
  select id into v_session from public.count_sessions
  where date = current_date and session = 'morning';
  select id into v_produit from public.products_for_count where name = 'Avocat';

  update public.count_lines
  set qty_saladbar = 0, qty_fridge = 0, counted_at = now(),
      counted_saladbar_at = now(), counted_fridge_at = now(),
      deferred_at = now(), deferred_reason = 'Livraison en retard'
  where session_id = v_session and product_id = v_produit;

  perform pg_temp.check_equal(
    'Le motif du report est bien enregistré',
    (select deferred_reason from public.count_lines
     where session_id = v_session and product_id = v_produit),
    'Livraison en retard');

  -- On repart d'une ligne non reportée : la suite du fichier compte les
  -- lignes renseignées et un report fausserait ses totaux.
  update public.count_lines
  set deferred_at = null, deferred_reason = null
  where session_id = v_session and product_id = v_produit;
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
     and product_id = (select id from public.products_for_count where name = ''Épinard'')');

do $$
declare v_session uuid;
begin
  select id into v_session from public.count_sessions
  where date = current_date and session = 'morning';

  update public.count_lines
  set is_not_applicable = true, not_applicable_reason = 'Produit non reçu ce matin', counted_at = now()
  where session_id = v_session
    and product_id = (select id from public.products_for_count where name = 'Épinard');

  perform pg_temp.check_equal(
    '« Non applicable » avec motif est accepté',
    (select not_applicable_reason from public.count_lines
     where session_id = v_session
       and product_id = (select id from public.products_for_count where name = 'Épinard')),
    'Produit non reçu ce matin');
end
$$;

-- ---------------------------------------------------------------------
-- Validation : un produit non applicable ne génère jamais de relance
-- ---------------------------------------------------------------------
do $$
declare
  v_session uuid;
  v_epinard  uuid;
begin
  select id into v_session from public.count_sessions
  where date = current_date and session = 'morning';
  select id into v_epinard from public.products_for_count where name = 'Épinard';

  -- Le comptage doit être COMPLET, zone par zone : depuis que le serveur
  -- le vérifie, valider une session à moitié relevée est refusé.
  perform pg_temp.check_equal(
    'Une session incomplète est refusée',
    public.mep_count_pending(v_session) > 0,
    true);

  update public.count_lines
  set counted_at = coalesce(counted_at, now()),
      counted_saladbar_at = coalesce(counted_saladbar_at, now()),
      counted_fridge_at = coalesce(counted_fridge_at, now())
  where session_id = v_session;

  perform pg_temp.check_equal(
    'Une fois les deux zones relevées, plus rien ne manque',
    public.mep_count_pending(v_session),
    0);

  perform public.mep_submit_count(v_session);

  perform pg_temp.check_equal(
    'Un produit non applicable ne crée pas de tâche',
    (select count(*)::int from public.production_tasks
     where session_id = v_session and product_id = v_epinard),
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
update public.profiles set full_name = 'Sofia', role = 'employee', is_active = true
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
select pg_temp.check_equal('Les réglages de famille restent invisibles pour ce collègue',
  (select count(*)::int from public.product_family_settings), 0);
select pg_temp.check_equal('Les bases et minimums restent invisibles pour ce collègue',
  (select count(*)::int from public.products), 0);

reset role;
reset "request.jwt.claim.sub";


-- ---------------------------------------------------------------------
-- Une saisie sur un comptage validé ne doit pas passer inaperçue
--
-- L'application détecte le cas au nombre de lignes touchées : si la RLS
-- filtre tout, elle prévient l'employé au lieu de le laisser compter dans
-- le vide. Ce test verrouille la prémisse : zéro ligne touchée.
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000f';

do $$
declare
  v_session uuid;
  v_saumon  uuid;
  v_touched int;
begin
  select id into v_session from public.count_sessions
  where date = current_date and session = 'morning';   -- déjà validée plus haut
  select id into v_saumon from public.products_for_count where name = 'Saumon';

  update public.count_lines
  set qty_saladbar = 42, counted_at = now()
  where session_id = v_session and product_id = v_saumon;

  get diagnostics v_touched = row_count;

  perform pg_temp.check_equal(
    'Saisir sur un comptage validé ne touche aucune ligne', v_touched, 0);
end
$$;

reset role;
reset "request.jwt.claim.sub";

-- ---------------------------------------------------------------------
-- Un produit retiré du catalogue ne doit pas bloquer la journée
--
-- BUG VÉCU : l'ouverture d'un comptage crée une ligne par produit ACTIF et
-- rattrape les ajouts, mais rien ne retirait la ligne d'un produit RETIRÉ.
-- L'écran ne l'affiche plus — il ne montre que les produits actifs — donc
-- l'employé comptait tout ce qu'il voyait, et la validation refusait quand
-- même : « il reste 3 produits à compter », introuvables à l'écran.
--
-- Découvert le jour où Sunny, Daily et Berry Bowl ont laissé la place à
-- l'açaï.
-- ---------------------------------------------------------------------
-- Le claim suffit : `mep_open_count_session` lit auth.uid(). On ne prend
-- PAS le rôle `authenticated` ici — ce bloc éprouve la logique de la
-- fonction, pas la RLS, qui a sa propre section plus haut.
set request.jwt.claim.sub = 'b0000000-0000-0000-0000-00000000000e';

do $$
declare
  v_session uuid;
  v_retire  uuid;
  v_compte  uuid;
begin
  delete from public.count_sessions where date = current_date;
  v_session := public.mep_open_count_session('afternoon', null);

  select id into v_retire from public.products where name = 'Melon';

  -- Tout est relevé, puis un produit est retiré du catalogue.
  update public.count_lines
  set counted_at = now(), counted_saladbar_at = now(), counted_fridge_at = now()
  where session_id = v_session;

  perform pg_temp.check_equal(
    'Comptage complet avant retrait', public.mep_count_pending(v_session), 0);

  -- Le produit sort du catalogue APRÈS que sa ligne a été créée, et sans
  -- avoir été relevé : c'est le cas qui bloquait.
  update public.count_lines
  set counted_at = null, counted_saladbar_at = null, counted_fridge_at = null
  where session_id = v_session and product_id = v_retire;

  perform pg_temp.check_equal(
    'Sa ligne non relevée bloque encore la validation',
    public.mep_count_pending(v_session) , 1);

  update public.products set is_active = false where id = v_retire;

  perform pg_temp.check_equal(
    'Produit désactivé : il ne compte plus comme manquant',
    public.mep_count_pending(v_session), 0);

  -- Et le rechargement de l'écran fait disparaître la ligne orpheline.
  perform public.mep_open_count_session('afternoon', null);

  perform pg_temp.check_equal(
    'La ligne orpheline est retirée au rechargement',
    (select count(*)::int from public.count_lines
     where session_id = v_session and product_id = v_retire),
    0);

  -- Une ligne DÉJÀ RELEVÉE, elle, est une mesure : elle reste.
  select id into v_compte from public.products where name = 'Ananas';
  update public.products set is_active = false where id = v_compte;
  perform public.mep_open_count_session('afternoon', null);

  perform pg_temp.check_equal(
    'Une ligne déjà relevée survit au retrait du produit',
    (select count(*)::int from public.count_lines
     where session_id = v_session and product_id = v_compte),
    1);

  update public.products set is_active = true where id in (v_retire, v_compte);
end
$$;

reset "request.jwt.claim.sub";

\echo ''
\echo '===== TESTS DE COMPTAGE : TOUS PASSÉS ====='
