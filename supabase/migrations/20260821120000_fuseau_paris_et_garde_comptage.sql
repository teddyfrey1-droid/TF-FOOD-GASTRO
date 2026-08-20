-- =====================================================================
-- La base raisonne à l'heure de Paris — et une garde oubliée
--
-- DEUX CORRECTIONS.
--
-- 1. `current_date` renvoyait la date UTC.
--
--    L'application, elle, calcule « aujourd'hui » à l'heure de Paris
--    (`todayInParis`). Les deux coïncident 22 heures sur 24 et divergent
--    entre minuit et 2 h du matin, heure d'été : à 00 h 30 le 22, la base
--    répond encore « 21 ».
--
--    Neuf politiques RLS et cinq fonctions comparent une date de comptage
--    à `current_date`. Un comptage ouvert dans ce créneau serait donc
--    enregistré à la veille, invisible depuis l'écran d'accueil qui
--    l'interroge à la date de Paris — l'employé compterait dans le vide.
--
--    Plutôt que de réécrire quatorze expressions et d'attendre la
--    prochaine qui oubliera la conversion, on déplace le fuseau de la
--    base entière. `current_date`, `now()` et les valeurs par défaut
--    parlent désormais tous de Paris, comme le restaurant.
--
--    Les colonnes `timestamptz` sont stockées en UTC quoi qu'il arrive :
--    ce réglage ne change aucune donnée, seulement la façon de lire
--    l'instant présent. Les conversions explicites déjà écrites
--    (`at time zone 'Europe/Paris'`) restent justes.
--
-- 2. `mep_count_pending` ne vérifiait pas son appelant.
--
--    La fonction est SECURITY DEFINER : elle traverse la RLS. Elle
--    acceptait n'importe quel identifiant de comptage et renvoyait le
--    nombre de lignes restantes — y compris pour une journée que
--    l'employé n'a pas le droit de consulter. Il fallait deviner un UUID,
--    donc le risque réel était faible ; la garde manquait quand même.
-- =====================================================================

do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Europe/Paris');
end;
$$;

-- `alter database` ne vaut que pour les connexions suivantes : on règle
-- aussi la session courante, pour que la suite du fichier soit cohérente.
set timezone to 'Europe/Paris';

-- ---------------------------------------------------------------------
-- La garde manquante.
--
-- On reprend mot pour mot la règle de lecture de `count_sessions` : un
-- chef de service voit tout, un employé actif voit le jour même. Les
-- deux chemins doivent dire la même chose, sinon l'un contredit l'autre.
-- ---------------------------------------------------------------------
create or replace function public.mep_count_pending(p_session_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_date date;
  v_reste int;
begin
  select date into v_date from public.count_sessions where id = p_session_id;

  if v_date is null then
    raise exception 'Comptage introuvable.' using errcode = 'no_data_found';
  end if;

  -- La garde ne vise que les appels VENUS D'UN COMPTE. Sans sujet dans le
  -- jeton, l'appel provient du serveur lui-même (tâches planifiées,
  -- migrations, tests) : il n'y a personne à qui cacher quoi que ce soit,
  -- et seul `authenticated` a le droit d'exécution de toute façon.
  if auth.uid() is not null
     and not public.is_staff_lead()
     and not (public.is_active_user() and v_date = current_date) then
    raise exception 'Ce comptage ne vous est pas accessible.' using errcode = '42501';
  end if;

  select count(*)::int into v_reste
  from public.count_lines cl
  join public.products p on p.id = cl.product_id
  where cl.session_id = p_session_id
    and p.is_active
    and not cl.is_not_applicable
    and cl.deferred_at is null
    and (
      (p.in_saladbar and cl.counted_saladbar_at is null)
      or (p.in_fridge and cl.counted_fridge_at is null)
      or (not p.in_saladbar and not p.in_fridge and cl.counted_at is null)
    );

  return v_reste;
end;
$$;

revoke all on function public.mep_count_pending(uuid) from public, anon;
grant execute on function public.mep_count_pending(uuid) to authenticated;

comment on function public.mep_count_pending(uuid) is
  'Nombre de lignes encore à relever. Refuse les comptages hors de portée de l''appelant.';
