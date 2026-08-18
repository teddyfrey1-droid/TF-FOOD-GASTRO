-- =====================================================================
-- Tests des rappels de comptage (§4 : morning/afternoon_reminder_time)
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
  when insufficient_privilege or undefined_table or undefined_function then
    raise notice 'OK   — % (refusé)', label;
end;
$$;

delete from public.reminder_sends;
delete from public.count_sessions where date = current_date;

-- ---------------------------------------------------------------------
-- L'heure fait foi, et elle est lue à Paris
-- ---------------------------------------------------------------------
update public.revenue_settings
set morning_reminder_time = '07:30', afternoon_reminder_time = '15:00';

do $$
begin
  -- 07h00 : l'heure du rappel du matin n'est pas venue.
  perform pg_temp.check_equal(
    'Avant l''heure, aucun rappel n''est réservé',
    public.mep_claim_reminder('morning', time '07:00'), false);

  perform pg_temp.check_equal(
    'Rien n''est écrit tant que l''heure n''est pas venue',
    (select count(*)::int from public.reminder_sends), 0);

  -- 07h31 : c'est l'heure.
  perform pg_temp.check_equal(
    'Après l''heure, le rappel est réservé',
    public.mep_claim_reminder('morning', time '07:31'), true);

  -- ... mais une seule fois. La tâche tourne toutes les demi-heures : sans ce
  -- verrou, l'employé recevrait une notification à chaque passage.
  perform pg_temp.check_equal(
    'Le deuxième appel du jour ne réserve rien',
    public.mep_claim_reminder('morning', time '08:01'), false);
  perform pg_temp.check_equal(
    'Le troisième non plus',
    public.mep_claim_reminder('morning', time '08:31'), false);

  perform pg_temp.check_equal(
    'Une seule trace d''envoi en base',
    (select count(*)::int from public.reminder_sends
     where date = current_date and session = 'morning'), 1);

  -- L'heure pile compte comme atteinte.
  delete from public.reminder_sends;
  perform pg_temp.check_equal(
    'À l''heure pile, le rappel part',
    public.mep_claim_reminder('morning', time '07:30'), true);

  -- Matin et après-midi sont indépendants.
  perform pg_temp.check_equal(
    'À 07h31, l''après-midi n''est pas encore dû',
    public.mep_claim_reminder('afternoon', time '07:31'), false);
  perform pg_temp.check_equal(
    'À 15h01, l''après-midi se réserve',
    public.mep_claim_reminder('afternoon', time '15:01'), true);
end
$$;

-- ---------------------------------------------------------------------
-- On ne rappelle pas un comptage déjà validé
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-00000000000e', 'rappel@heiko.test')
on conflict (id) do nothing;
update public.profiles set full_name = 'Karim', role = 'employee'
  where id = 'd0000000-0000-0000-0000-00000000000e';

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('d0000000-0000-0000-0000-00000000000e',
        'https://push.example/abc', 'cle-p256dh', 'cle-auth')
on conflict (endpoint) do nothing;

do $$
declare v_session uuid;
begin
  perform pg_temp.check_equal(
    'Un employé inscrit est bien dans la liste des rappels',
    (select count(*)::int from public.mep_pending_reminders('morning')), 1);

  -- On valide le comptage du matin.
  insert into public.count_sessions (date, session, user_id, status, submitted_at)
  values (current_date, 'morning', 'd0000000-0000-0000-0000-00000000000e', 'submitted', now())
  returning id into v_session;

  perform pg_temp.check_equal(
    'Comptage validé : plus personne à rappeler',
    (select count(*)::int from public.mep_pending_reminders('morning')), 0);

  perform pg_temp.check_equal(
    'L''après-midi reste à rappeler',
    (select count(*)::int from public.mep_pending_reminders('afternoon')), 1);
end
$$;

-- Un abonnement révoqué ou un compte désactivé ne reçoit plus rien.
do $$
begin
  update public.push_subscriptions set revoked_at = now()
  where endpoint = 'https://push.example/abc';
  perform pg_temp.check_equal(
    'Un abonnement révoqué est écarté',
    (select count(*)::int from public.mep_pending_reminders('afternoon')), 0);

  update public.push_subscriptions set revoked_at = null
  where endpoint = 'https://push.example/abc';
  update public.profiles set is_active = false
  where id = 'd0000000-0000-0000-0000-00000000000e';
  perform pg_temp.check_equal(
    'Un compte désactivé est écarté',
    (select count(*)::int from public.mep_pending_reminders('afternoon')), 0);

  update public.profiles set is_active = true
  where id = 'd0000000-0000-0000-0000-00000000000e';
end
$$;

-- ---------------------------------------------------------------------
-- Ces fonctions sont réservées au serveur
-- ---------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'd0000000-0000-0000-0000-00000000000e';

select pg_temp.check_denied('mep_claim_reminder non exécutable par un employé',
  'select public.mep_claim_reminder(''morning'')');
select pg_temp.check_denied('mep_pending_reminders non exécutable par un employé',
  'select * from public.mep_pending_reminders(''morning'')');

select pg_temp.check_equal('Les traces d''envoi sont invisibles',
  (select count(*)::int from public.reminder_sends), 0);

-- Chacun ne voit que ses propres appareils.
select pg_temp.check_equal('Un employé voit son propre abonnement',
  (select count(*)::int from public.push_subscriptions), 1);

reset role;
reset "request.jwt.claim.sub";

\echo ''
\echo '===== TESTS DE RAPPELS : TOUS PASSÉS ====='
