-- =====================================================================
-- MEP — Référentiel produits
--
-- `base_qty` = quantité à avoir PAR TRANCHE DE 1 000 € de chiffre
-- d'affaires. C'est la seule donnée qui pilote la cible : à 1 500 €, une
-- base de 4 donne 6. Les valeurs de la mise en place sont celles du Google
-- Sheet ramenées à cette échelle (le Sheet les exprimait pour 2 000 €).
--
-- ⚠️ La colonne « conso/1000 » du Sheet n'est PAS importée : elle vaut la
-- base divisée par deux et fausserait le calcul du minimum.
--
-- Valeurs volontairement laissées vides, à saisir dans le back-office :
--   • priority       : tous à 3. Le restaurant saisira les vraies priorités.
--   • floor_qty      : aucun plancher.
--   • ceiling_qty    : aucun plafond.
--   • prep_time_min  : hors périmètre v1.
--
-- La DLC est stockée dans `shelf_life_label` mais n'entre dans aucun calcul.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Catégories
-- ---------------------------------------------------------------------
insert into public.product_categories (name, sort_order) values
  ('Protéines',   10),
  ('Ingrédients', 20),
  ('Les plus',    30),
  ('Desserts',    40)
on conflict (name) do update set sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- Produits — 37 articles
--
-- « Pastèque » figure deux fois, volontairement : une fois en ingrédient
-- (comptée au gastro) et une fois en dessert (comptée à la pièce). Ce sont
-- deux articles distincts, à ne pas fusionner.
-- ---------------------------------------------------------------------
insert into public.products (
  name, category_id, family, unit, base_qty,
  count_step, min_mode, min_divisor, priority,
  shelf_life_label, in_saladbar, in_fridge, sort_order
)
select
  d.name, c.id, d.family::public.product_family, d.unit::public.product_unit, d.base_qty,
  1, 'auto', 2, 3,
  nullif(d.shelf_life, ''),
  -- Tout est au saladbar ; seuls les desserts n'ont pas de doublon au frigo
  -- du bas. Les relever en bas ferait perdre un passage devant une étagère
  -- où ils ne se trouvent pas.
  true, d.category <> 'Desserts', d.sort_order
from (values
  -- ---- Mise en place · Protéines ----
  ('Poulet Mayo',          'Protéines',   'mise_en_place', 'gastro',  0.4, 'J+1',  10),
  ('Protéine végétale',    'Protéines',   'mise_en_place', 'gastro', 0.15, 'J+4',  20),
  ('Saumon',               'Protéines',   'mise_en_place', 'gastro',  2.3, 'J+1',  30),
  ('Thon',                 'Protéines',   'mise_en_place', 'gastro',  0.2, 'J+1',  40),
  ('Crevette',             'Protéines',   'mise_en_place', 'gastro',  0.3, 'J+2',  50),
  ('Poulet Crispy',        'Protéines',   'mise_en_place', 'gastro',  1.5, 'J',    60),
  ('Effiloché de porc',    'Protéines',   'mise_en_place', 'gastro',  0.3, '',     70),

  -- ---- Mise en place · Ingrédients ----
  ('Edamame',              'Ingrédients', 'mise_en_place', 'gastro',  2.3, 'J+2',  10),
  ('Concombre',            'Ingrédients', 'mise_en_place', 'gastro',  2.5, 'J+2',  20),
  ('Avocat',               'Ingrédients', 'mise_en_place', 'gastro',  2.4, 'J+1',  30),
  ('Carotte',              'Ingrédients', 'mise_en_place', 'gastro', 2.05, 'J+2',  40),
  ('Mangue',               'Ingrédients', 'mise_en_place', 'gastro',  1.9, 'J+2',  50),
  ('Guacamole',            'Ingrédients', 'mise_en_place', 'gastro',  0.5, 'J+1',  60),
  ('Feta',                 'Ingrédients', 'mise_en_place', 'gastro',  0.4, 'J+2',  70),
  ('Quinoa',               'Ingrédients', 'mise_en_place', 'gastro', 1.25, '',     80),
  ('Creamy citron',        'Ingrédients', 'mise_en_place', 'gastro',  0.9, '',     90),
  ('Creamy thon',          'Ingrédients', 'mise_en_place', 'gastro', 0.85, '',    100),
  ('Pastèque',             'Ingrédients', 'mise_en_place', 'gastro',  0.2, 'J+2', 110),
  ('Coleslaw',             'Ingrédients', 'mise_en_place', 'gastro',  0.6, '',    120),
  ('Chou blanc',           'Ingrédients', 'mise_en_place', 'gastro', 0.35, 'J+2', 130),
  ('Chou japonais',        'Ingrédients', 'mise_en_place', 'gastro', 1.35, '',    140),
  ('Chou rouge',           'Ingrédients', 'mise_en_place', 'gastro',  1.5, '',    150),
  ('Épinard',              'Ingrédients', 'mise_en_place', 'gastro',  1.5, 'J+2', 160),
  ('Poivrons',             'Ingrédients', 'mise_en_place', 'gastro',  0.5, 'J+2', 170),

  -- ---- Les plus (comptés à la pièce) ----
  ('Gyoza Poulet',         'Les plus',    'les_plus',      'piece',   4.8, '',     10),
  ('Gyoza Légume',         'Les plus',    'les_plus',      'piece',   1.6, '',     20),
  ('Bao',                  'Les plus',    'les_plus',      'piece',   1.7, '',     30),

  -- ---- Desserts ----
  -- On compte la BASE, pas le bowl assemblé : Sunny, Daily et Berry Bowl
  -- se montent à la commande à partir de l'açaï et du pudding chia. La base
  -- de l'açaï (1,7) est la somme des trois bowls qu'il remplace — un point
  -- de départ, à corriger après une semaine d'observation.
  ('Açaï',                 'Desserts',    'les_plus',      'piece',   1.7, '',      5),
  ('Pastèques',            'Desserts',    'les_plus',      'piece',   0.6, '',     40),
  ('Melon',                'Desserts',    'les_plus',      'piece',   0.3, '',     50),
  ('Ananas',               'Desserts',    'les_plus',      'piece',   0.3, '',     60),
  ('Tiramisu Oreo',        'Desserts',    'les_plus',      'piece',   1.4, '',     70),
  ('Tiramisu Jap',         'Desserts',    'les_plus',      'piece',   1.1, '',     80),
  ('Brookie',              'Desserts',    'les_plus',      'piece',   0.3, '',     90),
  ('Cœur coulant',         'Desserts',    'les_plus',      'piece',   0.1, '',    100),
  ('Pudding chia',         'Desserts',    'les_plus',      'piece',   2.9, '',      6),
  ('Nachos',               'Desserts',    'les_plus',      'piece',   0.3, '',    120)
) as d(name, category, family, unit, base_qty, shelf_life, sort_order)
join public.product_categories c on c.name = d.category
on conflict (name) do update set
  family           = excluded.family,
  unit             = excluded.unit,
  base_qty         = excluded.base_qty,
  shelf_life_label = excluded.shelf_life_label,
  category_id      = excluded.category_id,
  sort_order       = excluded.sort_order;

commit;
