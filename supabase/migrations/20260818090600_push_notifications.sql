-- =====================================================================
-- MEP — Rappels de comptage (notifications push)
--
-- « Il est 15 h, le comptage de l'après-midi n'est pas fait. »
--
-- Sur iPhone, les notifications web ne fonctionnent QUE si l'application a
-- été ajoutée à l'écran d'accueil (iOS 16.4+). L'abonnement est donc
-- nominatif et lié à un appareil : un même employé peut en avoir plusieurs.
-- =====================================================================

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,

  -- Point de terminaison fourni par le navigateur : il identifie l'appareil.
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,

  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- Renseigné quand le service de push répond 404/410 : l'abonnement est mort.
  revoked_at timestamptz
);

create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id) where revoked_at is null;

alter table public.push_subscriptions enable row level security;

-- Chacun gère ses propres appareils ; le directeur voit l'ensemble pour
-- diagnostiquer un employé qui ne reçoit rien.
create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

create policy push_subscriptions_insert on public.push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid() or public.is_manager());

-- ---------------------------------------------------------------------
-- Qui faut-il prévenir maintenant ?
--
-- Renvoie les abonnements à notifier pour une session donnée, si et
-- seulement si le comptage n'a pas encore été validé aujourd'hui.
-- Appelée par la tâche planifiée, avec la clé de service.
-- ---------------------------------------------------------------------
create or replace function public.mep_pending_reminders(p_session public.session_kind)
returns table (
  subscription_id uuid,
  endpoint        text,
  p256dh          text,
  auth            text,
  full_name       text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, p.full_name
  from public.push_subscriptions s
  join public.profiles p on p.id = s.user_id
  where s.revoked_at is null
    and p.is_active
    -- Inutile de rappeler un comptage déjà validé.
    and not exists (
      select 1 from public.count_sessions cs
      where cs.date = current_date
        and cs.session = p_session
        and cs.status = 'submitted'
    );
$$;

-- Réservée au serveur : aucun rôle applicatif ne peut l'exécuter.
revoke all on function public.mep_pending_reminders(public.session_kind) from public, authenticated, anon;

-- ---------------------------------------------------------------------
-- Un rappel par session et par jour, pas un de plus.
--
-- La tâche planifiée tourne toutes les demi-heures — c'est le seul moyen
-- robuste de viser 07 h 30 heure de Paris quand l'ordonnanceur, lui, raisonne
-- en UTC et que l'heure d'été décale tout de 60 minutes deux fois par an.
-- Cette table garantit qu'un employé reçoit UNE notification, pas vingt.
-- ---------------------------------------------------------------------
create table public.reminder_sends (
  date    date not null default current_date,
  session public.session_kind not null,
  sent_at timestamptz not null default now(),
  primary key (date, session)
);

alter table public.reminder_sends enable row level security;
-- Aucune politique : seule la clé de service y accède.

/**
 * Réserve l'envoi du rappel pour aujourd'hui.
 *
 * Renvoie vrai UNE SEULE FOIS par jour et par session, et seulement si
 * l'heure configurée est passée à Paris. Les appels suivants renvoient faux.
 */
create or replace function public.mep_claim_reminder(
  p_session public.session_kind,
  -- Heure de Paris par défaut. Le paramètre n'existe que pour les tests :
  -- il rend le comportement vérifiable sans dépendre de l'heure qu'il est.
  p_now time default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_due_time  time;
  v_paris_now time := coalesce(p_now, (now() at time zone 'Europe/Paris')::time);
  v_claimed   boolean;
begin
  select case p_session
           when 'morning' then morning_reminder_time
           else afternoon_reminder_time
         end
    into v_due_time
  from public.revenue_settings where id;

  if v_due_time is null or v_paris_now < v_due_time then
    return false;
  end if;

  -- L'insertion elle-même fait office de verrou : deux tâches concurrentes
  -- ne peuvent pas réserver le même créneau.
  insert into public.reminder_sends (date, session)
  values (current_date, p_session)
  on conflict (date, session) do nothing
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.mep_claim_reminder(public.session_kind, time) from public, authenticated, anon;
