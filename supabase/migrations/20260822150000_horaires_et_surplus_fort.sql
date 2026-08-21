-- =====================================================================
-- Les horaires d'ouverture des comptages, et le surplus qui dérape
--
-- 1. UN COMPTAGE A UNE HEURE.
--
--    Le comptage de l'après-midi se fait après le service du midi. Rien
--    n'empêchait de l'ouvrir à 9 h du matin — et un comptage lancé trop
--    tôt décrit des frigos qui n'ont pas encore vécu la journée.
--
--    Les heures existaient déjà, pour les rappels. Elles vivent dans
--    `revenue_settings`, que la RLS réserve au directeur : l'équipe ne
--    pouvait donc pas savoir à quelle heure son propre travail commence.
--    Cette fonction les lui rend — un horaire de service n'a rien de
--    confidentiel, contrairement à tout le reste de cette table.
--
-- 2. TROP, ET BEAUCOUP TROP.
--
--    Deux saumons au-dessus de la cible se rattrapent au service du
--    soir. Le double de la cible, non : c'est un bac entier qui finira à
--    la poubelle. Les deux méritent un signal différent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Les heures d'ouverture, lisibles par toute l'équipe.
-- ---------------------------------------------------------------------
create or replace function public.mep_heures_comptage()
returns table (morning time, afternoon time)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception 'Compte inactif.' using errcode = '42501';
  end if;

  return query
  select morning_reminder_time, afternoon_reminder_time
  from public.revenue_settings
  where id;
end;
$$;

revoke all on function public.mep_heures_comptage() from public, anon;
grant execute on function public.mep_heures_comptage() to authenticated;

comment on function public.mep_heures_comptage() is
  'Heures d''ouverture des deux comptages. Lisibles par toute l''équipe active.';

-- ---------------------------------------------------------------------
-- Les régler : réservé au directeur, comme tout réglage de production.
-- ---------------------------------------------------------------------
create or replace function public.mep_regler_heures_comptage(
  p_morning   time,
  p_afternoon time
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_manager() then
    raise exception 'Seul le directeur peut changer les horaires.'
      using errcode = '42501';
  end if;

  if p_afternoon <= p_morning then
    -- Contrainte de cohérence, donc `check_violation` : c'est la classe
    -- d'erreur que le reste du harnais reconnaît comme un refus légitime.
    raise exception 'Le comptage de l''après-midi doit venir après celui du matin.'
      using errcode = '23514';
  end if;

  update public.revenue_settings
  set morning_reminder_time   = p_morning,
      afternoon_reminder_time = p_afternoon
  where id;
end;
$$;

revoke all on function public.mep_regler_heures_comptage(time, time) from public, anon;
grant execute on function public.mep_regler_heures_comptage(time, time) to authenticated;

comment on function public.mep_regler_heures_comptage(time, time) is
  'Change les heures d''ouverture des comptages. Directeur uniquement.';

-- ---------------------------------------------------------------------
-- L'état des stocks distingue désormais « trop » de « beaucoup trop ».
--
-- Le seuil est à la moitié de la cible en plus : au-delà, ce n'est plus
-- un ajustement de fin de service, c'est une production à revoir.
-- ---------------------------------------------------------------------
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
      when cl.target_snapshot is null    then 'ok'
      when cl.crit_snapshot is not null
       and cl.qty_total <= cl.crit_snapshot then 'rupture'
      when cl.min_snapshot is not null
       and cl.qty_total <  cl.min_snapshot  then 'juste'
      -- Une cible à zéro n'a pas de « moitié en plus » qui veuille dire
      -- quelque chose : tout dépassement y est déjà maximal.
      when cl.target_snapshot > 0
       and cl.qty_total >= cl.target_snapshot * 1.5 then 'surplus_fort'
      when cl.target_snapshot = 0 and cl.qty_total > 0 then 'surplus_fort'
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
