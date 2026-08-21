-- =====================================================================
-- Un troisième rangement : le frigo desserts
--
-- Les desserts étaient marqués « saladbar », faute de mieux. Ils vivent
-- pourtant dans leur propre frigo : l'employé les cherchait au milieu
-- des ingrédients, et le compteur du saladbar annonçait neuf produits
-- qui ne s'y trouvaient pas.
--
-- Trois zones plutôt que deux, donc — et le comptage se fait en trois
-- passes, chacune devant son meuble.
--
-- ⚠️ `qty_total` est une colonne GÉNÉRÉE : son expression ne se modifie
-- pas, il faut la reconstruire. Aucune vue n'en dépend (vérifié), et la
-- table est petite : la réécriture est sans risque. Les valeurs déjà
-- enregistrées sont recalculées à l'identique, `qty_desserts` valant
-- zéro partout au moment de la bascule.
-- =====================================================================

alter table public.products
  add column if not exists in_desserts boolean not null default false;

comment on column public.products.in_desserts is
  'Le produit est rangé dans le frigo à desserts.';

-- La contrainte « rangé quelque part » ne connaissait que deux meubles :
-- déplacer les desserts l'aurait violée. Elle doit accepter la troisième
-- zone AVANT que les produits déménagent.
alter table public.products drop constraint if exists products_stored_somewhere;
alter table public.products
  add constraint products_stored_somewhere
  check (in_saladbar or in_fridge or in_desserts);

alter table public.count_lines
  add column if not exists qty_desserts numeric(10, 3) not null default 0
    check (qty_desserts >= 0),
  add column if not exists counted_desserts_at timestamptz;

comment on column public.count_lines.counted_desserts_at is
  'Horodatage du relevé au frigo desserts. NULL = zone pas encore comptée.';

alter table public.count_lines drop column qty_total;
alter table public.count_lines
  add column qty_total numeric(10, 3)
    generated always as (qty_saladbar + qty_fridge + qty_desserts) stored;

comment on column public.count_lines.qty_total is
  'Somme des trois zones. Générée : personne ne l''écrit à la main.';

-- ---------------------------------------------------------------------
-- Les droits d'écriture suivent, colonne par colonne.
--
-- La table n'a jamais de droit d'écriture global : chaque colonne est
-- accordée nommément, et les colonnes de repères (cible, minimum, seuil)
-- restent hors de portée de l'équipe.
-- ---------------------------------------------------------------------
grant update (qty_desserts, counted_desserts_at) on public.count_lines to authenticated;
grant select (qty_desserts, counted_desserts_at, qty_total) on public.count_lines to authenticated;

-- La vue de comptage doit annoncer la nouvelle zone, sinon l'écran ne
-- saura pas où ranger le produit.
--
-- `create or replace` refuse d'insérer une colonne au milieu : on la
-- reconstruit. Rien n'en dépend, et les droits sont réattribués juste
-- après.
drop view if exists public.products_for_count;
create view public.products_for_count
with (security_invoker = false) as
  select id, name, category_id, unit, count_step,
         in_saladbar, in_fridge, in_desserts,
         sort_order, notes, image_url
  from public.products p
  where is_active and (public.is_active_user() or public.is_manager());

grant select on public.products_for_count to authenticated;

-- ---------------------------------------------------------------------
-- Les desserts déménagent.
--
-- Ils quittent le saladbar : c'est bien un déplacement, pas un ajout.
-- Les laisser dans les deux ferait compter chaque dessert deux fois.
-- ---------------------------------------------------------------------
update public.products p
set in_desserts = true,
    in_saladbar = false,
    in_fridge   = false
from public.product_categories c
where c.id = p.category_id
  and lower(c.name) like 'dessert%';

-- ---------------------------------------------------------------------
-- Ce qui reste à relever tient compte de la troisième zone.
-- ---------------------------------------------------------------------
create or replace function public.mep_count_pending(p_session_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_date date;
  v_reste int;
begin
  select date into v_date from public.count_sessions where id = p_session_id;

  if v_date is null then
    raise exception 'Comptage introuvable.' using errcode = 'no_data_found';
  end if;

  if auth.uid() is not null
     and not public.is_staff_lead()
     and not (public.is_active_user() and v_date = current_date) then
    raise exception 'Ce comptage ne vous est pas accessible.' using errcode = '42501';
  end if;

  select count(*)::int into v_reste
  from public.count_lines cl
  join public.products p on p.id = cl.product_id
  where cl.session_id = p_session_id
    and p.is_active
    and not cl.is_not_applicable
    and cl.deferred_at is null
    and (
      (p.in_saladbar and cl.counted_saladbar_at is null)
      or (p.in_fridge and cl.counted_fridge_at is null)
      or (p.in_desserts and cl.counted_desserts_at is null)
      or (not p.in_saladbar and not p.in_fridge and not p.in_desserts
          and cl.counted_at is null)
    );

  return v_reste;
end;
$$;

revoke all on function public.mep_count_pending(uuid) from public, anon;
grant execute on function public.mep_count_pending(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- L'état des stocks rend la troisième colonne.
--
-- Le type de retour change : Postgres exige alors de supprimer d'abord.
-- ---------------------------------------------------------------------
drop function if exists public.mep_etat_stock(uuid);
create function public.mep_etat_stock(p_session_id uuid)
returns table (
  product_id    uuid,
  product_name  text,
  category_name text,
  image_url     text,
  unit          public.product_unit,
  qty_saladbar  numeric,
  qty_fridge    numeric,
  qty_desserts  numeric,
  qty_total     numeric,
  in_saladbar   boolean,
  in_fridge     boolean,
  in_desserts   boolean,
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
    cl.product_id, p.name, c.name, p.image_url, p.unit,
    cl.qty_saladbar, cl.qty_fridge, cl.qty_desserts, cl.qty_total,
    p.in_saladbar, p.in_fridge, p.in_desserts,
    case
      when cl.is_not_applicable          then 'absent'
      when cl.deferred_at is not null    then 'reporte'
      when cl.target_snapshot is null    then 'ok'
      when cl.crit_snapshot is not null
       and cl.qty_total <= cl.crit_snapshot then 'rupture'
      when cl.min_snapshot is not null
       and cl.qty_total <  cl.min_snapshot  then 'juste'
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
