import { requireStaffLead } from '@/lib/auth';
import { isManagerRole } from '@/lib/roles';
import Link from 'next/link';
import { getConsumption, getSessions } from '@/lib/admin/history';
import { createClient } from '@/lib/supabase/server';
import { todayInParis } from '@/lib/format';
import {
  detectProductAnomalies,
  detectSessionAnomalies,
  sortAnomalies,
  type ProductObservation,
} from '@/lib/mep';
import { toNullableNumber, toNumber } from '@/lib/admin/mappers';
import { HistoryFiltersBar } from '@/components/admin/history-filters';
import { SessionsTable } from '@/components/admin/sessions-table';
import { HistoriqueSynthese } from '@/components/admin/historique-synthese';
import { HistoriqueParPersonne } from '@/components/admin/historique-par-personne';
import { AnomaliesPanel } from '@/components/admin/anomalies-panel';
import { ConsumptionTable } from '@/components/admin/consumption-table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buttonVariants } from '@/components/ui/button';
import type { SessionKind } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

function daysBefore(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ du?: string; au?: string; session?: string; employe?: string }>;
}) {
  const user = await requireStaffLead();
  const estDirecteur = isManagerRole(user.role);
  const params = await searchParams;
  const today = todayInParis();

  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.au ?? '') ? params.au! : today;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.du ?? '') ? params.du! : daysBefore(to, 29);
  const sessionFilter =
    params.session === 'morning' || params.session === 'afternoon'
      ? (params.session as SessionKind)
      : undefined;

  const supabase = await createClient();

  const [sessions, consumption, { data: team }] = await Promise.all([
    getSessions({ from, to, session: sessionFilter, userId: params.employe }),
    // La consommation se lit avec le CA : elle reste au directeur.
    estDirecteur ? getConsumption(from, to) : Promise.resolve(null),
    supabase.from('team_members').select('id, full_name'),
  ]);

  // Observations produit, pour la détection d'anomalies. Elles comparent
  // le stock relevé à la cible du jour : réservées au directeur, comme
  // toute lecture de cible. Un assistant manager n'a simplement pas
  // l'onglet.
  const { data: rawObservations } = estDirecteur
    ? await supabase.rpc('mep_count_observations', { d_from: from, d_to: to })
    : { data: [] };

  const observations: ProductObservation[] = (rawObservations ?? []).map((line) => ({
    date: line.date,
    productName: line.product_name,
    qtyTotal: toNumber(line.qty_total, 0),
    targetSnapshot: toNullableNumber(line.target_snapshot),
    thresholdSnapshot: toNullableNumber(line.min_snapshot),
    isNotApplicable: line.is_not_applicable,
  }));

  // On n'attend des comptages que sur les jours déjà passés.
  const expectedDates = datesBetween(from, to).filter((date) => date < today);

  const anomalies = sortAnomalies([
    ...detectSessionAnomalies(
      sessions.map((session) => ({
        date: session.date,
        session: session.session,
        status: session.status,
        durationMinutes: session.durationMinutes,
      })),
      expectedDates,
    ),
    ...detectProductAnomalies(observations),
  ]);

  const query = new URLSearchParams({ du: from, au: to });
  if (sessionFilter) query.set('session', sessionFilter);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Historique</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {estDirecteur
              ? 'Qui a compté quoi, quand, avec quelles cibles — et ce qui a réellement été consommé.'
              : 'Qui a compté quoi, quand, et ce qui restait à produire.'}
          </p>
        </div>

        {estDirecteur ? (
          <Link
            href={`/admin/historique/export?${query.toString()}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Exporter en CSV
          </Link>
        ) : null}
      </header>

      <HistoryFiltersBar
        from={from}
        to={to}
        session={sessionFilter}
        employe={params.employe}
        team={team ?? []}
      />

      <Tabs defaultValue="sessions">
        <TabsList>
          <TabsTrigger value="sessions">Comptages ({sessions.length})</TabsTrigger>
          {estDirecteur ? (
            <>
              <TabsTrigger value="anomalies">Anomalies ({anomalies.length})</TabsTrigger>
              <TabsTrigger value="consommation">Consommation</TabsTrigger>
            </>
          ) : null}
        </TabsList>

        <TabsContent value="sessions" className="mt-5 space-y-5">
          <HistoriqueSynthese sessions={sessions} joursAttendus={expectedDates.length} />
          <SessionsTable sessions={sessions} />
          <HistoriqueParPersonne sessions={sessions} />
        </TabsContent>

        {estDirecteur ? (
          <>
            <TabsContent value="anomalies" className="mt-5">
              <AnomaliesPanel anomalies={anomalies} />
            </TabsContent>

            <TabsContent value="consommation" className="mt-5">
                  {consumption ? <ConsumptionTable report={consumption} /> : null}
            </TabsContent>
          </>
        ) : null}
      </Tabs>
    </div>
  );
}
