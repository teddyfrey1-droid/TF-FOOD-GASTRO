-- =====================================================================
-- L'état des stocks, pour toute l'équipe
--
-- Après un comptage, l'application ne montrait que ce qu'il RESTE À
-- FAIRE. Or la question posée au passe est souvent l'autre : « il y a
-- combien de saumon, au juste ? ». Faute de réponse, on redescendait
-- vérifier au frigo — ou on produisait dans le doute.
--
-- Cette fonction rend les quantités relevées, produit par produit, zone
-- par zone. Ce sont des chiffres que l'équipe a saisis elle-même : ils
-- lui reviennent.
--
-- ⚠️ CE QUI NE SORT PAS : ni cible, ni minimum, ni seuil critique, ni
-- chiffre d'affaires. L'état est calculé EN BASE et ne ressort que sous
-- forme de mot — « rupture », « juste », « ok », « surplus ». Un salarié
-- apprend qu'il y a trop de saumon, jamais à partir de quel nombre.
--
-- Le surplus, lui, est rendu en clair : c'est la quantité à surveiller,
-- et elle n'apprend rien de plus que `qty_to_produce` du rapport de
-- production, déjà connue de tous depuis le premier jour.
-- =====================================================================
create or replace function public.mep_etat_stock(p_session_id uuid)
returns table (
  product_id    uuid,
  product_name  text,
  category_name text,
  image_url     text,
  unit          public.product_unit,
  qty_saladbar  numeric,
  qty_fridge    numeric,
  qty_total     numeric,
  in_saladbar   boolean,
  in_fridge     boolean,
  etat          text,
  surplus       numeric
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_date date;
begin
  select s.date into v_date from public.count_sessions s where s.id = p_session_id;

  if v_date is null then
    raise exception 'Comptage introuvable.' using errcode = 'no_data_found';
  end if;

  -- Même règle de visibilité que partout ailleurs : l'encadrement voit
  -- tout l'historique, l'équipe voit la journée en cours.
  if auth.uid() is not null
     and not public.is_staff_lead()
     and not (public.is_active_user() and v_date = current_date) then
    raise exception 'Ce comptage ne vous est pas accessible.' using errcode = '42501';
  end if;

  return query
  select
    cl.product_id,
    p.name,
    c.name,
    p.image_url,
    p.unit,
    cl.qty_saladbar,
    cl.qty_fridge,
    cl.qty_total,
    p.in_saladbar,
    p.in_fridge,
    case
      when cl.is_not_applicable          then 'absent'
      when cl.deferred_at is not null    then 'reporte'
      -- Les repères sont figés à la validation. Avant elle, on ne sait
      -- rien dire d'autre que la quantité : l'état reste neutre.
      when cl.target_snapshot is null    then 'ok'
      when cl.crit_snapshot is not null
       and cl.qty_total <= cl.crit_snapshot then 'rupture'
      when cl.min_snapshot is not null
       and cl.qty_total <  cl.min_snapshot  then 'juste'
      when cl.qty_total >  cl.target_snapshot then 'surplus'
      else 'ok'
    end,
    case
      when cl.is_not_applicable or cl.deferred_at is not null then 0
      when cl.target_snapshot is not null and cl.qty_total > cl.target_snapshot
        then cl.qty_total - cl.target_snapshot
      else 0
    end
  from public.count_lines cl
  join public.products p           on p.id = cl.product_id
  join public.product_categories c on c.id = p.category_id
  where cl.session_id = p_session_id
    and p.is_active
  order by c.sort_order, p.name;
end;
$$;

revoke all on function public.mep_etat_stock(uuid) from public, anon;
grant execute on function public.mep_etat_stock(uuid) to authenticated;

comment on function public.mep_etat_stock(uuid) is
  'Quantités relevées et état par produit. Ne renvoie ni cible, ni seuil, ni CA.';
