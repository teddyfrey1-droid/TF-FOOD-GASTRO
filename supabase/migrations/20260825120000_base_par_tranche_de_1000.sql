-- =====================================================================
-- MEP — La base se lit désormais PAR TRANCHE DE 1 000 €
--
-- Jusqu'ici la cible passait par un couple (CA de référence, coefficient)
-- propre à chaque famille :
--
--   cible = base_qty × target_multiplier × (CA_ref / reference_revenue)
--
-- Concrètement, une base de « mise en place » s'exprimait pour 2 000 € et
-- une base des « plus » pour 1 000 €. Deux échelles pour une même colonne :
-- personne ne pouvait régler un produit de tête, et l'écran Produits ne
-- pouvait pas dire honnêtement ce que le nombre saisi voulait dire.
--
-- Une seule échelle désormais, la même pour tout le monde :
--
--   cible = base_qty × (CA_ref / 1000)
--
-- « 4 puddings par tranche de 1 000 € » : à 1 500 € de chiffre d'affaires,
-- 1 500 / 1 000 × 4 = 6 puddings. C'est lisible sans calculette, et c'est
-- ce qu'on peut demander à quelqu'un de régler en cuisine.
--
-- Les cibles du jour ne bougent pas : les bases sont converties dans la
-- même transaction que le changement de formule.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Conversion des bases
--
-- Cas général : on réexprime la base dans la nouvelle échelle, ce qui
-- laisse la cible du jour rigoureusement identique.
--   mise en place : × 2 × 1000/4000 = ÷ 2
--   les plus      : × 1 × 1000/1000 = inchangé
--
-- Deux exceptions. « Riz » (700) et « Pudding chia » (100) ont été saisis
-- sur un écran qui annonçait à tort « une gastro tient pour ___ € », soit
-- l'inverse de l'échelle. Les convertir comme les autres donnerait 350 et
-- 100 par tranche de 1 000 € — absurde. On inverse donc leur saisie, qui
-- est la seule lecture qui respecte ce qui a été voulu :
--   Riz          : 1 gastro pour 700 €  ->  1000/700 = 1,429 / 1 000 €
--   Pudding chia : 1 pièce  pour 100 €  ->  1000/100 = 10    / 1 000 €
-- ---------------------------------------------------------------------
update public.products p
set base_qty = case
      when p.name = 'Riz'          and p.base_qty = 700 then 1.429
      when p.name = 'Pudding chia' and p.base_qty = 100 then 10
      else round(p.base_qty * f.target_multiplier * 1000 / f.reference_revenue, 3)
    end
from public.product_family_settings f
where f.family = p.family;

comment on column public.products.base_qty is
  'Quantité à avoir par tranche de 1 000 € de chiffre d''affaires. '
  'cible = base_qty × (CA de référence / 1000).';

-- ---------------------------------------------------------------------
-- 2. Les deux réglages de famille n'ont plus d'objet
--
-- Les laisser en place serait pire que les supprimer : deux colonnes qui
-- ressemblent à des réglages du moteur alors que plus rien ne les lit.
-- La famille garde son libellé, elle sert encore à ranger les produits.
-- ---------------------------------------------------------------------
alter table public.product_family_settings
  drop column reference_revenue,
  drop column target_multiplier;

-- ---------------------------------------------------------------------
-- 3. Le calcul
--
-- Seule la ligne de la cible change ; minimum et critique en découlent
-- comme avant. `create or replace` conserve les dépendances.
-- ---------------------------------------------------------------------
create or replace function public.mep_targets_internal(d date, p_session public.session_kind)
returns table (
  product_id   uuid,
  product_name text,
  target       numeric,
  minimum      numeric,
  critical     numeric,
  priority     integer,
  unit         public.product_unit
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_ca_ref          numeric := coalesce(public.mep_reference_internal(d, p_session), 0);
  v_default_divisor numeric;
  v_default_crit    numeric;
begin
  select default_min_divisor, default_crit_divisor
    into v_default_divisor, v_default_crit
  from public.revenue_settings where id;

  return query
  with computed as (
    select
      p.id, p.name, p.priority, p.unit, p.count_step,
      p.min_mode, p.min_divisor, p.min_qty_manual,
      p.crit_mode, p.crit_divisor, p.crit_qty_manual,
      public.mep_ceil_to(
        greatest(
          least(
            -- Une tranche de 1 000 €, pour tous les produits.
            greatest(p.base_qty * (v_ca_ref / 1000), 0),
            coalesce(p.ceiling_qty, 'infinity'::numeric)
          ),
          coalesce(p.floor_qty, 0)
        ), 1
      ) as computed_target
    from public.products p
    where p.is_active
  ),
  avec_min as (
    select c.*,
      least(
        public.mep_ceil_to(
          greatest(
            case
              when c.min_mode = 'manual' then coalesce(c.min_qty_manual, 0)
              else c.computed_target
                   / greatest(coalesce(nullif(c.min_divisor, 0), v_default_divisor), 0.001)
            end, 0
          ), c.count_step
        ), c.computed_target
      ) as computed_min
    from computed c
  )
  select
    m.id, m.name, m.computed_target, m.computed_min,
    -- Critique : borné par le MINIMUM, jamais au-dessus.
    least(
      public.mep_ceil_to(
        greatest(
          case
            when m.crit_mode = 'manual' then coalesce(m.crit_qty_manual, 0)
            else m.computed_target
                 / greatest(coalesce(nullif(m.crit_divisor, 0), v_default_crit), 0.001)
          end, 0
        ), m.count_step
      ), m.computed_min
    ),
    m.priority, m.unit
  from avec_min m;
end;
$$;

-- La fonction expose cibles et seuils : elle reste hors de portée.
revoke all on function public.mep_targets_internal(date, public.session_kind)
  from public, anon, authenticated;
