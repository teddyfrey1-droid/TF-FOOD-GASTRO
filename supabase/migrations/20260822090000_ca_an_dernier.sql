-- =====================================================================
-- Le vrai chiffre d'affaires de l'an dernier
--
-- L'écran affichait, sous l'intitulé « l'an dernier », la valeur renvoyée
-- par `mep_reference_revenue`. Or cette fonction ne renvoie PAS le passé :
-- elle renvoie la cible du service, c'est-à-dire la prévision du jour
-- majorée de la marge de sécurité. Avec une marge à zéro, elle vaut
-- exactement la prévision — d'où les deux montants identiques à l'écran,
-- et un taux de croissance impossible à contrôler.
--
-- Il manquait donc la donnée brute : le CA réellement encaissé le même
-- jour de semaine l'an dernier, avant toute majoration.
--
-- La date renvoyée compte autant que le montant. `mep_forecast_internal`
-- remonte de semaine en semaine quand la journée de référence manque ou
-- était fermée ; afficher la date théorique à côté d'un montant venu
-- d'une autre semaine serait trompeur. On rejoue donc la même recherche,
-- et on dit sur quel jour elle a fini par tomber.
-- =====================================================================
create or replace function public.mep_ca_an_dernier(d date)
returns table (jour date, revenue_ht numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ref     date;
  v_attempt int := 0;
begin
  if not public.is_manager() then
    raise exception 'Le chiffre d''affaires est réservé au directeur.'
      using errcode = '42501';
  end if;

  v_ref := public.mep_reference_date(d);

  while v_attempt <= 8 loop
    return query
    select h.date, h.revenue_ht
    from public.revenue_history h
    where h.date = v_ref and not h.is_closed_day;

    if found then
      return;
    end if;

    v_ref := v_ref - 7;
    v_attempt := v_attempt + 1;
  end loop;
end;
$$;

revoke all on function public.mep_ca_an_dernier(date) from public, anon;
grant execute on function public.mep_ca_an_dernier(date) to authenticated;

comment on function public.mep_ca_an_dernier(date) is
  'CA brut du jour de référence l''an dernier, avant majoration. Directeur uniquement.';
