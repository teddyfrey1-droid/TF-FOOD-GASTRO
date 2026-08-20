-- =====================================================================
-- Les rappels quittent l'hébergeur du site pour Supabase
--
-- Deux raisons, la seconde plus importante que la première :
--
--   1. Les valeurs nécessaires (clé de service, clés VAPID, secret de
--      tâche) devaient être posées à la main sur l'hébergeur. Dans une
--      fonction Edge, la clé de service est injectée d'office, et les
--      autres vivent au coffre-fort de la base : plus rien à configurer.
--
--   2. Le plan Hobby de Vercel n'autorise qu'UN déclenchement par jour et
--      par tâche. Les rappels étaient donc calés sur une heure fixe en
--      UTC — celle de l'HIVER — et partaient une heure trop tard six mois
--      par an. `pg_cron` n'a pas cette limite.
--
-- ⚠️ Les VALEURS des secrets ne figurent pas ici : ce dépôt est public.
--    Elles ont été déposées une fois au coffre-fort, hors du dépôt, sous
--    les noms `vapid_private_key`, `vapid_public_key` et
--    `rappels_cron_secret`. Pour un nouvel environnement, les recréer avec
--    `vault.create_secret(valeur, nom, description)`.
-- =====================================================================

-- `pg_cron` et `pg_net` n'existent que chez Supabase. Le harnais de test
-- local tourne sur un Postgres nu : la planification y est simplement
-- sautée, ce qui n'ôte rien aux contrôles — ils portent sur les règles
-- d'accès et le calcul, pas sur l'ordonnanceur.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- Les clés VAPID, lisibles par le seul serveur
--
-- La clé privée signe les notifications : qui la détient peut en envoyer
-- à tous les téléphones abonnés. Le schéma `vault` n'étant pas exposé par
-- l'API, la fonction Edge passe par cet unique point de lecture — accordé
-- à `service_role`, à personne d'autre.
-- ---------------------------------------------------------------------
create or replace function public.mep_vapid_keys()
returns table (public_key text, private_key text)
language sql
stable
security definer
set search_path = public, vault
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key');
$$;

revoke all on function public.mep_vapid_keys() from public, anon, authenticated;
grant execute on function public.mep_vapid_keys() to service_role;

comment on function public.mep_vapid_keys() is
  'Clés VAPID pour la fonction Edge des rappels. Accordée au SEUL service_role.';

-- ---------------------------------------------------------------------
-- Le secret d'appel de la fonction Edge
--
-- `pg_cron` ne dispose d'aucun jeton d'utilisateur : la vérification de
-- JWT est donc désactivée sur la fonction, et remplacée par ce secret
-- partagé. Sans lui, l'adresse de la fonction serait un moyen d'envoyer
-- une notification à toute l'équipe.
-- ---------------------------------------------------------------------
create or replace function public.mep_rappels_secret()
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'rappels_cron_secret';
$$;

revoke all on function public.mep_rappels_secret() from public, anon, authenticated;
grant execute on function public.mep_rappels_secret() to service_role;

comment on function public.mep_rappels_secret() is
  'Secret d''appel de la fonction Edge des rappels. Accordée au SEUL service_role.';

-- ---------------------------------------------------------------------
-- Réveil toutes les quinze minutes
--
-- C'est la BASE, et non l'ordonnanceur, qui décide si l'heure de Paris
-- est venue : `mep_claim_reminder` compare l'heure locale à celle réglée
-- au back-office et ne dit vrai qu'UNE fois par jour et par session. Un
-- réveil fréquent ne produit donc pas plus de rappels — il rapproche
-- seulement l'envoi de l'heure demandée, été comme hiver.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron absent : planification des rappels ignorée (base de test).';
    return;
  end if;

  -- Le nom sert de clé : on retire l'ancienne planification avant d'en
  -- poser une nouvelle, sinon deux tâches coexisteraient.
  perform cron.unschedule(jobid) from cron.job where jobname = 'mep_rappels';

  perform cron.schedule(
    'mep_rappels',
    '*/15 * * * *',
    $cron$
    select net.http_post(
      url     := 'https://juvtrzlrqhwexddxieak.supabase.co/functions/v1/rappels',
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        -- Relu au coffre-fort à CHAQUE exécution : changer le secret ne
        -- demande donc pas de reprogrammer la tâche.
        'x-rappels-secret', (select decrypted_secret from vault.decrypted_secrets
                              where name = 'rappels_cron_secret')
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
    $cron$
  );
end
$$;
