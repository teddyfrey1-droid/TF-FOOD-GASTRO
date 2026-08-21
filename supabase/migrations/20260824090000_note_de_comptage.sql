-- =====================================================================
-- Une note sur le comptage
--
-- Il se passe toujours quelque chose qu'aucune case ne prévoit : une
-- livraison en retard, un frigo en panne, un bac oublié au passe. Sans
-- endroit où l'écrire, l'information part avec la personne qui l'a vue,
-- et le lendemain personne ne comprend les chiffres.
--
-- La note appartient au comptage, se saisit avant la validation, et se
-- relit dans l'historique.
-- =====================================================================
alter table public.count_sessions
  add column if not exists note text;

comment on column public.count_sessions.note is
  'Mot laissé par la personne qui a compté. Visible dans l''historique.';

-- L'équipe l'écrit sur SON comptage du jour ; l'encadrement la relit
-- partout. On ajoute la colonne aux droits d'écriture existants plutôt
-- que d'ouvrir la table davantage.
grant update (note) on public.count_sessions to authenticated;
