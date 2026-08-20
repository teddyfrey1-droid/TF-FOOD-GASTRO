import Link from 'next/link';
import { ChevronRight, Settings2, UserRound } from 'lucide-react';
import { requireUser, isManagerRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { NotificationToggle } from '@/components/pwa/notification-toggle';
import { SessionCard } from '@/components/session-card';
import { BottomTabs } from '@/components/bottom-tabs';
import { todayInParis } from '@/lib/format';
import type { SessionKind } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  // Le serveur tourne en UTC : sans ce fuseau, la date affichée bascule
  // une à deux heures avant minuit à Paris.
  timeZone: 'Europe/Paris',
});

export default async function HomePage() {
  const user = await requireUser();
  const supabase = await createClient();

  // La RLS ne laisse passer que les sessions DU JOUR (§6.2 : l'accueil doit
  // indiquer qui a fait le comptage, pas seulement s'il est fait).
  // `toISOString()` donne la date UTC : entre minuit et 2 h à Paris, elle
  // vaut encore la veille, et l'accueil interrogeait alors le comptage
  // d'hier. La base raisonne en heure de Paris, l'application aussi.
  const isoToday = todayInParis();
  const today = new Date(`${isoToday}T12:00:00Z`);

  const [{ data: sessions }, { data: team }] = await Promise.all([
    supabase
      .from('count_sessions')
      .select('id, session, status, submitted_at, user_id')
      .eq('date', isoToday),
    supabase.from('team_members').select('id, full_name'),
  ]);

  // Ce qui reste à produire aujourd'hui. La RLS ne laisse passer que les
  // tâches du jour : aucune cible ni minimum n'accompagne ce décompte.
  const { data: tasks } = await supabase
    .from('production_tasks')
    .select('session_id, is_done')
    .in('session_id', (sessions ?? []).map((session) => session.id));

  const nameById = new Map((team ?? []).map((member) => [member.id, member.full_name]));

  const bySession = new Map(
    (sessions ?? []).map((s) => {
      const own = (tasks ?? []).filter((task) => task.session_id === s.id);
      return [
        s.session as SessionKind,
        {
          ...s,
          authorName: nameById.get(s.user_id) ?? null,
          pendingTasks: own.filter((task) => !task.is_done).length,
          doneTasks: own.filter((task) => task.is_done).length,
        },
      ];
    }),
  );

  const done = (['morning', 'afternoon'] as const).filter(
    (kind) => bySession.get(kind)?.status === 'submitted',
  ).length;
  const pendingTasks = (tasks ?? []).filter((task) => !task.is_done).length;

  const isManager = isManagerRole(user.role);

  return (
    <>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-6 pb-28">
        {/* En-tête façon Foodflow : le titre en très gras à gauche, l'état de
            la journée dans une pastille verte à droite. */}
        <header className="mb-7 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm font-semibold capitalize">
              {DATE_FORMAT.format(today)}
            </p>
            <h1 className="mt-1 truncate text-3xl font-black tracking-tight">
              Bonjour {user.fullName.trim().split(/\s+/)[0] || user.fullName}
            </h1>
          </div>

          <span
            className={
              done === 2
                ? 'bg-primary text-primary-foreground flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-black'
                : 'bg-alert text-alert-foreground flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-black'
            }
          >
            {done === 2 ? '✓ Journée faite' : `${done}/2 comptages`}
          </span>
        </header>

        <h2 className="mb-3 text-xl font-black tracking-tight">
          Aujourd&apos;hui <span className="text-muted-foreground">(2)</span>
        </h2>

        <div className="flex flex-col gap-3">
          <SessionCard
            kind="morning"
            title="Comptage du matin"
            description="Avant l'ouverture — mise en place de la journée"
            session={bySession.get('morning') ?? null}
          />
          <SessionCard
            kind="afternoon"
            title="Comptage de l'après-midi"
            description="Après le service du midi — relance pour le soir"
            session={bySession.get('afternoon') ?? null}
          />
        </div>

        {pendingTasks > 0 ? (
          <p className="text-muted-foreground mt-4 text-center text-sm font-semibold">
            {pendingTasks} relance{pendingTasks > 1 ? 's' : ''} encore à produire aujourd&apos;hui.
          </p>
        ) : null}

        {/* Les actions secondaires, en pilules pleine largeur : elles se
            touchent au pouce sans viser, et ne concurrencent pas les deux
            cartes de comptage. */}
        <nav className="mt-auto space-y-2.5 pt-10">
          <Link
            href="/compte"
            className="bg-muted/70 hover:bg-muted flex h-14 w-full items-center justify-between gap-3 rounded-2xl px-5 font-bold transition-colors"
          >
            <span className="flex items-center gap-3">
              <UserRound className="size-5" strokeWidth={2.5} />
              Mon compte
            </span>
            <ChevronRight className="text-muted-foreground size-4" />
          </Link>

          {isManager ? (
            <Link
              href="/admin"
              className="bg-muted/70 hover:bg-muted flex h-14 w-full items-center justify-between gap-3 rounded-2xl px-5 font-bold transition-colors"
            >
              <span className="flex items-center gap-3">
                <Settings2 className="size-5" strokeWidth={2.5} />
                Gestion
              </span>
              <ChevronRight className="text-muted-foreground size-4" />
            </Link>
          ) : null}

          <NotificationToggle />
        </nav>
      </main>

      <BottomTabs isManager={isManager} />
    </>
  );
}
