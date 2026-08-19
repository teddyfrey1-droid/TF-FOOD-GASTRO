-- =====================================================================
-- MEP — Référentiel produits
--
-- `base_qty` = colonne « VENTE POUR » du Google Sheet du restaurant.
-- C'est la seule donnée qui pilote la cible.
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
-- Produits — 39 articles
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
  0.5, 'auto', 2, 3,
  nullif(d.shelf_life, ''), true, true, d.sort_order
from (values
  -- ---- Mise en place · Protéines (référence 4 000 €, multiplicateur 2) ----
  ('Poulet Mayo',          'Protéines',   'mise_en_place', 'gastro', 0.8, 'J+1',  10),
  ('Protéine végétale',    'Protéines',   'mise_en_place', 'gastro', 0.3, 'J+4',  20),
  ('Saumon',               'Protéines',   'mise_en_place', 'gastro', 4.6, 'J+1',  30),
  ('Thon',                 'Protéines',   'mise_en_place', 'gastro', 0.4, 'J+1',  40),
  ('Crevette',             'Protéines',   'mise_en_place', 'gastro', 0.6, 'J+2',  50),
  ('Poulet Crispy',        'Protéines',   'mise_en_place', 'gastro', 3.0, 'J',    60),
  ('Effiloché de porc',    'Protéines',   'mise_en_place', 'gastro', 0.6, '',     70),

  -- ---- Mise en place · Ingrédients ----
  ('Edamame',              'Ingrédients', 'mise_en_place', 'gastro', 4.6, 'J+2',  10),
  ('Concombre',            'Ingrédients', 'mise_en_place', 'gastro', 5.0, 'J+2',  20),
  ('Avocat',               'Ingrédients', 'mise_en_place', 'gastro', 4.8, 'J+1',  30),
  ('Carotte',              'Ingrédients', 'mise_en_place', 'gastro', 4.1, 'J+2',  40),
  ('Mangue',               'Ingrédients', 'mise_en_place', 'gastro', 3.8, 'J+2',  50),
  ('Guacamole',            'Ingrédients', 'mise_en_place', 'gastro', 1.0, 'J+1',  60),
  ('Feta',                 'Ingrédients', 'mise_en_place', 'gastro', 0.8, 'J+2',  70),
  ('Quinoa',               'Ingrédients', 'mise_en_place', 'gastro', 2.5, '',     80),
  ('Creamy citron',        'Ingrédients', 'mise_en_place', 'gastro', 1.8, '',     90),
  ('Creamy thon',          'Ingrédients', 'mise_en_place', 'gastro', 1.7, '',    100),
  ('Pastèque',             'Ingrédients', 'mise_en_place', 'gastro', 0.4, 'J+2', 110),
  ('Coleslaw',             'Ingrédients', 'mise_en_place', 'gastro', 1.2, '',    120),
  ('Chou blanc',           'Ingrédients', 'mise_en_place', 'gastro', 0.7, 'J+2', 130),
  ('Chou japonais',        'Ingrédients', 'mise_en_place', 'gastro', 2.7, '',    140),
  ('Chou rouge',           'Ingrédients', 'mise_en_place', 'gastro', 3.0, '',    150),
  ('Épinard',              'Ingrédients', 'mise_en_place', 'gastro', 3.0, 'J+2', 160),
  ('Poivrons',             'Ingrédients', 'mise_en_place', 'gastro', 1.0, 'J+2', 170),

  -- ---- Les plus (référence 1 000 €, multiplicateur 1, comptés à la pièce) ----
  ('Gyoza Poulet',         'Les plus',    'les_plus',      'piece',  4.8, '',     10),
  ('Gyoza Légume',         'Les plus',    'les_plus',      'piece',  1.6, '',     20),
  ('Bao',                  'Les plus',    'les_plus',      'piece',  1.7, '',     30),

  -- ---- Desserts ----
  ('Sunny Bowl',           'Desserts',    'les_plus',      'piece',  0.4, '',     10),
  ('Daily Bowl',           'Desserts',    'les_plus',      'piece',  0.3, '',     20),
  ('Berry Bowl',           'Desserts',    'les_plus',      'piece',  1.0, '',     30),
  ('Pastèques',            'Desserts',    'les_plus',      'piece',  0.6, '',     40),
  ('Melon',                'Desserts',    'les_plus',      'piece',  0.3, '',     50),
  ('Ananas',               'Desserts',    'les_plus',      'piece',  0.3, '',     60),
  ('Tiramisu Oreo',        'Desserts',    'les_plus',      'piece',  1.4, '',     70),
  ('Tiramisu Jap',         'Desserts',    'les_plus',      'piece',  1.1, '',     80),
  ('Brookie',              'Desserts',    'les_plus',      'piece',  0.3, '',     90),
  ('Cœur coulant',         'Desserts',    'les_plus',      'piece',  0.1, '',    100),
  ('Pudding chia',         'Desserts',    'les_plus',      'piece',  2.9, '',    110),
  ('Nachos',               'Desserts',    'les_plus',      'piece',  0.3, '',    120)
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
