-- =====================================================================
-- Contrôle d'accès : qui a le droit de quoi
--
-- Jusqu'ici, chaque droit était écrit en dur dans une fonction. Ouvrir
-- l'historique à l'assistant manager demandait une migration ; le
-- directeur, lui, n'avait aucun moyen de décider.
--
-- Ce qui devient réglable, et ce qui ne le sera jamais :
--
--   RÉGLABLE — des accès à des ÉCRANS. Le directeur ouvre ou ferme,
--   selon la confiance qu'il accorde et l'organisation de son
--   restaurant.
--
--   JAMAIS RÉGLABLE — le chiffre d'affaires, les cibles de production et
--   la gestion des comptes. C'est la règle fondatrice de l'application :
--   un salarié ne voit ni le CA, ni les objectifs. Aucun interrupteur ne
--   doit pouvoir l'annuler par mégarde, et la base n'en propose donc
--   aucun. Le directeur et le propriétaire ont TOUJOURS tous les droits :
--   personne ne peut se verrouiller dehors.
-- =====================================================================

create table if not exists public.role_permissions (
  permission text              not null,
  role       public.user_role  not null,
  allowed    boolean           not null default false,
  updated_at timestamptz       not null default now(),
  primary key (permission, role),

  -- La liste blanche vit dans la contrainte : une paire hors catalogue
  -- ne peut pas entrer en base, même par une écriture directe.
  constraint role_permissions_catalogue check (
    (permission = 'historique'     and role in ('assistant_manager', 'employee'))
    or (permission = 'ruptures'    and role in ('assistant_manager', 'employee'))
    or (permission = 'annuler_autrui' and role in ('assistant_manager', 'employee'))
    or (permission = 'stocks_passes'  and role in ('assistant_manager', 'employee'))
    -- Le simulateur affiche les cibles : jamais pour un salarié.
    or (permission = 'simulateur'  and role = 'assistant_manager')
    or (permission = 'carte'       and role = 'assistant_manager')
  )
);

comment on table public.role_permissions is
  'Droits réglables par rôle. Directeur et propriétaire ont tout, hors table.';

alter table public.role_permissions enable row level security;

revoke all on table public.role_permissions from public, anon, authenticated;
grant select on table public.role_permissions to authenticated;

drop policy if exists "Chacun lit les droits" on public.role_permissions;
create policy "Chacun lit les droits"
  on public.role_permissions
  for select
  to authenticated
  using (public.is_active_user());

-- Les valeurs initiales reproduisent EXACTEMENT le comportement actuel :
-- activer ce contrôle d'accès ne doit rien changer tant que personne n'y
-- touche.
insert into public.role_permissions (permission, role, allowed) values
  ('historique',     'assistant_manager', true),
  ('historique',     'employee',          false),
  ('stocks_passes',  'assistant_manager', true),
  ('stocks_passes',  'employee',          false),
  ('annuler_autrui', 'assistant_manager', true),
  ('annuler_autrui', 'employee',          false),
  ('ruptures',       'assistant_manager', false),
  ('ruptures',       'employee',          false),
  ('simulateur',     'assistant_manager', false),
  ('carte',          'assistant_manager', false)
on conflict (permission, role) do nothing;

-- ---------------------------------------------------------------------
-- Le juge de paix : l'appelant a-t-il ce droit ?
--
-- Directeur et propriétaire : toujours oui, sans consulter la table.
-- C'est ce qui rend l'écran de réglage inoffensif — aucune combinaison
-- d'interrupteurs ne peut fermer la porte à celui qui les actionne.
-- ---------------------------------------------------------------------
create or replace function public.mep_a_le_droit(p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role    public.user_role;
  v_allowed boolean;
begin
  if not public.is_active_user() then
    return false;
  end if;

  v_role := public.current_user_role();

  if v_role in ('manager', 'owner') then
    return true;
  end if;

  select allowed into v_allowed
  from public.role_permissions
  where permission = p_permission and role = v_role;

  return coalesce(v_allowed, false);
end;
$$;

revoke all on function public.mep_a_le_droit(text) from public, anon;
grant execute on function public.mep_a_le_droit(text) to authenticated;

comment on function public.mep_a_le_droit(text) is
  'Vrai si l''appelant a ce droit. Directeur et propriétaire : toujours vrai.';

-- ---------------------------------------------------------------------
-- Régler un droit. Le directeur seul, et seulement dans le catalogue.
-- ---------------------------------------------------------------------
create or replace function public.mep_regler_droit(
  p_permission text,
  p_role       public.user_role,
  p_allowed    boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Seul le directeur peut changer les droits.'
      using errcode = '42501';
  end if;

  -- Un droit hors catalogue ferait échouer la contrainte avec un message
  -- illisible : on répond nous-mêmes, en français.
  if not exists (
    select 1 from public.role_permissions
    where permission = p_permission and role = p_role
  ) then
    raise exception 'Ce droit ne se règle pas pour ce statut.'
      using errcode = '23514';
  end if;

  update public.role_permissions
  set allowed = p_allowed, updated_at = now()
  where permission = p_permission and role = p_role;
end;
$$;

revoke all on function public.mep_regler_droit(text, public.user_role, boolean) from public, anon;
grant execute on function public.mep_regler_droit(text, public.user_role, boolean) to authenticated;

comment on function public.mep_regler_droit(text, public.user_role, boolean) is
  'Ouvre ou ferme un droit pour un statut. Directeur uniquement.';

-- ---------------------------------------------------------------------
-- `is_staff_lead` consulte désormais le tableau.
--
-- C'est le prédicat qui décide, partout, de l'accès aux journées
-- passées : politiques RLS des comptages, historique, détail d'un
-- relevé, stocks d'un autre jour. Le redéfinir ici évite de réécrire une
-- douzaine de fonctions — et évite surtout que l'une d'elles soit
-- oubliée et continue d'appliquer l'ancienne règle.
--
-- Le directeur et le propriétaire restent en dur : aucun réglage ne peut
-- les exclure.
-- ---------------------------------------------------------------------
create or replace function public.is_staff_lead()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  if not public.is_active_user() then
    return false;
  end if;

  v_role := public.current_user_role();

  if v_role in ('manager', 'owner') then
    return true;
  end if;

  return public.mep_a_le_droit('historique');
end;
$$;

revoke all on function public.is_staff_lead() from public, anon;
grant execute on function public.is_staff_lead() to authenticated;

comment on function public.is_staff_lead() is
  'Accès aux journées passées. Réglable pour l''assistant manager et le salarié.';

-- ---------------------------------------------------------------------
-- L'analyse des ruptures suit le même chemin.
--
-- Le corps est repris TEL QUEL de la fonction existante : seule la garde
-- change. Réécrire une requête d'agrégation de mémoire pour changer une
-- ligne d'autorisation, c'est le meilleur moyen d'introduire un bogue
-- silencieux dans un chiffre que personne ne recalcule à la main.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mep_stockout_history(d_from date, d_to date)
 RETURNS TABLE(product_id uuid, product_name text, category_name text, unit product_unit, sessions_count integer, critical_count integer, empty_count integer, reorder_count integer, avg_coverage numeric, base_qty numeric, priority integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.mep_a_le_droit('ruptures') then
    raise exception 'Analyse des ruptures réservée au directeur.' using errcode = '42501';
  end if;

  if d_to < d_from or d_to - d_from > 400 then
    raise exception 'Plage de dates invalide.' using errcode = '22023';
  end if;

  return query
  select
    p.id, p.name, c.name, p.unit,
    count(*)::int,
    -- Un comptage « critique » : le stock relevé était sous le seuil figé
    -- ce jour-là. On relit le snapshot, jamais le seuil d'aujourd'hui —
    -- sinon changer un réglage réécrirait le passé.
    count(*) filter (where cl.crit_snapshot is not null
                       and cl.qty_total < cl.crit_snapshot)::int,
    count(*) filter (where cl.qty_total = 0)::int,
    count(*) filter (where coalesce(cl.production_needed_snapshot, 0) > 0)::int,
    round(avg(case when cl.target_snapshot > 0
                   then cl.qty_total / cl.target_snapshot end), 3),
    p.base_qty,
    p.priority
  from public.count_lines cl
  join public.count_sessions s     on s.id = cl.session_id
  join public.products p           on p.id = cl.product_id
  join public.product_categories c on c.id = p.category_id
  where s.date between d_from and d_to
    and s.status = 'submitted'
    and not cl.is_not_applicable
    and cl.deferred_at is null
    and cl.counted_at is not null
  group by p.id, p.name, c.name, p.unit, p.base_qty, p.priority
  having count(*) > 0
  order by
    -- Les plus souvent en rupture d'abord : ce sont eux dont la base est
    -- probablement sous-évaluée.
    (count(*) filter (where cl.crit_snapshot is not null
                       and cl.qty_total < cl.crit_snapshot))::numeric
      / greatest(count(*), 1) desc,
    p.name;
end;
$function$;

revoke all on function public.mep_stockout_history(date, date) from public, anon;
grant execute on function public.mep_stockout_history(date, date) to authenticated;

comment on function public.mep_stockout_history(date, date) is
  'Produits qui manquent trop souvent. Droit « ruptures », réglable.';
