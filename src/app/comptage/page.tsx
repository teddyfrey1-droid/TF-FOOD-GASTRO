import { aLeDroit, requireUser } from '@/lib/auth';
import { isStaffLeadRole } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { ouvertureAVenir, todayInParis } from '@/lib/format';
import { getCountHours } from '@/lib/admin/queries';
import { BottomTabs } from '@/components/bottom-tabs';
import { AvatarCompte } from '@/components/avatar-compte';
import { SessionCard } from '@/components/session-card';
import { JourneePassee } from '@/components/comptage/journee-passee';
import { slugForKind } from './slugs';
import type { SessionKind } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Comptages — Lafayette' };

const JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Paris',
});

/** Recule de N jours sur une date ISO, sans passer par le fuseau local. */
function ilYA(isoDate: string, jours: number): string {
  const curseur = new Date(`${isoDate}T12:00:00Z`);
  curseur.setUTCDate(curseur.getUTCDate() - jours);
  return curseur.toISOString().slice(0, 10);
}

export default async function PageComptages() {
  const user = await requireUser();
  const supabase = await createClient();
  const aujourdhui = todayInParis();

  // La RLS ne laisse un employé voir que le comptage DU JOUR. L'encadrement
  // voit l'historique complet : la même page sert donc les deux, et montre
  // simplement ce que la base accepte de renvoyer.
  const [{ data: sessions }, { data: equipe }, heures] = await Promise.all([
    supabase
      .from('count_sessions')
      .select('id, date, session, status, submitted_at, user_id')
      .gte('date', ilYA(aujourdhui, 30))
      .order('date', { ascending: false })
      .order('session', { ascending: true }),
    supabase.from('team_members').select('id, full_name'),
    getCountHours(),
  ]);

  const { data: taches } = await supabase
    .from('production_tasks')
    .select('session_id, is_done')
    .in('session_id', (sessions ?? []).map((s) => s.id));

  const nomPar = new Map((equipe ?? []).map((m) => [m.id, m.full_name]));
  const tachesDe = (id: string) => (taches ?? []).filter((t) => t.session_id === id);

  const duJour = (sessions ?? []).filter((s) => s.date === aujourdhui);
  const passees = (sessions ?? []).filter((s) => s.date !== aujourdhui);

  const carte = (kind: SessionKind) => {
    const s = duJour.find((candidate) => candidate.session === kind);
    if (!s) return null;
    const own = tachesDe(s.id);
    return {
      id: s.id,
      status: s.status,
      submitted_at: s.submitted_at,
      authorName: nomPar.get(s.user_id) ?? null,
      pendingTasks: own.filter((t) => !t.is_done).length,
      doneTasks: own.filter((t) => t.is_done).length,
    };
  };

  // Les jours passés se regroupent par date : une ligne par journée, avec
  // ses deux comptages dedans. Une liste plate de trente lignes ne se
  // parcourt pas — on cherche un JOUR, pas une session.
  const parJour = new Map<string, typeof passees>();
  for (const s of passees) {
    parJour.set(s.date, [...(parJour.get(s.date) ?? []), s]);
  }

  const peutSimuler = await aLeDroit('simulateur');

  return (
    <>
      <main className="pt-safe-header mx-auto w-full max-w-md px-5 pt-4 pb-28">
        <header className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-[28px] leading-tight font-black tracking-tight">Comptages</h1>
          <AvatarCompte nom={user.fullName} />
        </header>

        <h2 className="mb-3 text-xl font-black tracking-tight">Aujourd&apos;hui</h2>

        <div className="flex flex-col gap-3">
          <SessionCard
            kind="morning"
            title="Comptage du matin"
            ouvreA={ouvertureAVenir(heures?.morning)}
            session={carte('morning')}
          />
          <SessionCard
            kind="afternoon"
            title="Comptage de l'après-midi"
            ouvreA={ouvertureAVenir(heures?.afternoon)}
            session={carte('afternoon')}
          />
        </div>

        <h2 className="mt-8 mb-3 flex items-center gap-2 text-xl font-black tracking-tight">
          Les jours passés
          {parJour.size > 0 ? (
            <span className="text-muted-foreground">({parJour.size})</span>
          ) : null}
        </h2>

        {parJour.size === 0 ? (
          <p className="bg-muted/50 text-muted-foreground rounded-3xl p-5 text-sm font-medium">
            {isStaffLeadRole(user.role)
              ? 'Aucun comptage validé sur les trente derniers jours.'
              : 'L’historique des journées passées est réservé à l’encadrement. Les comptages du jour restent visibles ci-dessus.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {[...parJour.entries()].map(([date, duJourLa]) => (
              <li key={date}>
                <JourneePassee
                  dateLisible={JOUR.format(new Date(`${date}T12:00:00Z`))}
                  validees={duJourLa.filter((s) => s.status === 'submitted').length}
                  relancesEnAttente={duJourLa.reduce(
                    (total, s) => total + tachesDe(s.id).filter((t) => !t.is_done).length,
                    0,
                  )}
                  comptages={duJourLa.map((s) => ({
                    id: s.id,
                    session: s.session as 'morning' | 'afternoon',
                    status: s.status,
                    submittedAt: s.submitted_at,
                    auteur: nomPar.get(s.user_id) ?? null,
                    href: `/comptage/${slugForKind(s.session)}/rapport?jour=${date}`,
                  }))}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <BottomTabs isStaffLead={isStaffLeadRole(user.role)} isManager={peutSimuler} />
    </>
  );
}
