-- =====================================================================
-- Le report d'un produit doit pouvoir s'écrire
--
-- `20260820150000_seuil_critique_et_report.sql` a ajouté `deferred_at` et
-- `deferred_reason` à `count_lines`, mais sans étendre le GRANT UPDATE
-- correspondant. Or l'écran de comptage écrit ces deux colonnes à CHAQUE
-- saisie (elles valent NULL quand le produit n'est pas reporté).
--
-- Postgres refuse l'ordre entier dès qu'une seule colonne manque, et le
-- message ne nomme que la table : « permission denied for table
-- count_lines ». Résultat, plus aucune quantité ne s'enregistrait.
--
-- Le droit reste colonne par colonne : `qty_total` est calculée, et les
-- colonnes d'instantané (cible, minimum, critique, besoin de production)
-- ne doivent jamais être écrites — ni lues — par un employé.
-- =====================================================================
grant update (
  qty_saladbar, qty_fridge,
  is_not_applicable, not_applicable_reason,
  counted_at, counted_saladbar_at, counted_fridge_at,
  deferred_at, deferred_reason
) on public.count_lines to authenticated;
