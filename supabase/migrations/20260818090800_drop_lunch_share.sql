-- =====================================================================
-- MEP — La part du midi n'a plus à être devinée
--
-- Ce réglage servait à extrapoler une consommation de journée entière à
-- partir du seul service du midi, faute de mieux.
--
-- Il devient inutile : les invendus du soir n'étant pas jetés, le comptage
-- du LENDEMAIN MATIN ferme la boucle du service du soir. La consommation de
-- la journée est donc entièrement MESURÉE :
--
--   conso midi = (stock matin + production matin) − stock après-midi
--   conso soir = (stock après-midi + production après-midi) − stock lendemain matin
--
-- Mieux : la part du midi devient elle-même une donnée observée, produit par
-- produit, plutôt qu'un chiffre saisi à vue de nez.
-- =====================================================================

alter table public.revenue_settings drop column if exists lunch_revenue_share;
