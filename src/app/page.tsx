import Link from 'next/link';
import { requireUser, isManagerRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/connexion/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { SessionCard } from '@/components/session-card';
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

  // Un employé ne reçoit ici que SES sessions du jour (RLS).
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);

  const { data: sessions } = await supabase
    .from('count_sessions')
    .select('id, session, status, submitted_at, user_id')
    .eq('date', isoToday);

  const bySession = new Map((sessions ?? []).map((s) => [s.session as SessionKind, s]));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <header className="mb-8">
        <p className="text-muted-foreground text-sm capitalize">{DATE_FORMAT.format(today)}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Bonjour {user.fullName}</h1>
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
          description="Après le rush du midi — relance pour le soir"
          session={bySession.get('afternoon') ?? null}
        />
      </div>

      <div className="mt-auto space-y-3 pt-10">
        {isManagerRole(user.role) ? (
          <Link href="/admin" className={buttonVariants({ variant: 'outline', className: 'h-11 w-full' })}>
            Back-office
          </Link>
        ) : null}

        <form action={signOut}>
          <Button type="submit" variant="ghost" className="text-muted-foreground h-11 w-full">
            Se déconnecter
          </Button>
        </form>
      </div>
    </main>
  );
}
