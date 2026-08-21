-- =====================================================================
-- Rouvrir un comptage validé
--
-- On s'aperçoit d'une erreur en rangeant, ou un bac réapparaît derrière
-- une pile. Jusqu'ici le comptage validé était scellé : il fallait
-- attendre le service suivant, ou vivre avec un rapport faux.
--
-- Rouvrir remet le comptage en cours ; la validation suivante recalcule
-- entièrement la liste de relance (`mep_submit_count` efface et
-- reconstruit les tâches). Aucun relevé n'est perdu — seul l'état change.
--
-- La journée en cours SEULEMENT, pour tout le monde, encadrement
-- compris : rouvrir une journée passée réécrirait un historique sur
-- lequel des décisions ont déjà été prises.
-- =====================================================================
create or replace function public.mep_rouvrir_comptage(p_session_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_session public.count_sessions%rowtype;
begin
  select * into v_session from public.count_sessions where id = p_session_id;

  if not found then
    raise exception 'Comptage introuvable.' using errcode = 'no_data_found';
  end if;

  if not public.is_active_user() then
    raise exception 'Compte inactif.' using errcode = '42501';
  end if;

  if v_session.status <> 'submitted' then
    raise exception 'Ce comptage est déjà en cours.' using errcode = '23514';
  end if;

  if v_session.date <> current_date then
    raise exception 'Seul le comptage du jour peut être rouvert.' using errcode = '42501';
  end if;

  if not public.is_staff_lead() and v_session.user_id <> auth.uid() then
    raise exception 'Seule la personne qui a validé ce comptage peut le rouvrir.'
      using errcode = '42501';
  end if;

  update public.count_sessions
  set status = 'draft', submitted_at = null
  where id = p_session_id;
end;
$$;

revoke all on function public.mep_rouvrir_comptage(uuid) from public, anon;
grant execute on function public.mep_rouvrir_comptage(uuid) to authenticated;

comment on function public.mep_rouvrir_comptage(uuid) is
  'Remet un comptage validé du jour en cours de saisie. Auteur ou encadrement.';
