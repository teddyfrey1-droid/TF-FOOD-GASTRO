-- =====================================================================
-- Créer un compte d'employé sans clé de service, et sans e-mail à cliquer
--
-- Jusqu'ici la création de comptes passait par `auth.admin.createUser`,
-- qui exige la clé de service Supabase. Cette clé doit être posée à la
-- main sur l'hébergeur, et tant qu'elle manquait l'écran « Équipe » ne
-- servait à rien — c'était le seul verrou restant avant la mise en route.
--
-- L'inscription ordinaire, elle, ne demande que la clé publique. Il lui
-- manque une seule chose : le compte naît non confirmé, et Supabase envoie
-- un e-mail de validation que l'employé doit aller chercher. Dans une
-- cuisine, cet e-mail ne sera jamais ouvert.
--
-- Cette fonction remplace ce clic. Le directeur qui crée le compte EST la
-- validation : c'est lui qui remet le mot de passe à l'employé, en main
-- propre. Confirmer l'adresse à sa place n'affaiblit donc rien — cela
-- retire une étape qui ne protégeait personne.
-- =====================================================================

create or replace function public.mep_activer_compte(
  p_user_id uuid,
  p_full_name text,
  p_role public.user_role
)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  -- Double barrière : la fonction s'exécute avec les droits de son
  -- propriétaire, donc au-dessus de la RLS. Elle doit vérifier elle-même.
  if not public.is_manager() then
    raise exception 'Seul un directeur ou le propriétaire peut activer un compte.'
      using errcode = '42501';
  end if;

  -- Seul le propriétaire fabrique un propriétaire : sinon un directeur
  -- pourrait se donner un pair, ou se faire remplacer.
  if p_role = 'owner' and not public.is_owner() then
    raise exception 'Seul le propriétaire peut nommer un propriétaire.'
      using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'Compte introuvable.' using errcode = 'P0002';
  end if;

  -- On ne confirme QUE ce qui ne l'est pas encore, et on ne touche à rien
  -- d'autre dans `auth.users` : ni mot de passe, ni adresse, ni jetons.
  -- `confirmed_at` ne s'écrit PAS : Supabase la calcule toute seule à
  -- partir de `email_confirmed_at`. Tenter de la poser fait échouer la
  -- requête entière.
  update auth.users
  set email_confirmed_at = now()
  where id = p_user_id
    and email_confirmed_at is null;

  -- Le déclencheur d'inscription a créé un profil désactivé : le directeur
  -- ayant explicitement créé ce compte, on l'active et on pose son statut.
  update public.profiles
  set full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
      role      = p_role,
      is_active = true
  where id = p_user_id;
end;
$$;

comment on function public.mep_activer_compte(uuid, text, public.user_role) is
  'Confirme l''adresse d''un compte tout juste inscrit et lui donne son statut. Réservée au directeur.';

revoke all on function public.mep_activer_compte(uuid, text, public.user_role)
  from public, anon;
grant execute on function public.mep_activer_compte(uuid, text, public.user_role)
  to authenticated;
