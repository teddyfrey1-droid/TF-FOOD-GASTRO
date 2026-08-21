-- =====================================================================
-- Supprimer un produit — quand c'est possible
--
-- Désactiver a toujours été le bon geste : un produit retiré de la carte
-- reste dans les comptages passés, et l'historique doit rester lisible.
-- Mais un produit créé par erreur, jamais compté une seule fois, n'a
-- aucune raison d'encombrer la liste pour toujours.
--
-- D'où la règle : suppression franche tant que le produit n'a servi à
-- rien, désactivation dès qu'il apparaît dans un comptage. La base
-- tranche elle-même et dit laquelle des deux s'applique — plutôt qu'une
-- erreur de clé étrangère que personne ne sait lire.
-- =====================================================================
create or replace function public.mep_supprimer_produit(p_product_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_comptages int;
  v_nom       text;
begin
  if not public.mep_a_le_droit('carte') then
    raise exception 'Modifier la carte ne vous est pas permis.' using errcode = '42501';
  end if;

  select name into v_nom from public.products where id = p_product_id;

  if v_nom is null then
    raise exception 'Produit introuvable.' using errcode = 'no_data_found';
  end if;

  select count(*) into v_comptages
  from public.count_lines
  where product_id = p_product_id;

  if v_comptages > 0 then
    raise exception
      '% a déjà été compté % fois : désactivez-le plutôt que de le supprimer, sinon l''historique devient illisible.',
      v_nom, v_comptages
      -- Règle métier, pas violation de clé : `check_violation` est la
      -- classe que le reste du harnais reconnaît comme un refus légitime.
      using errcode = '23514';
  end if;

  delete from public.products where id = p_product_id;
end;
$$;

revoke all on function public.mep_supprimer_produit(uuid) from public, anon;
grant execute on function public.mep_supprimer_produit(uuid) to authenticated;

comment on function public.mep_supprimer_produit(uuid) is
  'Supprime un produit jamais compté. Refuse dès qu''il figure dans un comptage.';
