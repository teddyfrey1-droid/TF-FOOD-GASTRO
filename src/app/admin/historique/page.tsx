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
    getConsumption(from, to),
    supabase.from('team_members').select('id, full_name'),
  ]);

  // Observations produit, pour la détection d'anomalies.
  const sessionIds = sessions.map((session) => session.id);
  const { data: lines } = sessionIds.length
    ? await supabase
        .from('count_lines')
        .select(
          'session_id, product_id, qty_total, target_snapshot, reorder_threshold_snapshot, is_not_applicable',
        )
        .in('session_id', sessionIds)
    : { data: [] };

  const { data: products } = await supabase.from('products').select('id, name');
  const productName = new Map((products ?? []).map((product) => [product.id, product.name]));
  const dateBySession = new Map(sessions.map((session) => [session.id, session.date]));

  const observations: ProductObservation[] = (lines ?? []).map((line) => ({
    date: dateBySession.get(line.session_id) ?? from,
    productName: productName.get(line.product_id) ?? '—',
    qtyTotal: toNumber(line.qty_total, 0),
    targetSnapshot: toNullableNumber(line.target_snapshot),
    thresholdSnapshot: toNullableNumber(line.reorder_threshold_snapshot),
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
          <h1 className="text-2xl font-bold tracking-tight">Historique</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Qui a compté quoi, quand, avec quelles cibles — et ce qui a réellement été consommé.
          </p>
        </div>

        <Link
          href={`/admin/historique/export?${query.toString()}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Exporter en CSV
        </Link>
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
          <TabsTrigger value="anomalies">Anomalies ({anomalies.length})</TabsTrigger>
          <TabsTrigger value="consommation">Consommation</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-5">
          <SessionsTable sessions={sessions} />
        </TabsContent>

        <TabsContent value="anomalies" className="mt-5">
          <AnomaliesPanel anomalies={anomalies} />
        </TabsContent>

        <TabsContent value="consommation" className="mt-5">
          <ConsumptionTable report={consumption} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
