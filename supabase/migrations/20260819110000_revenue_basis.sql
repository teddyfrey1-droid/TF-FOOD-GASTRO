-- =====================================================================
-- MEP — Base du chiffre d'affaires : TTC ou HT
--
-- Le restaurant raisonne **exclusivement en HT**, et son export l'est aussi.
--
-- La base reste néanmoins explicite en configuration : le jour où un export
-- arriverait en TTC, l'écart de TVA se verrait au lieu de se glisser
-- silencieusement entre l'historique et le CA de référence du calculateur.
-- Le calcul est indifférent à l'unité tant qu'elle est la même partout :
-- historique, réalisé, prévision et « VENTE POUR » doivent parler la même
-- langue.
-- =====================================================================

create type public.revenue_basis as enum ('ttc', 'ht');

alter table public.revenue_settings
  add column revenue_basis public.revenue_basis not null default 'ht';

comment on column public.revenue_settings.revenue_basis is
  'Base de TOUS les montants de l''application. « ht » : le restaurant raisonne en HT, et les valeurs « VENTE POUR » sont calées sur du HT.';

-- Les colonnes gardent leur nom pour ne pas casser l'historique des
-- migrations, mais leur commentaire dit ce qu'elles contiennent réellement.
comment on column public.revenue_history.revenue_ht is
  'Montant du jour, dans la base définie par revenue_settings.revenue_basis (HT par défaut).';
comment on column public.revenue_actuals.revenue_ht is
  'Montant du jour, dans la base définie par revenue_settings.revenue_basis (HT par défaut).';
