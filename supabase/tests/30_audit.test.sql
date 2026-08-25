-- =====================================================================
-- Tests du journal d'audit
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

do $$
declare
  v_saumon uuid;
  v_before int;
begin
  select id into v_saumon from public.products where name = 'Saumon';
  select count(*)::int into v_before from public.audit_log where table_name = 'products';

  update public.products set min_divisor = 3 where id = v_saumon;

  perform pg_temp.check_equal(
    'Modifier le minimum d''un produit écrit une ligne d''audit',
    (select count(*)::int from public.audit_log where table_name = 'products') - v_before, 1);

  perform pg_temp.check_equal(
    'L''audit conserve l''ancienne valeur du minimum',
    (select (before ->> 'min_divisor')::numeric from public.audit_log
     where table_name = 'products' and record_id = v_saumon::text
     order by created_at desc limit 1),
    2.000::numeric);

  perform pg_temp.check_equal(
    'L''audit conserve la nouvelle valeur du minimum',
    (select (after ->> 'min_divisor')::numeric from public.audit_log
     where table_name = 'products' and record_id = v_saumon::text
     order by created_at desc limit 1),
    3.000::numeric);

  -- Une mise à jour sans changement ne pollue pas le journal.
  select count(*)::int into v_before from public.audit_log where table_name = 'products';
  update public.products set min_divisor = 3 where id = v_saumon;
  perform pg_temp.check_equal(
    'Une mise à jour sans changement n''écrit rien',
    (select count(*)::int from public.audit_log where table_name = 'products') - v_before, 0);

  update public.products set min_divisor = 2 where id = v_saumon;
end
$$;

do $$
declare v_before int;
begin
  select count(*)::int into v_before from public.audit_log where table_name = 'products';
  update public.products set base_qty = 9.9 where name = 'Saumon';
  perform pg_temp.check_equal(
    'Modifier la base d''un produit est tracé',
    (select count(*)::int from public.audit_log where table_name = 'products') - v_before, 1);
  update public.products set base_qty = 2.3 where name = 'Saumon';
end
$$;

do $$
declare v_before int;
begin
  select count(*)::int into v_before from public.audit_log where table_name = 'revenue_history';
  insert into public.revenue_history (date, revenue_ht) values (date '2025-01-02', 1234)
    on conflict (date) do update set revenue_ht = 1234;
  perform pg_temp.check_equal(
    'Modifier le CA est tracé',
    (select count(*)::int from public.audit_log where table_name = 'revenue_history') - v_before, 1);
end
$$;

do $$
declare v_before int;
begin
  select count(*)::int into v_before from public.audit_log where table_name = 'revenue_settings';
  update public.revenue_settings set growth_rate = 0.12;
  perform pg_temp.check_equal(
    'Modifier le taux de croissance est tracé',
    (select count(*)::int from public.audit_log where table_name = 'revenue_settings') - v_before, 1);
  update public.revenue_settings set growth_rate = 0;
end
$$;

-- Un comptage n'a pas à être audité ligne à ligne : il EST déjà l'historique.
do $$
declare v_before int;
begin
  select count(*)::int into v_before from public.audit_log;
  insert into public.count_sessions (date, session, user_id)
  values (current_date + 1, 'morning', (select id from public.profiles limit 1));
  perform pg_temp.check_equal(
    'Un comptage n''écrit pas dans le journal d''audit',
    (select count(*)::int from public.audit_log) - v_before, 0);
  delete from public.count_sessions where date = current_date + 1;
end
$$;

\echo ''
\echo '===== TESTS D''AUDIT : TOUS PASSÉS ====='
