-- =====================================================================
-- Shim Supabase pour les tests locaux.
--
-- Recrée le strict nécessaire de la plateforme Supabase (schéma auth,
-- auth.uid(), rôles anon / authenticated / service_role) afin de faire
-- tourner les migrations et les tests RLS sur un Postgres nu.
--
-- Ce fichier N'EST PAS une migration : il n'est jamais appliqué en production.
-- =====================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  -- ⚠️ GÉNÉRÉE, comme chez Supabase. Elle figure ici précisément pour que
  -- toute tentative de l'écrire échoue AUSSI en test : sans elle, une
  -- migration qui la renseigne passe en local et casse en production.
  confirmed_at       timestamptz generated always as
                       (least(email_confirmed_at, phone_confirmed_at)) stored,
  created_at         timestamptz not null default now()
);

-- Reproduit le comportement Supabase : l'identité vient des claims JWT
-- injectés dans la configuration de la session.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase accorde par défaut les droits de table aux rôles applicatifs ;
-- c'est la RLS, et elle seule, qui filtre ensuite les lignes.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Coffre-fort Supabase (`vault`)
--
-- Reproduit la SURFACE de l'extension, pas son chiffrement : les valeurs
-- sont stockées en clair. C'est volontaire — le harnais sert à vérifier
-- que les fonctions lisent le bon secret et que personne d'autre n'y
-- accède, pas à éprouver la cryptographie de Supabase.
-- ---------------------------------------------------------------------
create schema if not exists vault;

create table if not exists vault.secrets (
  id          uuid primary key default gen_random_uuid(),
  name        text unique,
  description text,
  secret      text not null,
  created_at  timestamptz not null default now()
);

create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at
  from vault.secrets;

create or replace function vault.create_secret(
  new_secret text,
  new_name text default null,
  new_description text default ''
)
returns uuid
language sql
as $$
  insert into vault.secrets (secret, name, description)
  values (new_secret, new_name, new_description)
  returning id;
$$;
