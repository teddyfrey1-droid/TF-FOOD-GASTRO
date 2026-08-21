-- =====================================================================
-- Un code d'activation, à la place des liens par courriel
--
-- POURQUOI ABANDONNER LE LIEN.
--
-- Le lien envoyé par Supabase passe d'abord par son propre point de
-- vérification, qui CONSOMME le jeton, puis redirige vers l'« adresse du
-- site » configurée dans son tableau de bord. Cette adresse est restée
-- sur `http://localhost:3000` et nous n'avons pas la main dessus. Trois
-- conséquences, toutes observées :
--
--   • le lien mène à une machine de développement, injoignable ;
--   • les scanners antivirus des messageries ouvrent les liens avant le
--     destinataire, ce qui brûle le jeton à usage unique ;
--   • au deuxième essai, Supabase répond « lien expiré » — sans que la
--     personne ait rien fait de mal.
--
-- Un code n'a aucun de ces défauts. Il ne s'ouvre pas tout seul, il se
-- dicte au téléphone, et il ne dépend d'aucun réglage hors de portée.
--
-- CE QUI EST STOCKÉ.
--
-- Jamais le code lui-même, seulement son empreinte SHA-256, calculée
-- côté serveur applicatif. Quelqu'un qui lirait cette table n'y
-- trouverait rien d'utilisable — c'est la même discipline que pour un
-- mot de passe.
-- =====================================================================
create table if not exists public.activation_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  code_hash   text        not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  attempts    int         not null default 0,
  created_by  uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

comment on table public.activation_codes is
  'Codes d''activation à usage unique. Seule l''empreinte du code est stockée.';

create index if not exists activation_codes_hash_idx
  on public.activation_codes (code_hash) where used_at is null;

alter table public.activation_codes enable row level security;

-- Personne n'y touche depuis le navigateur. La vérification se fait
-- côté serveur, avec la clé de service : un code doit pouvoir être
-- validé par quelqu'un qui n'est justement pas encore connecté.
revoke all on table public.activation_codes from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Créer un code pour quelqu'un. Réservé au directeur.
--
-- Les codes précédents de la même personne sont invalidés : deux codes
-- valides en circulation, c'est un code de trop.
-- ---------------------------------------------------------------------
create or replace function public.mep_creer_code_activation(
  p_user_id   uuid,
  p_code_hash text,
  p_heures    int default 24
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_expire timestamptz;
begin
  if not public.is_manager() then
    raise exception 'Seul le directeur peut créer un code d''activation.'
      using errcode = '42501';
  end if;

  if p_heures < 1 or p_heures > 168 then
    raise exception 'La durée doit tenir entre une heure et une semaine.'
      using errcode = '23514';
  end if;

  update public.activation_codes
  set used_at = now()
  where user_id = p_user_id and used_at is null;

  v_expire := now() + make_interval(hours => p_heures);

  insert into public.activation_codes (user_id, code_hash, expires_at, created_by)
  values (p_user_id, p_code_hash, v_expire, auth.uid());

  return v_expire;
end;
$$;

revoke all on function public.mep_creer_code_activation(uuid, text, int) from public, anon;
grant execute on function public.mep_creer_code_activation(uuid, text, int) to authenticated;

comment on function public.mep_creer_code_activation(uuid, text, int) is
  'Crée un code d''activation et invalide les précédents. Directeur uniquement.';

-- ---------------------------------------------------------------------
-- Supprimer un compte.
--
-- La suppression efface la personne d'`auth.users` ; le profil, les
-- abonnements et les codes suivent en cascade. Les comptages qu'elle a
-- réalisés, eux, DOIVENT survivre : l'historique du restaurant ne se
-- réécrit pas parce qu'un salarié est parti.
-- ---------------------------------------------------------------------
create or replace function public.mep_peut_supprimer_compte(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if not public.is_manager() then
    raise exception 'Seul le directeur peut supprimer un compte.'
      using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'On ne supprime pas son propre compte.'
      using errcode = '23514';
  end if;

  select role into v_role from public.profiles where id = p_user_id;

  if v_role is null then
    raise exception 'Compte introuvable.' using errcode = 'no_data_found';
  end if;

  -- Le propriétaire est la racine des droits : le supprimer laisserait
  -- l'application sans personne pour en reprendre la main.
  if v_role = 'owner' and not public.is_owner() then
    raise exception 'Seul le propriétaire peut supprimer un compte propriétaire.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.mep_peut_supprimer_compte(uuid) from public, anon;
grant execute on function public.mep_peut_supprimer_compte(uuid) to authenticated;

comment on function public.mep_peut_supprimer_compte(uuid) is
  'Lève une erreur si l''appelant n''a pas le droit de supprimer ce compte.';
