-- =====================================================================
-- Suivi d'activité — réservé au propriétaire
--
-- CE QUE ÇA ENREGISTRE : les connexions, les écrans ouverts, et les
-- gestes qui changent quelque chose (comptage validé, produit modifié,
-- droit accordé…). De quoi répondre à « qui a fait quoi, et quand ».
--
-- CE QUE ÇA N'ENREGISTRE PAS, DÉLIBÉRÉMENT : aucune position
-- géographique, aucune adresse IP, aucun contenu saisi hors de
-- l'application. Un outil de travail interne trace ce qu'on y fait ;
-- il n'a pas à suivre les gens ailleurs.
--
-- QUI PEUT LIRE : le propriétaire, et lui seul. Ni le directeur, ni
-- l'assistant manager, ni l'intéressé lui-même. La table n'accorde
-- aucun droit de lecture directe : tout passe par des fonctions qui
-- vérifient `is_owner()`.
--
-- QUI PEUT ÉCRIRE : chacun, mais seulement sa propre ligne — la
-- fonction impose `auth.uid()` comme auteur. Personne ne peut donc
-- fabriquer de l'activité au nom d'un collègue.
--
-- COMBIEN DE TEMPS : 90 jours. Au-delà, les lignes sont effacées. Un
-- journal d'activité qui s'accumule sans fin n'est plus un outil de
-- travail, et le RGPD demande une durée de conservation bornée.
-- =====================================================================

create table if not exists public.activity_log (
  id          bigserial primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- 'vue' pour un écran ouvert, 'action' pour un geste qui change
  -- quelque chose, 'connexion' pour une ouverture de session.
  kind        text        not null check (kind in ('vue', 'action', 'connexion')),
  -- Le chemin de l'écran, ou le nom du geste.
  label       text        not null,
  detail      jsonb,
  occurred_at timestamptz not null default now()
);

comment on table public.activity_log is
  'Journal d''usage. Lisible par le propriétaire uniquement, 90 jours.';

create index if not exists activity_log_user_idx
  on public.activity_log (user_id, occurred_at desc);
create index if not exists activity_log_date_idx
  on public.activity_log (occurred_at desc);

alter table public.activity_log enable row level security;

-- Aucune lecture directe, pour personne. Les fonctions ci-dessous sont
-- le seul chemin, et elles vérifient le statut.
revoke all on table public.activity_log from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Écrire une ligne. Chacun pour soi, jamais pour un autre.
-- ---------------------------------------------------------------------
create or replace function public.mep_journaliser(
  p_kind   text,
  p_label  text,
  p_detail jsonb default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
begin
  if not public.is_active_user() then
    return;
  end if;

  if p_kind not in ('vue', 'action', 'connexion') then
    raise exception 'Type d''évènement inconnu.' using errcode = '23514';
  end if;

  -- L'auteur n'est JAMAIS un paramètre : il vient du jeton. Sans cela,
  -- n'importe qui pourrait écrire de l'activité au nom d'un collègue,
  -- et le journal ne prouverait plus rien.
  insert into public.activity_log (user_id, kind, label, detail)
  values (auth.uid(), p_kind, left(p_label, 200), p_detail);
end;
$$;

revoke all on function public.mep_journaliser(text, text, jsonb) from public, anon;
grant execute on function public.mep_journaliser(text, text, jsonb) to authenticated;

comment on function public.mep_journaliser(text, text, jsonb) is
  'Enregistre une ligne d''activité au nom de l''appelant. Jamais d''un autre.';

-- ---------------------------------------------------------------------
-- Le tableau d'ensemble : une ligne par personne.
-- ---------------------------------------------------------------------
create or replace function public.mep_suivi_equipe()
returns table (
  user_id            uuid,
  full_name          text,
  email              text,
  role               public.user_role,
  is_active          boolean,
  derniere_connexion timestamptz,
  derniere_activite  timestamptz,
  vues_7j            int,
  actions_7j         int,
  comptages_30j      int,
  modifications_30j  int
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_owner() then
    raise exception 'Le suivi d''activité est réservé au propriétaire.'
      using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.full_name,
    u.email::text,
    p.role,
    p.is_active,
    u.last_sign_in_at,
    (select max(a.occurred_at) from public.activity_log a where a.user_id = p.id),
    (select count(*)::int from public.activity_log a
     where a.user_id = p.id and a.kind = 'vue'
       and a.occurred_at > now() - interval '7 days'),
    (select count(*)::int from public.activity_log a
     where a.user_id = p.id and a.kind = 'action'
       and a.occurred_at > now() - interval '7 days'),
    (select count(*)::int from public.count_sessions s
     where s.user_id = p.id and s.status = 'submitted'
       and s.date > current_date - 30),
    (select count(*)::int from public.audit_log l
     where l.user_id = p.id and l.created_at > now() - interval '30 days')
  from public.profiles p
  join auth.users u on u.id = p.id
  order by u.last_sign_in_at desc nulls last;
end;
$$;

revoke all on function public.mep_suivi_equipe() from public, anon;
grant execute on function public.mep_suivi_equipe() to authenticated;

comment on function public.mep_suivi_equipe() is
  'Tableau d''activité par personne. Propriétaire uniquement.';

-- ---------------------------------------------------------------------
-- Le détail d'une personne : ce qu'elle a ouvert et ce qu'elle a fait.
--
-- Les trois sources sont réunies en une seule frise chronologique —
-- journal d'usage, comptages validés, modifications de réglages. Lues
-- séparément, elles ne racontent rien ; entrelacées, elles montrent une
-- journée de travail.
-- ---------------------------------------------------------------------
create or replace function public.mep_suivi_detail(
  p_user_id uuid,
  p_jours   int default 30,
  p_limite  int default 300
)
returns table (
  survenu_le timestamptz,
  categorie  text,
  libelle    text,
  detail     text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_owner() then
    raise exception 'Le suivi d''activité est réservé au propriétaire.'
      using errcode = '42501';
  end if;

  if p_jours < 1 or p_jours > 365 then
    raise exception 'Période invalide.' using errcode = '23514';
  end if;

  return query
  select * from (
    -- Écrans ouverts et gestes enregistrés par l'application.
    select a.occurred_at, a.kind,
           a.label,
           coalesce(a.detail::text, '')
    from public.activity_log a
    where a.user_id = p_user_id
      and a.occurred_at > now() - make_interval(days => p_jours)

    union all

    -- Comptages validés : la trace la plus ancienne, et la plus fiable.
    select s.submitted_at, 'comptage',
           case when s.session = 'morning' then 'Comptage du matin validé'
                else 'Comptage de l''après-midi validé' end,
           coalesce(s.note, '')
    from public.count_sessions s
    where s.user_id = p_user_id
      and s.status = 'submitted'
      and s.submitted_at > now() - make_interval(days => p_jours)

    union all

    -- Modifications de réglages, depuis le journal d'audit existant.
    select l.created_at, 'modification',
           l.action || ' — ' || l.table_name,
           coalesce(l.after::text, '')
    from public.audit_log l
    where l.user_id = p_user_id
      and l.created_at > now() - make_interval(days => p_jours)
  ) frise
  order by 1 desc
  limit least(p_limite, 1000);
end;
$$;

revoke all on function public.mep_suivi_detail(uuid, int, int) from public, anon;
grant execute on function public.mep_suivi_detail(uuid, int, int) to authenticated;

comment on function public.mep_suivi_detail(uuid, int, int) is
  'Frise d''activité d''une personne. Propriétaire uniquement.';

-- ---------------------------------------------------------------------
-- Purge des lignes de plus de 90 jours.
--
-- Un journal qui s'accumule sans fin n'est plus un outil de travail, et
-- une durée de conservation bornée est ce que demande le RGPD.
-- ---------------------------------------------------------------------
create or replace function public.mep_purger_activite()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_effacees int;
begin
  delete from public.activity_log
  where occurred_at < now() - interval '90 days';

  get diagnostics v_effacees = row_count;
  return v_effacees;
end;
$$;

revoke all on function public.mep_purger_activite() from public, anon, authenticated;

comment on function public.mep_purger_activite() is
  'Efface les lignes de plus de 90 jours. Appelée par la tâche planifiée.';
