-- =====================================================================
-- FAILLE CORRIGÉE — les fonctions de CA étaient exécutables par `anon`
--
-- `revoke all ... from public` NE SUFFIT PAS sur Supabase : la plateforme
-- accorde explicitement EXECUTE à `anon`, `authenticated` et `service_role`
-- via ALTER DEFAULT PRIVILEGES. Révoquer au pseudo-rôle `public` laisse donc
-- intacte la permission nominative d'`anon`.
--
-- Conséquence : n'importe qui, sans même être connecté, pouvait appeler
--   POST /rest/v1/rpc/mep_forecast_revenue
-- et lire le chiffre d'affaires prévisionnel du restaurant.
--
-- Repéré par l'analyseur de sécurité de Supabase, confirmé en production,
-- corrigé ici. Les tests de sécurité vérifiaient `anon` sur les TABLES mais
-- pas sur les FONCTIONS : c'est désormais couvert (voir 20_rls.test.sql).
-- =====================================================================

-- --- Chiffre d'affaires et cibles : personne, hors serveur.
revoke all on function public.mep_forecast_revenue(date)
  from public, anon, authenticated;
revoke all on function public.mep_reference_revenue(date, public.session_kind)
  from public, anon, authenticated;
revoke all on function public.mep_product_targets(date, public.session_kind)
  from public, anon, authenticated;

-- --- Fonctions de déclencheur : jamais appelables directement.
revoke all on function public.audit_trigger()            from public, anon, authenticated;
revoke all on function public.handle_new_user()          from public, anon, authenticated;
revoke all on function public.guard_profile_privileges() from public, anon, authenticated;
revoke all on function public.set_updated_at()           from public, anon, authenticated;

-- --- Rappels : réservés à la tâche planifiée (clé de service).
revoke all on function public.mep_pending_reminders(public.session_kind)
  from public, anon, authenticated;
revoke all on function public.mep_claim_reminder(public.session_kind, time)
  from public, anon, authenticated;

-- --- Parcours employé : connecté uniquement, jamais anonyme.
revoke all on function public.mep_open_count_session(public.session_kind, jsonb)
  from public, anon;
revoke all on function public.mep_submit_count(uuid)   from public, anon;
revoke all on function public.mep_reorder_report(uuid) from public, anon;
grant execute on function public.mep_open_count_session(public.session_kind, jsonb) to authenticated;
grant execute on function public.mep_submit_count(uuid)   to authenticated;
grant execute on function public.mep_reorder_report(uuid) to authenticated;

-- --- Aides de rôle : connecté uniquement.
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_manager()        from public, anon;
revoke all on function public.is_owner()          from public, anon;
revoke all on function public.is_active_user()    from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_manager()        to authenticated;
grant execute on function public.is_owner()          to authenticated;
grant execute on function public.is_active_user()    to authenticated;

-- --- Calcul pur : inoffensif, mais inutile à `anon`.
revoke all on function public.mep_ceil_to(numeric, numeric) from public, anon;
revoke all on function public.mep_reference_date(date)      from public, anon;
grant execute on function public.mep_ceil_to(numeric, numeric) to authenticated;
grant execute on function public.mep_reference_date(date)      to authenticated;

-- --- search_path figé : sans cela, un rôle peut détourner la résolution des
-- --- noms de tables à l'intérieur d'une fonction SECURITY DEFINER.
alter function public.set_updated_at()              set search_path = public;
alter function public.mep_reference_date(date)      set search_path = public;
alter function public.mep_ceil_to(numeric, numeric) set search_path = public;
