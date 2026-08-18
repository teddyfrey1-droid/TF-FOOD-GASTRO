-- =====================================================================
-- MEP — Part du chiffre d'affaires réalisée au service du midi
--
-- Le §5.7 rapportait la consommation du midi au « CA réel du midi ». Le
-- restaurant enregistre son chiffre d'affaires À LA JOURNÉE : ce
-- dénominateur n'existe pas.
--
-- L'indicateur de référence devient donc « gastros consommés au midi pour
-- 1 000 € de CA de la journée » — entièrement mesuré, sans hypothèse.
--
-- Ce réglage ne sert qu'à EXTRAPOLER une consommation sur la journée
-- entière, pour la comparer au calculateur qui, lui, dimensionne un jour
-- complet. Toute valeur qui en dépend est affichée comme estimée.
--
-- Si le CA du midi finit par être saisi (colonne revenue_lunch_ht, déjà
-- présente), il prime et l'estimation disparaît d'elle-même.
-- =====================================================================

alter table public.revenue_settings
  add column lunch_revenue_share numeric(5, 4)
    check (lunch_revenue_share is null or (lunch_revenue_share > 0 and lunch_revenue_share <= 1));

comment on column public.revenue_settings.lunch_revenue_share is
  'Part du CA réalisée au midi (0 à 1). NULL = inconnue : aucune extrapolation n''est alors affichée.';

-- Volontairement laissée à NULL : tant que le restaurant n'a pas donné sa
-- valeur, mieux vaut une colonne vide qu'un chiffre inventé qui aurait l'air
-- d'une mesure.
