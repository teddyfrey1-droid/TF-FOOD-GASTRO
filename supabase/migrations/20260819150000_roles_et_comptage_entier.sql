-- =====================================================================
-- MEP — Quatre statuts, et un comptage en unités entières
--
-- 1. LES STATUTS
--
--    propriétaire       — tout, y compris les comptes
--    directeur          — tout, y compris les comptes
--    assistant manager  — le comptage, l'historique et la fiche produits,
--                         mais NI le chiffre d'affaires, NI les cibles,
--                         NI les réglages
--    salarié            — le comptage, rien d'autre
--
--    La règle de confidentialité ne bouge pas : le CA reste réservé au
--    directeur et au propriétaire. L'assistant manager pilote un service,
--    il n'a pas à connaître le chiffre d'affaires.
--
-- 2. LE COMPTAGE PASSE À L'UNITÉ ENTIÈRE
--
--    On compte des gastros et des pièces : le demi n'a pas de sens sur un
--    bao ou un gyoza, et il ralentit la saisie sur tout le reste.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Le nouveau statut
-- ---------------------------------------------------------------------
alter type public.user_role add value if not exists 'assistant_manager' before 'manager';

comment on column public.profiles.role is
  'salarié (employee), assistant manager, directeur (manager), propriétaire (owner). Le CA reste réservé aux deux derniers.';
