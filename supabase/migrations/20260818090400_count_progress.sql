-- =====================================================================
-- MEP — Suivi de l'avancement d'un comptage
--
-- « 0 gastro » est une valeur de comptage parfaitement légitime (le produit
-- est en rupture). On ne peut donc pas déduire de la quantité si la ligne a
-- été renseignée : il faut un marqueur explicite.
--
-- C'est lui qui alimente la barre de progression « 14 / 32 produits comptés »
-- et qui conditionne l'activation du bouton « Valider le comptage ».
-- =====================================================================

alter table public.count_lines
  add column counted_at timestamptz;

comment on column public.count_lines.counted_at is
  'Horodatage de la saisie. NULL = produit pas encore compté (différent de compté à 0).';

-- Les lignes sont créées vides à l'ouverture de la session : l'employé n'a
-- donc besoin que du droit de mise à jour, jamais d'insertion.
grant update (qty_saladbar, qty_fridge, is_not_applicable, not_applicable_reason, counted_at)
  on public.count_lines to authenticated;

-- Index partiel : « combien reste-t-il à compter » est la requête la plus
-- fréquente de l'écran de saisie.
create index count_lines_pending_idx
  on public.count_lines (session_id)
  where counted_at is null;

-- ---------------------------------------------------------------------
-- Ouverture d'une session de comptage.
--
-- Crée la session du jour si elle n'existe pas, et une ligne vide par produit
-- actif. Renvoie l'identifiant de la session. SECURITY DEFINER pour pouvoir
-- lire `products` (interdite aux employés) sans rien leur en divulguer.
-- ---------------------------------------------------------------------
create or replace function public.mep_open_count_session(
  p_session public.session_kind,
  p_device_info jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_user_id    uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select id into v_session_id
  from public.count_sessions
  where date = current_date and session = p_session;

  if v_session_id is null then
    insert into public.count_sessions (date, session, user_id, device_info)
    values (current_date, p_session, v_user_id, p_device_info)
    -- Deux téléphones qui ouvrent le même comptage en même temps : le premier
    -- gagne, le second récupère la session existante plutôt qu'une erreur.
    on conflict (date, session) do nothing
    returning id into v_session_id;

    if v_session_id is null then
      select id into v_session_id
      from public.count_sessions
      where date = current_date and session = p_session;
    end if;
  end if;

  -- Une ligne par produit actif. `on conflict do nothing` rend l'appel
  -- réentrant : un produit ajouté en cours de journée apparaît au rechargement.
  insert into public.count_lines (session_id, product_id)
  select v_session_id, p.id
  from public.products p
  where p.is_active
  on conflict (session_id, product_id) do nothing;

  return v_session_id;
end;
$$;

grant execute on function public.mep_open_count_session(public.session_kind, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Temps de prépa total d'un rapport de relance (§5.6).
--
-- Compté PAR GASTRO ENTIER : 5 gastros de saumon à 6 minutes font 30 minutes.
-- La fonction ne renvoie qu'un total en minutes ; `prep_time_min`, qui est une
-- donnée de back-office, ne quitte jamais la base.
-- ---------------------------------------------------------------------
create or replace function public.mep_reorder_prep_time(p_session_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(pt.qty_to_produce * coalesce(p.prep_time_min, 0)), 0)
  from public.production_tasks pt
  join public.products p on p.id = pt.product_id
  join public.count_sessions s on s.id = pt.session_id
  where pt.session_id = p_session_id
    and not pt.is_done
    and (public.is_manager() or (s.user_id = auth.uid() and s.date = current_date));
$$;

grant execute on function public.mep_reorder_prep_time(uuid) to authenticated;
