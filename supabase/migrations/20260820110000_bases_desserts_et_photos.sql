-- =====================================================================
-- Les bases plutôt que les bowls finis, et une photo par produit
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Desserts : on compte la BASE, pas le bowl assemblé
--
-- Sunny Bowl, Daily Bowl et Berry Bowl sont des recettes assemblées à la
-- commande. Ce qui manque en service, ce n'est jamais « un Berry Bowl » :
-- c'est l'açaï ou le pudding chia dont il est fait. Compter le produit
-- fini revenait à compter trois fois le même stock.
--
-- Les trois articles sont DÉSACTIVÉS, pas supprimés : les comptages
-- passés les référencent, et l'historique doit rester lisible.
-- ---------------------------------------------------------------------
update public.products
set is_active = false
where name in ('Sunny Bowl', 'Daily Bowl', 'Berry Bowl');

-- L'açaï prend la place des trois bowls. Sa base est la somme des leurs
-- (0,4 + 0,3 + 1,0 = 1,7) : c'est un POINT DE DÉPART, à corriger depuis
-- la fiche produit dès la première semaine d'observation.
insert into public.products (
  name, category_id, family, unit, base_qty,
  count_step, min_mode, min_divisor, priority,
  in_saladbar, in_fridge, sort_order
)
select 'Açaï', c.id, 'les_plus', 'piece', 1.7, 1, 'auto', 2, 3, true, true, 5
from public.product_categories c
where c.name = 'Desserts'
  and not exists (select 1 from public.products p where p.name = 'Açaï');

-- « Pudding chia » existe déjà avec sa propre base : c'est bien la base
-- du pudding chia bowl, rien à créer.
update public.products set sort_order = 6 where name = 'Pudding chia';

-- ---------------------------------------------------------------------
-- 2. Une photo par produit
--
-- Reconnaître « Chou japonais » d'un coup d'œil est plus rapide que le
-- lire, surtout sur une liste de trente-neuf lignes. À défaut de photo,
-- l'écran retombe sur une vignette illustrée côté application : la
-- colonne peut donc rester vide sans rien casser.
-- ---------------------------------------------------------------------
alter table public.products add column if not exists image_url text;

comment on column public.products.image_url is
  'Photo du produit. Vide : l''application affiche une vignette illustrée à la place.';

-- La vue de comptage la transporte. Une photo ne révèle ni base, ni
-- cible, ni chiffre d'affaires : elle peut être vue de tous.
create or replace view public.products_for_count
with (security_invoker = false) as
select
  p.id,
  p.name,
  p.category_id,
  p.unit,
  p.count_step,
  p.in_saladbar,
  p.in_fridge,
  p.sort_order,
  p.notes,
  p.image_url
from public.products p
where p.is_active
  -- Un compte en attente de validation ne lit même pas la liste des produits.
  and (public.is_active_user() or public.is_manager());

revoke all on public.products_for_count from public;
grant select on public.products_for_count to authenticated;
