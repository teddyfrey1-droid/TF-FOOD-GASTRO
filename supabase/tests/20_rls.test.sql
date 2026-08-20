-- =====================================================================
-- Tests de sécurité — Row Level Security (§8)
--
-- « Un employé, même avec les outils de développement, ne peut accéder à
--   aucune donnée de CA, de cible ou de seuil. »
--
-- Ces tests forgent de vraies sessions Postgres avec le rôle `authenticated`
-- et un claim JWT `sub`, exactement comme le fait Supabase quand une requête
-- arrive depuis un téléphone. Ce ne sont pas des tests de composants React.
-- =====================================================================

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Utilitaires d'assertion
-- ---------------------------------------------------------------------
create or replace function pg_temp.check_equal(label text, actual anyelement, expected anyelement)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'ÉCHEC — % : attendu %, obtenu %', label, expected, actual;
  end if;
  raise notice 'OK   — %', label;
end;
$$;

/** Vérifie qu'une requête renvoie exactement zéro ligne. */
create or replace function pg_temp.check_no_rows(label text, stmt text)
returns void language plpgsql as $$
declare n int;
begin
  execute format('select count(*) from (%s) as sub', stmt) into n;
  if n <> 0 then
    raise exception 'ÉCHEC — % : % ligne(s) visible(s), 0 attendue(s)', label, n;
  end if;
  raise notice 'OK   — % (0 ligne)', label;
exception
  when insufficient_privilege or undefined_table or undefined_function or undefined_column then
    raise notice 'OK   — % (accès refusé : %)', label, sqlerrm;
end;
$$;

/** Vérifie qu'une requête est bel et bien refusée. */
create or replace function pg_temp.check_denied(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ÉCHEC — % : la requête a réussi alors qu''elle devait être refusée', label;
exception
  when insufficient_privilege or undefined_table or undefined_function
     or undefined_column or check_violation then
    raise notice 'OK   — % (refusé : %)', label, sqlerrm;
end;
$$;

/**
 * Vérifie qu'une écriture est SANS EFFET : soit refusée, soit filtrée par la
 * RLS et donc appliquée à zéro ligne. Le cahier des charges accepte les deux
 * (« une erreur ou zéro ligne »), mais exige qu'il ne se passe rien.
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
  when insufficient_privilege or undefined_table or undefined_function
     or undefined_column or check_violation then
    raise notice 'OK   — % (refusé : %)', label, sqlerrm;
end;
$$;

/** Vérifie qu'une requête réussit. */
create or replace function pg_temp.check_allowed(label text, stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'OK   — %', label;
end;
$$;

-- ---------------------------------------------------------------------
-- Trois comptes : un employé, un directeur, un propriétaire.
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000e', 'karim@heiko.test'),
  ('a0000000-0000-0000-0000-00000000000d', 'directeur@heiko.test'),
  ('a0000000-0000-0000-0000-00000000000f', 'proprietaire@heiko.test')
on conflict (id) do nothing;

update public.profiles set full_name = 'Karim',        role = 'employee', is_active = true where id = 'a0000000-0000-0000-0000-00000000000e';
update public.profiles set full_name = 'Le directeur', role = 'manager', is_active = true
  where id = 'a0000000-0000-0000-0000-00000000000d';
update public.profiles set full_name = 'Le patron',    role = 'owner', is_active = true    where id = 'a0000000-0000-0000-0000-00000000000f';

-- Données sensibles à protéger.
insert into public.revenue_history (date, revenue_ht) values (date '2025-08-19', 3200)
  on conflict (date) do update set revenue_ht = 3200;
insert into public.revenue_actuals (date, revenue_ht, revenue_lunch_ht) values (current_date, 2900, 1800)
  on conflict (date) do update set revenue_ht = 2900;
insert into public.daily_forecast (date, forecast_revenue, source) values (current_date, 3200, 'manual')
  on conflict (date) do update set forecast_revenue = 3200;
insert into public.audit_log (action, table_name, record_id) values ('test', 'products', 'x');

\echo ''
\echo '--- 1. L''EMPLOYÉ NE VOIT AUCUNE DONNÉE DE CHIFFRE D''AFFAIRES ---'

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000e';

select pg_temp.check_equal('Le rôle applicatif lu est bien employee',
  public.current_user_role()::text, 'employee');
select pg_temp.check_equal('is_manager() est faux pour un employé',
  public.is_manager(), false);

select pg_temp.check_no_rows('revenue_history invisible',  'select * from public.revenue_history');
select pg_temp.check_no_rows('revenue_actuals invisible',  'select * from public.revenue_actuals');
select pg_temp.check_no_rows('daily_forecast invisible',   'select * from public.daily_forecast');
select pg_temp.check_no_rows('revenue_settings invisible', 'select * from public.revenue_settings');
select pg_temp.check_no_rows('audit_log invisible',        'select * from public.audit_log');

select pg_temp.check_denied('Écriture dans revenue_history refusée',
  'insert into public.revenue_history (date, revenue_ht) values (date ''2030-01-01'', 9999)');
select pg_temp.check_denied('Écriture dans daily_forecast refusée',
  'insert into public.daily_forecast (date, forecast_revenue) values (date ''2030-01-01'', 9999)');
select pg_temp.check_no_effect('Modification des réglages de CA sans effet',
  'update public.revenue_settings set growth_rate = 5');
select pg_temp.check_no_rows('product_family_settings invisible',
  'select * from public.product_family_settings');
select pg_temp.check_no_effect('Modifier les réglages de famille sans effet',
  'update public.product_family_settings set target_multiplier = 99');
select pg_temp.check_denied('Écriture dans audit_log refusée',
  'insert into public.audit_log (action, table_name) values (''triche'', ''products'')');

\echo ''
\echo '--- 2. NI CIBLE NI SEUIL NE FUITENT PAR LES PRODUITS ---'

select pg_temp.check_no_rows('Table products entièrement invisible', 'select * from public.products');

select pg_temp.check_denied('Fonction mep_product_targets non exécutable',
  'select * from public.mep_product_targets(current_date, ''morning'')');
select pg_temp.check_denied('Fonction mep_forecast_revenue non exécutable',
  'select public.mep_forecast_revenue(current_date)');
select pg_temp.check_denied('Fonction mep_reference_revenue non exécutable',
  'select public.mep_reference_revenue(current_date, ''morning'')');

-- La vue de comptage doit exposer les produits SANS les colonnes sensibles.
select pg_temp.check_equal('La vue de comptage expose bien les produits actifs',
  (select count(*) > 0 from public.products_for_count), true);

reset role;
reset "request.jwt.claim.sub";
do $$
declare leaked text;
begin
  select string_agg(column_name, ', ')
    into leaked
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'products_for_count'
    -- Un employé qui connaîtrait sa base ET sa cible pourrait recalculer le
    -- chiffre d'affaires du restaurant. Aucune de ces colonnes ne doit sortir.
    and column_name in (
      'base_qty', 'family', 'min_mode', 'min_divisor', 'min_qty_manual',
      'floor_qty', 'ceiling_qty', 'priority',
      'weight_per_bac_kg', 'prep_time_min', 'production_step'
    );
  if leaked is not null then
    raise exception 'ÉCHEC — colonnes sensibles exposées par products_for_count : %', leaked;
  end if;
  raise notice 'OK   — products_for_count ne contient aucune colonne sensible';
end
$$;

-- La charge utile renvoyée au téléphone ne doit porter que produit, quantité,
-- unité et priorité.
do $$
declare leaked text;
begin
  select string_agg(p.parameter_name, ', ')
    into leaked
  from information_schema.parameters p
  join information_schema.routines r
    on r.specific_name = p.specific_name and r.specific_schema = p.specific_schema
  where r.routine_schema = 'public'
    and r.routine_name = 'mep_submit_count'
    and p.parameter_mode = 'OUT'
    -- Liste tenue à la main, VOLONTAIREMENT : toute colonne ajoutée à la
    -- fonction doit être justifiée ici avant d'atteindre un téléphone.
    --
    -- `image_url` et `category_name` sont des libellés d'affichage.
    --
    -- `is_critical` est un booléen : « à faire en premier ». Il apprend à
    -- l'employé que le seuil critique dépasse le stock qu'il vient de
    -- compter — donc que la cible dépasse quatre fois ce stock. Or la
    -- quantité à produire lui donne DÉJÀ la cible exacte
    -- (cible = quantité + stock) : c'est inhérent à un rapport qui dit
    -- quoi produire. Et la cible seule ne rend pas le chiffre d'affaires :
    -- il y faudrait la base « VENTE POUR » et le multiplicateur de
    -- famille, qui ne quittent jamais le back-office.
    and p.parameter_name not in ('product_id', 'product_name', 'notes',
                                 'qty_to_produce', 'unit', 'priority',
                                 'is_critical', 'image_url', 'category_name');
  if leaked is not null then
    raise exception 'ÉCHEC — mep_submit_count renvoie des colonnes en trop : %', leaked;
  end if;
  raise notice 'OK   — mep_submit_count ne renvoie rien de sensible';
end
$$;

\echo ''
\echo '--- 3. L''EMPLOYÉ NE MANIPULE QUE SES PROPRES COMPTAGES ---'

-- Une session d'hier appartenant à quelqu'un d'autre.
insert into public.count_sessions (id, date, session, user_id, status, submitted_at)
values ('c0000000-0000-0000-0000-000000000001', current_date - 1, 'morning',
        'a0000000-0000-0000-0000-00000000000d', 'submitted', now())
on conflict (id) do nothing;

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000e';

select pg_temp.check_no_rows('Sessions des autres jours invisibles',
  'select * from public.count_sessions where date < current_date');

select pg_temp.check_allowed('Création de sa propre session du jour',
  'insert into public.count_sessions (id, date, session, user_id)
   values (''c0000000-0000-0000-0000-0000000000ee'', current_date, ''afternoon'',
           ''a0000000-0000-0000-0000-00000000000e'')');

select pg_temp.check_denied('Création d''une session au nom d''un autre refusée',
  'insert into public.count_sessions (date, session, user_id)
   values (current_date, ''morning'', ''a0000000-0000-0000-0000-00000000000d'')');

select pg_temp.check_denied('Antidater une session refusé',
  'insert into public.count_sessions (date, session, user_id)
   values (current_date - 5, ''morning'', ''a0000000-0000-0000-0000-00000000000e'')');

select pg_temp.check_allowed('Saisie d''une ligne de comptage',
  'insert into public.count_lines (session_id, product_id, qty_saladbar, qty_fridge)
   select ''c0000000-0000-0000-0000-0000000000ee'', id, 2, 1
   from public.products_for_count where name = ''Saumon''');

-- Les snapshots sont écrits par le serveur : le téléphone ne doit pas
-- pouvoir se fabriquer une cible sur mesure.
select pg_temp.check_denied('Écriture directe d''un snapshot de cible refusée',
  'update public.count_lines set target_snapshot = 99
   where session_id = ''c0000000-0000-0000-0000-0000000000ee''');
select pg_temp.check_denied('Écriture directe d''un snapshot de minimum refusée',
  'update public.count_lines set min_snapshot = 0
   where session_id = ''c0000000-0000-0000-0000-0000000000ee''');

select pg_temp.check_allowed('Correction de sa propre quantité comptée',
  'update public.count_lines set qty_saladbar = 3
   where session_id = ''c0000000-0000-0000-0000-0000000000ee''');

-- Marquer les deux zones relevées, comme le fait l'écran de comptage :
-- la validation refuse désormais une session incomplète.
select pg_temp.check_allowed('Marquer les deux zones comme relevées',
  'update public.count_lines
   set counted_at = now(), counted_saladbar_at = now(), counted_fridge_at = now()
   where session_id = ''c0000000-0000-0000-0000-0000000000ee''');

\echo ''
\echo '--- 4. LE RAPPORT DE RELANCE NE TRANSPORTE AUCUNE DONNÉE SENSIBLE ---'

select pg_temp.check_allowed('L''employé peut valider son comptage',
  'select * from public.mep_submit_count(''c0000000-0000-0000-0000-0000000000ee'')');

reset role;
reset "request.jwt.claim.sub";
do $$
declare leaked text;
begin
  select string_agg(p.parameter_name, ', ')
    into leaked
  from information_schema.parameters p
  join information_schema.routines r
    on r.specific_name = p.specific_name and r.specific_schema = p.specific_schema
  where r.routine_schema = 'public'
    and r.routine_name = 'mep_submit_count'
    and p.parameter_mode = 'OUT'
    and p.parameter_name in ('target', 'minimum', 'base_qty', 'forecast_revenue', 'ca_ref', 'coverage_ratio');
  if leaked is not null then
    raise exception 'ÉCHEC — mep_submit_count renvoie des colonnes sensibles : %', leaked;
  end if;
  raise notice 'OK   — mep_submit_count ne renvoie ni cible, ni minimum, ni base, ni CA';
end
$$;

\echo ''
\echo '--- 5. L''EMPLOYÉ COCHE UNE TÂCHE, IL N''EN RÉÉCRIT PAS LA QUANTITÉ ---'

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000e';

select pg_temp.check_allowed('Cocher une tâche de production',
  'update public.production_tasks set is_done = true, done_at = now()
   where session_id = ''c0000000-0000-0000-0000-0000000000ee''');

select pg_temp.check_denied('Réécrire la quantité à produire refusée',
  'update public.production_tasks set qty_to_produce = 0
   where session_id = ''c0000000-0000-0000-0000-0000000000ee''');

select pg_temp.check_denied('Réécrire la priorité refusée',
  'update public.production_tasks set priority_snapshot = 1
   where session_id = ''c0000000-0000-0000-0000-0000000000ee''');

\echo ''
\echo '--- 6. UN EMPLOYÉ NE PEUT PAS SE PROMOUVOIR ---'

select pg_temp.check_equal('Un employé ne voit que son propre profil',
  (select count(*)::int from public.profiles), 1);

select pg_temp.check_denied('Auto-promotion en owner refusée',
  'update public.profiles set role = ''owner'' where id = ''a0000000-0000-0000-0000-00000000000e''');

select pg_temp.check_denied('Auto-promotion en manager refusée',
  'update public.profiles set role = ''manager'' where id = ''a0000000-0000-0000-0000-00000000000e''');

select pg_temp.check_denied('Créer un profil administrateur refusé',
  'insert into public.profiles (id, full_name, role)
   values (''a0000000-0000-0000-0000-0000000000aa'', ''Faux patron'', ''owner'')');

select pg_temp.check_allowed('Corriger son propre nom autorisé',
  'update public.profiles set full_name = ''Karim B.'' where id = ''a0000000-0000-0000-0000-00000000000e''');

select pg_temp.check_equal('Le rôle est resté employee après les tentatives',
  public.current_user_role()::text, 'employee');

\echo ''
\echo '--- 7. LE DIRECTEUR, LUI, VOIT TOUT ---'

set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000d';

select pg_temp.check_equal('is_manager() est vrai pour un directeur', public.is_manager(), true);
select pg_temp.check_equal('Le directeur lit le CA de l''an dernier',
  (select count(*) > 0 from public.revenue_history), true);
select pg_temp.check_equal('Le directeur lit les réglages de famille',
  (select count(*) > 0 from public.product_family_settings), true);
select pg_temp.check_equal('Le directeur lit les bases « VENTE POUR »',
  (select count(*) > 0 from public.products where base_qty > 0), true);
select pg_temp.check_equal('Le directeur lit la table products complète',
  (select count(*) > 0 from public.products), true);
select pg_temp.check_equal('Le directeur lit les prévisions',
  (select count(*) > 0 from public.daily_forecast), true);
select pg_temp.check_equal('Le directeur lit le journal d''audit',
  (select count(*) > 0 from public.audit_log), true);
select pg_temp.check_equal('Le directeur voit les sessions de tout le monde',
  (select count(*) > 1 from public.count_sessions), true);

select pg_temp.check_allowed('Le directeur modifie un produit',
  'update public.products set notes = ''vérifié'' where name = ''Saumon''');
select pg_temp.check_allowed('Le directeur promeut un employé',
  'update public.profiles set role = ''manager'' where id = ''a0000000-0000-0000-0000-00000000000e''');
select pg_temp.check_allowed('Le directeur rétrograde un employé',
  'update public.profiles set role = ''employee'' where id = ''a0000000-0000-0000-0000-00000000000e''');

\echo ''
\echo '--- 8. UN COMPTE DÉSACTIVÉ PERD TOUT ---'

reset role;
reset "request.jwt.claim.sub";
update public.profiles set is_active = false where id = 'a0000000-0000-0000-0000-00000000000d';

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000d';

select pg_temp.check_equal('Un compte désactivé n''est plus manager', public.is_manager(), false);
select pg_temp.check_no_rows('Un compte désactivé ne lit plus le CA',
  'select * from public.revenue_history');

reset role;
reset "request.jwt.claim.sub";
update public.profiles set is_active = true where id = 'a0000000-0000-0000-0000-00000000000d';

\echo ''
\echo '--- 9. UN VISITEUR NON AUTHENTIFIÉ N''A RIEN ---'

set role anon;
select pg_temp.check_no_rows('anon ne lit pas le CA',            'select * from public.revenue_history');
select pg_temp.check_no_rows('anon ne lit pas les réglages de famille', 'select * from public.product_family_settings');
select pg_temp.check_no_rows('anon ne lit pas les produits',     'select * from public.products');
select pg_temp.check_no_rows('anon ne lit pas les comptages',    'select * from public.count_sessions');
reset role;
reset "request.jwt.claim.sub";

\echo ''
\echo '--- 10. UN COMPTE AUTO-INSCRIT N''A RIEN, TANT QU''IL N''EST PAS VALIDÉ ---'

-- Le dépôt est public : l'URL du projet et la clé « anon » sont connues.
-- Si l'inscription libre est ouverte, un inconnu peut devenir `authenticated`.
-- Il ne doit alors RIEN pouvoir faire tant que le directeur ne l'a pas activé.
insert into auth.users (id, email)
values ('a0000000-0000-0000-0000-0000000000ff', 'inconnu@exemple.fr')
on conflict (id) do nothing;

select pg_temp.check_equal('Un compte auto-inscrit naît désactivé',
  (select is_active from public.profiles where id = 'a0000000-0000-0000-0000-0000000000ff'),
  false);

select pg_temp.check_equal('... et employé, jamais directeur',
  (select role::text from public.profiles where id = 'a0000000-0000-0000-0000-0000000000ff'),
  'employee');

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-0000000000ff';

select pg_temp.check_no_rows('Un compte en attente ne voit aucun produit',
  'select * from public.products_for_count');
select pg_temp.check_no_rows('... ni les prénoms de l''équipe',
  'select * from public.team_members');
select pg_temp.check_no_rows('... ni le comptage du jour',
  'select * from public.count_sessions');
select pg_temp.check_no_rows('... ni les lignes de comptage',
  'select * from public.count_lines');
select pg_temp.check_no_rows('... ni les tâches de production',
  'select * from public.production_tasks');
select pg_temp.check_no_rows('... ni le chiffre d''affaires',
  'select * from public.revenue_history');

select pg_temp.check_no_effect('Un compte en attente ne peut pas toucher au comptage',
  'update public.count_lines set qty_saladbar = 99');

select pg_temp.check_denied('Un compte en attente ne peut pas s''activer lui-même',
  'update public.profiles set is_active = true where id = ''a0000000-0000-0000-0000-0000000000ff''');

-- Une fois validé par le directeur, il travaille normalement.
reset role;
reset "request.jwt.claim.sub";
update public.profiles set is_active = true where id = 'a0000000-0000-0000-0000-0000000000ff';

set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-0000000000ff';

select pg_temp.check_equal('Une fois validé, il voit les produits à compter',
  (select count(*) > 0 from public.products_for_count), true);
select pg_temp.check_no_rows('... mais toujours aucun chiffre d''affaires',
  'select * from public.revenue_history');

reset role;
reset "request.jwt.claim.sub";

\echo ''
\echo '--- 11. LES FONCTIONS AUSSI, PAS SEULEMENT LES TABLES ---'

-- Ces assertions manquaient : les tests vérifiaient ce qu'`anon` lit dans les
-- TABLES, jamais ce qu'il peut EXÉCUTER. Sur Supabase, `revoke ... from public`
-- ne retire pas la permission nominative accordée à `anon` par défaut — un
-- visiteur anonyme lisait donc le CA prévisionnel via /rest/v1/rpc/.
set role anon;

select pg_temp.check_denied('anon ne peut pas calculer le CA prévisionnel',
  'select public.mep_forecast_revenue(current_date)');
select pg_temp.check_denied('anon ne peut pas calculer le CA de référence',
  'select public.mep_reference_revenue(current_date, ''morning'')');
select pg_temp.check_denied('anon ne peut pas lire les cibles',
  'select * from public.mep_product_targets(current_date, ''morning'')');
select pg_temp.check_denied('anon ne peut pas ouvrir de comptage',
  'select public.mep_open_count_session(''morning'')');
select pg_temp.check_denied('anon ne peut pas valider de comptage',
  'select * from public.mep_submit_count(gen_random_uuid())');
select pg_temp.check_denied('anon ne peut pas lire un rapport de relance',
  'select * from public.mep_reorder_report(gen_random_uuid())');
select pg_temp.check_denied('anon ne peut pas lister les rappels à envoyer',
  'select * from public.mep_pending_reminders(''morning'')');
select pg_temp.check_denied('anon ne peut pas réserver un rappel',
  'select public.mep_claim_reminder(''morning'')');

reset role;
reset "request.jwt.claim.sub";

-- Un EMPLOYÉ connecté n'a pas davantage accès au CA ni aux cibles.
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000e';

select pg_temp.check_denied('Un employé ne peut pas calculer le CA prévisionnel',
  'select public.mep_forecast_revenue(current_date)');
select pg_temp.check_denied('Un employé ne peut pas lire les cibles',
  'select * from public.mep_product_targets(current_date, ''morning'')');
select pg_temp.check_denied('Un employé ne peut pas lister les rappels à envoyer',
  'select * from public.mep_pending_reminders(''morning'')');

-- ... mais il valide bien son comptage, qui ne lui renvoie que le nécessaire.
select pg_temp.check_allowed('Un employé valide bien son comptage',
  'select * from public.mep_submit_count(''c0000000-0000-0000-0000-0000000000ee'')');

reset role;
reset "request.jwt.claim.sub";

\echo ''
\echo '--- 8. LES CATÉGORIES ET LES ZONES SONT DU BACK-OFFICE ---'

-- Les catégories décident de l'ordre des rayons à l'écran de comptage.
-- Un employé les LIT — sans elles, l'écran n'aurait plus d'intertitres —
-- mais ne les modifie pas.
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000e';

select pg_temp.check_no_effect('Renommer une catégorie reste sans effet',
  'update public.product_categories set name = ''Piraté''');

select pg_temp.check_no_effect('Supprimer une catégorie reste sans effet',
  'delete from public.product_categories');

select pg_temp.check_denied('Créer une catégorie est refusé',
  'insert into public.product_categories (name, sort_order) values (''Fantôme'', 999)');

-- Les zones de stockage aussi : les déplacer changerait ce que l'employé
-- doit relever, et donc le stock total comparé au minimum.
select pg_temp.check_no_effect('Changer la zone d''un produit reste sans effet',
  'update public.products set in_fridge = not in_fridge');

reset role;
reset "request.jwt.claim.sub";

-- Le directeur, lui, y a bien accès : sans ce contrôle, la page Catégories
-- se contenterait d'échouer en silence.
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000d';

select pg_temp.check_allowed('Le directeur crée une catégorie',
  'insert into public.product_categories (name, sort_order) values (''Zone de test'', 999)');
select pg_temp.check_allowed('Le directeur renomme une catégorie',
  'update public.product_categories set name = ''Zone renommée'' where sort_order = 999');
select pg_temp.check_allowed('Le directeur supprime une catégorie vide',
  'delete from public.product_categories where sort_order = 999');
select pg_temp.check_allowed('Le directeur change la zone d''un produit',
  'update public.products set in_fridge = in_fridge where name = ''Saumon''');

reset role;
reset "request.jwt.claim.sub";

\echo ''
\echo '--- 9. L''HISTORIQUE S''OUVRE AUX CHEFS, LE CA NON ---'

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000000a', 'assistant@heiko.test')
on conflict (id) do nothing;
update public.profiles
set full_name = 'Assistante (test)', role = 'assistant_manager', is_active = true
where id = 'a0000000-0000-0000-0000-00000000000a';

-- Une session validée d'hier, avec un CA figé et des cibles.
insert into public.count_sessions (id, date, session, user_id, status, submitted_at,
                                   forecast_revenue_snapshot)
values ('c0000000-0000-0000-0000-00000000aaaa', current_date - 2, 'morning',
        'a0000000-0000-0000-0000-00000000000e', 'submitted', now(), 4321.00)
on conflict (id) do update set forecast_revenue_snapshot = 4321.00;

insert into public.count_lines (session_id, product_id, qty_saladbar, counted_at,
                                target_snapshot, min_snapshot, crit_snapshot)
select 'c0000000-0000-0000-0000-00000000aaaa', id, 2, now(), 10, 5, 3
from public.products where name = 'Saumon'
on conflict (session_id, product_id) do update
  set target_snapshot = 10, min_snapshot = 5, crit_snapshot = 3;

-- --- Les colonnes sensibles ne sont plus lisibles en direct, PAR PERSONNE.
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000d';
select pg_temp.check_denied('Le CA figé n''est plus lisible en colonne, même pour le directeur',
  'select forecast_revenue_snapshot from public.count_sessions');
select pg_temp.check_denied('La cible figée n''est plus lisible en colonne',
  'select target_snapshot from public.count_lines');
reset role;
reset "request.jwt.claim.sub";

-- --- L'assistant manager voit l'historique...
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000a';

select pg_temp.check_equal('L''assistant manager voit les comptages passés',
  (select count(*)::int > 0
   from public.mep_count_history(current_date - 7, current_date)),
  true);

-- ...mais SANS le chiffre d'affaires.
select pg_temp.check_equal('Le CA lui reste masqué dans l''historique',
  (select count(*)::int
   from public.mep_count_history(current_date - 7, current_date)
   where forecast_revenue is not null),
  0);

select pg_temp.check_equal('Les cibles lui restent masquées dans le détail',
  (select count(*)::int
   from public.mep_count_detail('c0000000-0000-0000-0000-00000000aaaa')
   where target is not null or minimum is not null or critical is not null),
  0);

select pg_temp.check_denied('L''analyse des ruptures lui est refusée',
  'select * from public.mep_stockout_history(current_date - 7, current_date)');

select pg_temp.check_no_rows('Le CA lui reste invisible, comme avant',
  'select * from public.revenue_history');

reset role;
reset "request.jwt.claim.sub";

-- --- Le directeur, lui, voit tout.
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000d';

select pg_temp.check_equal('Le directeur retrouve le CA figé',
  (select forecast_revenue
   from public.mep_count_history(current_date - 7, current_date)
   where id = 'c0000000-0000-0000-0000-00000000aaaa'),
  4321.00::numeric);

select pg_temp.check_equal('Le directeur retrouve la cible figée',
  (select target from public.mep_count_detail('c0000000-0000-0000-0000-00000000aaaa')
   where product_name = 'Saumon'),
  10::numeric);

select pg_temp.check_equal('Le directeur obtient l''analyse des ruptures',
  (select count(*)::int >= 0
   from public.mep_stockout_history(current_date - 30, current_date)),
  true);

reset role;
reset "request.jwt.claim.sub";

-- --- L'employé reste dehors sur toute la ligne.
set role authenticated;
set request.jwt.claim.sub = 'a0000000-0000-0000-0000-00000000000e';
select pg_temp.check_denied('L''historique est refusé à l''employé',
  'select * from public.mep_count_history(current_date - 7, current_date)');
select pg_temp.check_denied('Le détail d''un comptage passé est refusé à l''employé',
  'select * from public.mep_count_detail(''c0000000-0000-0000-0000-00000000aaaa'')');
reset role;
reset "request.jwt.claim.sub";

\echo ''
\echo '===== TESTS DE SÉCURITÉ : TOUS PASSÉS ====='
