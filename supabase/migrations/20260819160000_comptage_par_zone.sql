-- =====================================================================
-- MEP — Le comptage se suit zone par zone
--
-- L'employé compte en deux passes : tout le saladbar, puis tout le frigo du
-- bas. Un seul marqueur `counted_at` ne suffit donc plus : saisir une
-- quantité au saladbar marquerait aussi le frigo comme fait, et l'employé
-- pourrait valider sans être jamais descendu.
--
-- `counted_at` reste le marqueur d'ensemble (la ligne a été touchée) ; les
-- deux nouvelles colonnes disent QUELLE zone a réellement été relevée.
-- =====================================================================

alter table public.count_lines
  add column counted_saladbar_at timestamptz,
  add column counted_fridge_at   timestamptz;

comment on column public.count_lines.counted_saladbar_at is
  'Horodatage du relevé au saladbar. NULL = zone pas encore comptée.';
comment on column public.count_lines.counted_fridge_at is
  'Horodatage du relevé au frigo du bas. NULL = zone pas encore comptée.';

grant update (
  qty_saladbar, qty_fridge, is_not_applicable, not_applicable_reason,
  counted_at, counted_saladbar_at, counted_fridge_at
) on public.count_lines to authenticated;

-- Les comptages déjà saisis avant ce découpage sont considérés relevés dans
-- les deux zones : ils l'ont été, avec l'ancien écran.
update public.count_lines
set counted_saladbar_at = coalesce(counted_saladbar_at, counted_at),
    counted_fridge_at   = coalesce(counted_fridge_at, counted_at)
where counted_at is not null;
