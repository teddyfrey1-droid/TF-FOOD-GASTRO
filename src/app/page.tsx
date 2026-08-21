import { requireUser } from '@/lib/auth';
import Link from 'next/link';
import { Check, ChevronRight, CircleAlert, Refrigerator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isManagerRole, isStaffLeadRole } from '@/lib/roles';
import {
  getForecastRevenue,
  getGrowthWindows,
  getLastYearRevenue,
  getRevenueCoverage,
  getCountHours,
  getRevenueSettings,
} from '@/lib/admin/queries';
import { BlocChiffreAffaires } from '@/components/admin/bloc-chiffre-affaires';
import { GrowthObservedCard } from '@/components/admin/growth-card';
import { createClient } from '@/lib/supabase/server';
import { NotificationToggle } from '@/components/pwa/notification-toggle';
import { SessionCard } from '@/components/session-card';
import { BottomTabs } from '@/components/bottom-tabs';
import { AvatarCompte } from '@/components/avatar-compte';
import { PastilleEtat } from '@/components/rangee-menu';
import { ouvertureAVenir, todayInParis } from '@/lib/format';
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

  // `toISOString()` donne la date UTC : entre minuit et 2 h à Paris, elle
  // vaut encore la veille, et l'accueil interrogeait alors le comptage
  // d'hier. La base raisonne en heure de Paris, l'application aussi.
  const isoToday = todayInParis();
  const today = new Date(`${isoToday}T12:00:00Z`);

  const [{ data: sessions }, { data: team }, heures] = await Promise.all([
    supabase
      .from('count_sessions')
      .select('id, session, status, submitted_at, user_id')
      .eq('date', isoToday),
    supabase.from('team_members').select('id, full_name'),
    getCountHours(),
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

  const prenom = user.fullName.trim().split(/\s+/)[0] || user.fullName;
  const tousFaits = done === 2 && pendingTasks === 0;

  // Le chiffre d'affaires n'est pas une donnée d'équipe : il ne se charge
  // que si l'appelant est directeur ou propriétaire. La base refuserait de
  // toute façon de le servir, mais on ne le DEMANDE même pas — un employé
  // ne doit pas voir passer une requête qui échoue sur du CA.
  const directeur = isManagerRole(user.role);

  const ca = directeur
    ? await (async () => {
        const [forecast, anDernier, settings, windows, coverage] = await Promise.all([
          getForecastRevenue(isoToday),
          getLastYearRevenue(isoToday),
          getRevenueSettings(),
          getGrowthWindows(isoToday),
          getRevenueCoverage(),
        ]);
        return { forecast, anDernier, settings, windows, coverage };
      })()
    : null;

  const fenetres = (ca?.windows ?? []).map((window) => ({
    label: window.label,
    days: window.days,
    rate: window.observation.observedRate,
  }));

  return (
    <>
      {/* Le directeur reçoit le bloc du chiffre d'affaires : sur grand
          écran, la colonne s'élargit pour qu'il tienne en deux cartes
          côte à côte. Sur un téléphone, les deux largeurs se valent. */}
      <main
        className={cn(
          'pt-safe-header mx-auto flex min-h-dvh w-full flex-col px-5 pt-4 pb-28',
          ca ? 'max-w-3xl' : 'max-w-md',
        )}
      >
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm font-bold capitalize">
              {DATE_FORMAT.format(today)}
            </p>
            <h1 className="mt-0.5 truncate text-[28px] leading-tight font-black tracking-tight">
              Bonjour {prenom}
            </h1>
          </div>

          <AvatarCompte nom={user.fullName} />
        </header>

        {/* L'état de la journée en une ligne.

            Deux phrases empilées dans un gros aplat de couleur faisaient
            doublon : la seconde répétait la première, et le compteur `0/2`
            juste en dessous la répétait une troisième fois. Une seule
            phrase, un liseré plutôt qu'un aplat plein. */}
        <div
          className={cn(
            'mb-6 flex items-center gap-3 rounded-2xl border px-4 py-3.5',
            tousFaits
              ? 'border-primary/25 bg-primary/10 text-primary'
              : 'border-alert-border bg-alert text-alert-foreground',
          )}
        >
          <span aria-hidden className="shrink-0">
            {tousFaits ? (
              <Check className="size-5" strokeWidth={3} />
            ) : (
              <CircleAlert className="size-5" strokeWidth={2.6} />
            )}
          </span>
          <p className="text-[15px] leading-snug font-black">
            {tousFaits
              ? 'Tout est à jour.'
              : done === 2
                ? `${pendingTasks} relance${pendingTasks > 1 ? 's' : ''} encore à produire.`
                : done === 1
                  ? 'Il reste un comptage à faire.'
                  : 'Les deux comptages sont à faire.'}
          </p>
        </div>

        {/* Ce qui est annoncé pour aujourd'hui, avant les comptages : le
            directeur juge la cohérence de la prévision en ouvrant
            l'application, sans passer par Gestion. */}
        {ca ? (
          <div className="mb-7">
            <BlocChiffreAffaires
              forecast={ca.forecast}
              anDernier={ca.anDernier}
              growthRate={ca.settings.growthRate}
              windows={fenetres}
              coverage={ca.coverage}
            />
          </div>
        ) : null}

        <h2 className="mb-3 flex items-center gap-2.5 text-2xl font-black tracking-tight">
          Aujourd&apos;hui
          <PastilleEtat texte={`${done}/2`} ton={done === 2 ? 'fait' : 'alerte'} />
        </h2>

        <div className="flex flex-col gap-3">
          <SessionCard
            kind="morning"
            title="Comptage du matin"
            ouvreA={ouvertureAVenir(heures?.morning)}
            contournable={isStaffLeadRole(user.role)}
            session={bySession.get('morning') ?? null}
          />
          <SessionCard
            kind="afternoon"
            title="Comptage de l'après-midi"
            ouvreA={ouvertureAVenir(heures?.afternoon)}
            contournable={isStaffLeadRole(user.role)}
            session={bySession.get('afternoon') ?? null}
          />
        </div>

        {/* Le raccourci vers les quantités : la question « il y en a
            combien ? » se pose en plein service, pas en ouvrant
            l'application. Une ligne suffit, mais elle doit être là. */}
        <Link
          href="/stocks"
          className="bg-card hover:bg-muted/40 mt-4 flex items-center gap-3 rounded-2xl border p-4 transition-colors"
        >
          <span
            aria-hidden
            className="bg-muted text-foreground/70 flex size-11 shrink-0 items-center justify-center rounded-xl"
          >
            <Refrigerator className="size-5" strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-tight font-bold">
              Voir ce qu’il y a dans les frigos
            </span>
            <span className="text-muted-foreground mt-0.5 block text-[12px] font-semibold">
              Les quantités du dernier comptage, avec recherche
            </span>
          </span>
          <ChevronRight className="text-muted-foreground/60 size-5 shrink-0" strokeWidth={2.5} />
        </Link>

        {ca ? (
          <div className="mt-7">
            <GrowthObservedCard currentRate={ca.settings.growthRate} windows={fenetres} />
          </div>
        ) : null}

        <div className="mt-auto pt-8">
          <NotificationToggle />
        </div>
      </main>

      <BottomTabs isStaffLead={isStaffLeadRole(user.role)} isManager={isManagerRole(user.role)} />
    </>
  );
}
