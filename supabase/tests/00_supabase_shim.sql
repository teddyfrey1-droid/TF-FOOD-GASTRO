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
