import { requireUser, isManagerRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/pwa/sign-out-button';
import { NotificationToggle } from '@/components/pwa/notification-toggle';
import { SessionCard } from '@/components/session-card';
import { BottomTabs } from '@/components/bottom-tabs';
import type { SessionKind } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export default async function HomePage() {
  const user = await requireUser();
  const supabase = await createClient();

  // La RLS ne laisse passer que les sessions DU JOUR (§6.2 : l'accueil doit
  // indiquer qui a fait le comptage, pas seulement s'il est fait).
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);

  const [{ data: sessions }, { data: team }] = await Promise.all([
    supabase
      .from('count_sessions')
      .select('id, session, status, submitted_at, user_id')
      .eq('date', isoToday),
    supabase.from('team_members').select('id, full_name'),
  ]);

  const nameById = new Map((team ?? []).map((member) => [member.id, member.full_name]));

  const bySession = new Map(
    (sessions ?? []).map((s) => [
      s.session as SessionKind,
      { ...s, authorName: nameById.get(s.user_id) ?? null },
    ]),
  );

  return (
    <>
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-8 pb-28">
        <header className="mb-8">
          <p className="text-muted-foreground text-sm font-medium capitalize">
            {DATE_FORMAT.format(today)}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Bonjour {user.fullName}</h1>
        </header>

        <div className="flex flex-col gap-4">
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

        <div className="mt-auto space-y-3 pt-10">
          <NotificationToggle />
          <SignOutButton />
        </div>
      </main>

      <BottomTabs isManager={isManagerRole(user.role)} />
    </>
  );
}
