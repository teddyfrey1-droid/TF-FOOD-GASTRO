-- =====================================================================
-- MEP — Base du chiffre d'affaires : TTC ou HT
--
-- L'historique fourni par le restaurant est en **TTC**. Les colonnes de la
-- base s'appelaient `revenue_ht` : elles auraient contenu du TTC sous une
-- étiquette HT, et un écart de 10 % se serait glissé silencieusement entre
-- l'historique et le CA de référence du calculateur.
--
-- Plutôt qu'une conversion à l'aveugle (le taux de TVA dépend de la carte),
-- on rend la base EXPLICITE. Le calcul est indifférent à l'unité tant qu'elle
-- est la même partout : historique, réalisé, prévision et référence du
-- calculateur doivent simplement parler la même langue.
-- =====================================================================

create type public.revenue_basis as enum ('ttc', 'ht');

alter table public.revenue_settings
  add column revenue_basis public.revenue_basis not null default 'ttc';

comment on column public.revenue_settings.revenue_basis is
  'Base de TOUS les montants de l''application. « ttc » : l''historique fourni est en TTC, et les valeurs « VENTE POUR » doivent être calées sur du TTC.';

-- Les colonnes gardent leur nom pour ne pas casser l'historique des
-- migrations, mais leur commentaire dit ce qu'elles contiennent réellement.
comment on column public.revenue_history.revenue_ht is
  'Montant du jour, dans la base définie par revenue_settings.revenue_basis (TTC par défaut).';
comment on column public.revenue_actuals.revenue_ht is
  'Montant du jour, dans la base définie par revenue_settings.revenue_basis (TTC par défaut).';
