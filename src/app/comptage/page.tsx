import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { isStaffLeadRole } from '@/lib/roles';
import { createClient } from '@/lib/supabase/server';
import { todayInParis } from '@/lib/format';
import { BottomTabs } from '@/components/bottom-tabs';
import { AvatarCompte } from '@/components/avatar-compte';
import { PastilleEtat } from '@/components/rangee-menu';
import { SessionCard } from '@/components/session-card';
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

const HEURE = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
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
  const [{ data: sessions }, { data: equipe }] = await Promise.all([
    supabase
      .from('count_sessions')
      .select('id, date, session, status, submitted_at, user_id')
      .gte('date', ilYA(aujourdhui, 30))
      .order('date', { ascending: false })
      .order('session', { ascending: true }),
    supabase.from('team_members').select('id, full_name'),
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
            description="Avant l'ouverture — mise en place de la journée"
            session={carte('morning')}
          />
          <SessionCard
            kind="afternoon"
            title="Comptage de l'après-midi"
            description="Après le service du midi — relance pour le soir"
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
          <ul className="space-y-2.5">
            {[...parJour.entries()].map(([date, duJourLa]) => {
              const validees = duJourLa.filter((s) => s.status === 'submitted').length;
              const restant = duJourLa.reduce(
                (total, s) => total + tachesDe(s.id).filter((t) => !t.is_done).length,
                0,
              );

              return (
                <li key={date}>
                  <div className="bg-card rounded-3xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[17px] font-black capitalize">
                        {JOUR.format(new Date(`${date}T12:00:00Z`))}
                      </p>
                      <PastilleEtat
                        texte={validees === 2 ? '✓ Complet' : `${validees}/2`}
                        ton={validees === 2 ? 'fait' : 'alerte'}
                      />
                    </div>

                    <div className="mt-3 space-y-1">
                      {duJourLa.map((s) => (
                        <Link
                          key={s.id}
                          href={`/comptage/${slugForKind(s.session)}/rapport?jour=${date}`}
                          className="hover:bg-muted/60 -mx-2 flex items-center gap-2 rounded-xl px-2 py-2 transition-colors"
                        >
                          <span className="min-w-0 flex-1 text-sm font-bold">
                            {s.session === 'morning' ? 'Matin' : 'Après-midi'}
                            <span className="text-muted-foreground ml-2 font-semibold">
                              {s.submitted_at
                                ? `${HEURE.format(new Date(s.submitted_at))} · ${nomPar.get(s.user_id) ?? '—'}`
                                : 'non validé'}
                            </span>
                          </span>
                          <ChevronRight className="text-muted-foreground/60 size-4 shrink-0" />
                        </Link>
                      ))}
                    </div>

                    {restant > 0 ? (
                      <p className="text-muted-foreground mt-2 text-xs font-bold">
                        {restant} relance{restant > 1 ? 's' : ''} jamais cochée
                        {restant > 1 ? 's' : ''}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <BottomTabs isStaffLead={isStaffLeadRole(user.role)} />
    </>
  );
}
