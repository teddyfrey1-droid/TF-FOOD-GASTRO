-- =====================================================================
-- MEP — Le journal d'audit ne doit bloquer personne
--
-- `audit_log.user_id` référençait `profiles` sans règle de suppression :
-- supprimer un compte qui avait modifié un produit ou le CA échouait sur
-- une violation de clé étrangère.
--
-- Deux mauvaises réponses possibles : supprimer les lignes d'audit avec le
-- compte (on perdrait la trace), ou renoncer à supprimer le compte. La
-- bonne : garder la ligne d'audit et oublier QUI, puisque l'essentiel est
-- QUOI et QUAND.
--
-- En pratique un employé se désactive plutôt qu'il ne se supprime, mais un
-- compte créé par erreur doit pouvoir disparaître.
-- =====================================================================

alter table public.audit_log
  drop constraint audit_log_user_id_fkey,
  add constraint audit_log_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null;

comment on column public.audit_log.user_id is
  'Auteur de la modification. Passe à NULL si le compte est supprimé : la trace de ce qui a changé survit à celui qui l''a changé.';

-- Idem pour les tâches de production : le prénom de celui qui a coché ne
-- doit pas empêcher de supprimer son compte.
alter table public.production_tasks
  drop constraint production_tasks_done_by_fkey,
  add constraint production_tasks_done_by_fkey
    foreign key (done_by) references public.profiles (id) on delete set null;
