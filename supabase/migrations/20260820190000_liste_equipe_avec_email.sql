-- =====================================================================
-- La liste d'équipe montre les adresses — au directeur seulement
--
-- L'écran Équipe doit pouvoir envoyer un lien d'activation, donc connaître
-- l'adresse de chacun. Or `profiles` ne la porte pas : elle vit dans
-- `auth.users`, hors d'atteinte d'un client applicatif.
--
-- Une adresse e-mail est une donnée personnelle : elle ne sort donc que
-- pour un directeur ou le propriétaire, jamais pour un employé ni même
-- pour un assistant manager, qui n'a pas à gérer les comptes.
-- =====================================================================
create or replace function public.mep_equipe()
returns table (
  id        uuid,
  full_name text,
  email     text,
  role      public.user_role,
  is_active boolean,
  derniere_connexion timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_manager() then
    raise exception 'La liste des comptes est réservée au directeur.'
      using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, u.email::text, p.role, p.is_active, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.is_active desc, p.full_name;
end;
$$;

revoke all on function public.mep_equipe() from public, anon;
grant execute on function public.mep_equipe() to authenticated;

comment on function public.mep_equipe() is
  'Liste des comptes avec leur adresse. Réservée au directeur et au propriétaire.';
