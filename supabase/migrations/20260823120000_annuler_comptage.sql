-- =====================================================================
-- Annuler un comptage commencé
--
-- Un employé ouvre le comptage, saisit trois produits, puis part en
-- livraison ou change de poste. La journée reste bloquée sur « En cours »
-- à son nom, et le collègue qui prend la suite hérite d'un relevé
-- partiel dont il ne sait pas ce qu'il vaut.
--
-- Annuler efface le comptage et ses lignes : on repart de « À faire ».
-- C'est destructeur par construction — d'où les trois garde-fous :
--
--   • uniquement un comptage EN COURS, jamais un comptage validé : le
--     rapport de production s'appuie dessus, et l'historique ne se
--     réécrit pas ;
--   • uniquement par la personne qui l'a commencé, ou par
--     l'encadrement ;
--   • uniquement la journée en cours, sauf pour l'encadrement.
-- =====================================================================
create or replace function public.mep_annuler_comptage(p_session_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_session public.count_sessions%rowtype;
begin
  select * into v_session
  from public.count_sessions
  where id = p_session_id;

  if not found then
    raise exception 'Comptage introuvable.' using errcode = 'no_data_found';
  end if;

  if not public.is_active_user() then
    raise exception 'Compte inactif.' using errcode = '42501';
  end if;

  if v_session.status <> 'draft' then
    raise exception 'Un comptage validé ne s''annule pas.' using errcode = '23514';
  end if;

  if not public.is_staff_lead() then
    if v_session.user_id <> auth.uid() then
      raise exception 'Seule la personne qui a commencé ce comptage peut l''annuler.'
        using errcode = '42501';
    end if;

    if v_session.date <> current_date then
      raise exception 'Ce comptage ne vous est pas accessible.' using errcode = '42501';
    end if;
  end if;

  -- Les lignes partent avec le comptage : c'est bien tout le relevé
  -- qu'on jette, pas seulement son en-tête.
  delete from public.count_lines where session_id = p_session_id;
  delete from public.count_sessions where id = p_session_id;
end;
$$;

revoke all on function public.mep_annuler_comptage(uuid) from public, anon;
grant execute on function public.mep_annuler_comptage(uuid) to authenticated;

comment on function public.mep_annuler_comptage(uuid) is
  'Efface un comptage EN COURS et ses lignes. Jamais un comptage validé.';
