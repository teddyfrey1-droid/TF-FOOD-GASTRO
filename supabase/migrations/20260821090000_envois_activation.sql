-- =====================================================================
-- Les envois de liens d'activation sont comptés — 2 par heure
--
-- Le service de courriel intégré à Supabase plafonne à deux messages par
-- heure, pour l'ensemble du projet. Au-delà il répond 429 sans rien
-- envoyer : vu de l'écran Équipe, le lien « part » et n'arrive jamais.
--
-- On tient donc le compte nous-mêmes, AVANT d'appeler Supabase. Le
-- directeur voit alors ce qui se passe réellement — « prochain envoi
-- possible à 21h13 » — au lieu d'un silence.
-- =====================================================================

create table if not exists public.activation_email_sends (
  id       uuid primary key default gen_random_uuid(),
  email    text        not null,
  sent_by  uuid        not null references auth.users (id) on delete cascade,
  sent_at  timestamptz not null default now()
);

comment on table public.activation_email_sends is
  'Un envoi de lien d''activation. Sert à tenir le quota de 2 par heure.';

create index if not exists activation_email_sends_sent_at_idx
  on public.activation_email_sends (sent_at desc);

alter table public.activation_email_sends enable row level security;

-- Aucune écriture directe : tout passe par les deux fonctions ci-dessous.
revoke all on table public.activation_email_sends from public, anon, authenticated;
grant select on table public.activation_email_sends to authenticated;

drop policy if exists "Le directeur lit l'historique des envois"
  on public.activation_email_sends;
create policy "Le directeur lit l'historique des envois"
  on public.activation_email_sends
  for select
  to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------------
-- Réserve un créneau d'envoi, ou refuse en disant quand réessayer.
--
-- La réservation est prise AVANT l'appel à Supabase : deux directeurs qui
-- cliquent en même temps ne peuvent pas passer tous les deux. Si l'envoi
-- échoue ensuite, `mep_annuler_envoi_activation` rend le créneau.
-- ---------------------------------------------------------------------
create or replace function public.mep_reserver_envoi_activation(p_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  quota    constant int := 2;
  recents  int;
  libre_a  timestamptz;
  nouvelle uuid;
begin
  if not public.is_manager() then
    raise exception 'Seul le directeur peut envoyer un lien d''activation.'
      using errcode = '42501';
  end if;

  -- Verrou : sérialise les réservations concurrentes sans bloquer le reste
  -- de la base. La clé est arbitraire, elle ne sert qu'à cette file.
  perform pg_advisory_xact_lock(hashtext('mep_envoi_activation'));

  select count(*), min(sent_at) + interval '1 hour'
    into recents, libre_a
  from public.activation_email_sends
  where sent_at > now() - interval '1 hour';

  if recents >= quota then
    raise exception
      'Déjà % liens envoyés cette heure-ci (le maximum). Prochain envoi possible à %.',
      quota,
      to_char(libre_a at time zone 'Europe/Paris', 'HH24"h"MI')
      using errcode = '53400';
  end if;

  insert into public.activation_email_sends (email, sent_by)
  values (p_email, auth.uid())
  returning id into nouvelle;

  return nouvelle;
end;
$$;

revoke all on function public.mep_reserver_envoi_activation(text) from public, anon;
grant execute on function public.mep_reserver_envoi_activation(text) to authenticated;

comment on function public.mep_reserver_envoi_activation(text) is
  'Réserve un des 2 créneaux d''envoi horaires. Réservé au directeur.';

-- ---------------------------------------------------------------------
-- Rend un créneau quand l'envoi a finalement échoué.
--
-- Sans cela, un refus de Supabase consommerait quand même le quota : le
-- directeur attendrait une heure pour un courriel jamais parti.
-- ---------------------------------------------------------------------
create or replace function public.mep_annuler_envoi_activation(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Seul le directeur peut annuler un envoi.'
      using errcode = '42501';
  end if;

  delete from public.activation_email_sends
  where id = p_id and sent_by = auth.uid();
end;
$$;

revoke all on function public.mep_annuler_envoi_activation(uuid) from public, anon;
grant execute on function public.mep_annuler_envoi_activation(uuid) to authenticated;

comment on function public.mep_annuler_envoi_activation(uuid) is
  'Rend le créneau réservé quand l''envoi a échoué. Réservé au directeur.';
