-- =====================================================================
-- MEP — Jeu de données de démonstration
--
-- ⚠️  AVERTISSEMENT — VALEURS PROVISOIRES
--
-- Les formats GN, les seuils de relance, les niveaux d'urgence, les temps
-- de prépa et les paliers du calculateur ci-dessous sont des PLACEHOLDERS.
-- Ils n'ont pas été fournis par le restaurant et ne doivent PAS être
-- utilisés en production.
--
-- Chaque format GN provisoire est suffixé « (à confirmer) » : le repère
-- reste donc visible à l'écran de comptage tant qu'il n'a pas été validé.
--
-- Valeurs par défaut appliquées faute d'information (cf. §9.3) :
--   • seuil de relance = 50 % de la cible
--   • niveau d'urgence = 3
--
-- Deux exceptions calibrées sur les cas de test du cahier des charges (§5.5) :
--   • Saumon  : CA 3 200 € -> cible 8, seuil 4
--   • Grenade : CA 1 400 € -> cible 2, seuil 1
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Catégories
-- ---------------------------------------------------------------------
insert into public.product_categories (name, sort_order) values
  ('Bases',     10),
  ('Poissons',  20),
  ('Légumes',   30),
  ('Toppings',  40),
  ('Sauces',    50)
on conflict (name) do update set sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- Produits
--
-- urgence : 1 = faible ... 5 = critique
-- Les produits chers et vite en rupture (poissons) portent une urgence
-- haute ; les toppings décoratifs une urgence basse.
-- ---------------------------------------------------------------------
insert into public.products (
  name, category_id, gn_format, reorder_mode, reorder_ratio,
  floor_qty, ceiling_qty, urgency_level, prep_time_min, weight_per_bac_kg,
  in_saladbar, in_fridge, sort_order, notes
)
select
  d.name,
  c.id,
  d.gn_format,
  'ratio',
  d.reorder_ratio,
  d.floor_qty,
  d.ceiling_qty,
  d.urgency_level,
  d.prep_time_min,
  d.weight_per_bac_kg,
  d.in_saladbar,
  d.in_fridge,
  d.sort_order,
  d.notes
from (values
  -- name, catégorie, format GN, ratio seuil, plancher, plafond, urgence, prépa, poids, saladbar, frigo, ordre, note
  ('Riz vinaigré',        'Bases',    'GN 1/1 - 100mm (à confirmer)', 0.5, 2.0, 12.0, 5, 12.0, 4.000, true,  true,  10, null),
  ('Riz complet',         'Bases',    'GN 1/2 - 100mm (à confirmer)', 0.5, 1.0,  6.0, 4,  12.0, 3.500, true,  true,  20, null),
  ('Quinoa',              'Bases',    'GN 1/3 - 100mm (à confirmer)', 0.5, 0.5,  4.0, 3,  10.0, 2.000, true,  true,  30, null),
  ('Salade mêlée',        'Bases',    'GN 1/1 - 100mm (à confirmer)', 0.5, 1.0,  8.0, 4,   6.0, 1.200, true,  true,  40, null),

  ('Saumon',              'Poissons', 'GN 1/3 - 65mm (à confirmer)',  0.5, 4.0, 16.0, 5,   6.0, 1.500, true,  true,  10, 'Décongeler la veille'),
  ('Thon rouge',          'Poissons', 'GN 1/6 - 65mm (à confirmer)',  0.5, 1.0,  8.0, 5,   6.0, 1.200, true,  true,  20, 'Décongeler la veille'),
  ('Thon épicé',          'Poissons', 'GN 1/6 - 65mm (à confirmer)',  0.5, 0.5,  6.0, 4,   8.0, 1.200, true,  true,  30, null),
  ('Crevettes',           'Poissons', 'GN 1/6 - 65mm (à confirmer)',  0.5, 0.5,  6.0, 4,   8.0, 1.000, true,  true,  40, null),
  ('Poulet grillé',       'Poissons', 'GN 1/3 - 65mm (à confirmer)',  0.5, 1.0,  8.0, 4,  15.0, 1.800, true,  true,  50, null),
  ('Tofu mariné',         'Poissons', 'GN 1/6 - 65mm (à confirmer)',  0.5, 0.5,  4.0, 3,  10.0, 1.000, true,  true,  60, null),
  ('Surimi snow crab',    'Poissons', 'GN 1/6 - 65mm (à confirmer)',  0.5, 0.5,  4.0, 3,   5.0, 1.000, true,  true,  70, null),

  ('Edamame',             'Légumes',  'GN 1/6 - 65mm (à confirmer)',  0.5, 0.5,  5.0, 3,   5.0, 1.000, true,  true,  10, null),
  ('Concombre',           'Légumes',  'GN 1/6 - 65mm (à confirmer)',  0.5, 0.5,  5.0, 3,   8.0, 1.000, true,  true,  20, null),
  ('Carotte râpée',       'Légumes',  'GN 1/6 - 65mm (à confirmer)',  0.5, 0.5,  5.0, 3,  10.0, 1.000, true,  true,  30, null),
  ('Chou rouge',          'Légumes',  'GN 1/6 - 65mm (à confirmer)',  0.5, 0.5,  4.0, 2,  10.0, 0.900, true,  true,  40, null),
  ('Radis',               'Légumes',  'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  3.0, 2,   8.0, 0.600, true,  true,  50, null),
  ('Avocat',              'Légumes',  'GN 1/6 - 65mm (à confirmer)',  0.5, 1.0,  6.0, 5,  12.0, 1.000, true,  true,  60, 'Mûrissement à surveiller'),
  ('Mangue',              'Légumes',  'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  4.0, 3,  10.0, 0.700, true,  true,  70, null),
  ('Ananas',              'Légumes',  'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  3.0, 2,  10.0, 0.700, true,  true,  80, null),
  ('Tomate cerise',       'Légumes',  'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  3.0, 2,   6.0, 0.800, true,  true,  90, null),
  ('Maïs',                'Légumes',  'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  3.0, 2,   3.0, 0.800, true,  true, 100, null),
  ('Oignon rouge',        'Légumes',  'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  3.0, 2,   8.0, 0.600, true,  true, 110, null),
  ('Wakamé',              'Légumes',  'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  3.0, 3,   5.0, 0.500, true,  true, 120, null),

  ('Grenade',             'Toppings', 'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  4.0, 2,   8.0, 0.400, true,  true,  10, null),
  ('Oignons frits',       'Toppings', 'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  3.0, 1,   1.0, 0.300, true,  false, 20, null),
  ('Cacahuètes',          'Toppings', 'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  3.0, 1,   1.0, 0.400, true,  false, 30, null),
  ('Graines de sésame',   'Toppings', 'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  2.0, 1,   1.0, 0.300, true,  false, 40, null),
  ('Algues nori',         'Toppings', 'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  2.0, 1,   3.0, 0.200, true,  false, 50, null),
  ('Gingembre mariné',    'Toppings', 'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  2.0, 2,   2.0, 0.400, true,  true,  60, null),
  ('Jalapeño',            'Toppings', 'GN 1/9 - 65mm (à confirmer)',  0.5, 0.5,  2.0, 2,   4.0, 0.300, true,  true,  70, null),

  ('Sauce spicy',         'Sauces',   'GN 1/9 - 100mm (à confirmer)', 0.5, 0.5,  4.0, 4,   5.0, 0.800, true,  true,  10, null),
  ('Sauce teriyaki',      'Sauces',   'GN 1/9 - 100mm (à confirmer)', 0.5, 0.5,  4.0, 4,   5.0, 0.800, true,  true,  20, null),
  ('Sauce sésame',        'Sauces',   'GN 1/9 - 100mm (à confirmer)', 0.5, 0.5,  4.0, 4,   5.0, 0.800, true,  true,  30, null),
  ('Sauce ponzu',         'Sauces',   'GN 1/9 - 100mm (à confirmer)', 0.5, 0.5,  3.0, 3,   5.0, 0.800, true,  true,  40, null),
  ('Mayo japonaise',      'Sauces',   'GN 1/9 - 100mm (à confirmer)', 0.5, 0.5,  3.0, 3,   3.0, 0.800, true,  true,  50, null)
) as d(name, category, gn_format, reorder_ratio, floor_qty, ceiling_qty, urgency_level,
       prep_time_min, weight_per_bac_kg, in_saladbar, in_fridge, sort_order, notes)
join public.product_categories c on c.name = d.category
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Calculateur — paliers PROVISOIRES
--
-- Les paliers de CA et les cibles doivent être remplacés par l'export du
-- Google Sheet réel (cf. scripts/import-calculator.ts).
--
-- Calibrage : le saumon donne bien 8 gastros et la grenade 2 gastros aux
-- CA du tableau de test du §5.5, marge de sécurité comprise.
-- ---------------------------------------------------------------------
insert into public.calculator_rules (product_id, mode, ca_min, ca_max, target_qty, valid_from)
select p.id, 'bracket', b.ca_min, b.ca_max, round(b.factor * s.base_qty * 2) / 2, date '2020-01-01'
from public.products p
join (values
  ('Riz vinaigré', 8.0), ('Riz complet', 3.0), ('Quinoa', 2.0), ('Salade mêlée', 4.0),
  ('Saumon', 8.0), ('Thon rouge', 4.0), ('Thon épicé', 3.0), ('Crevettes', 3.0),
  ('Poulet grillé', 4.0), ('Tofu mariné', 2.0), ('Surimi snow crab', 2.0),
  ('Edamame', 2.5), ('Concombre', 2.5), ('Carotte râpée', 2.5), ('Chou rouge', 2.0),
  ('Radis', 1.5), ('Avocat', 3.0), ('Mangue', 2.0), ('Ananas', 1.5),
  ('Tomate cerise', 1.5), ('Maïs', 1.5), ('Oignon rouge', 1.5), ('Wakamé', 1.5),
  ('Grenade', 4.0), ('Oignons frits', 1.5), ('Cacahuètes', 1.5), ('Graines de sésame', 1.0),
  ('Algues nori', 1.0), ('Gingembre mariné', 1.0), ('Jalapeño', 1.0),
  ('Sauce spicy', 2.0), ('Sauce teriyaki', 2.0), ('Sauce sésame', 2.0),
  ('Sauce ponzu', 1.5), ('Mayo japonaise', 1.5)
) as s(name, base_qty) on s.name = p.name
cross join (values
  -- Le palier « 2500 - 4000 » est celui du cas de test saumon (CA_ref 3 520 €).
  (   0.0,  1000.0, 0.375),
  (1000.0,  2000.0, 0.500),   -- palier du cas de test grenade (CA_ref 1 540 €) : 4,0 x 0,5 = 2
  (2000.0,  2500.0, 0.750),
  (2500.0,  4000.0, 1.000),
  (4000.0,  5500.0, 1.250),
  (5500.0,    null, 1.500)
) as b(ca_min, ca_max, factor)
on conflict do nothing;

commit;
