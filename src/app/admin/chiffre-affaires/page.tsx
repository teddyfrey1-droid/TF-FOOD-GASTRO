import { createClient } from '@/lib/supabase/server';
import { getObservedGrowth, getRevenueSettings } from '@/lib/admin/queries';
import { todayInParis } from '@/lib/format';
import { toNullableNumber } from '@/lib/admin/mappers';
import { RevenueWorkbench, type MonthDay } from '@/components/admin/revenue-workbench';

export const dynamic = 'force-dynamic';

/** Toutes les dates du mois demandé, au format YYYY-MM-DD. */
function daysOfMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  while (cursor.getUTCMonth() === month - 1) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const { mois } = await searchParams;
  const today = todayInParis();
  const monthKey = /^\d{4}-\d{2}$/.test(mois ?? '') ? mois! : today.slice(0, 7);
  const [year, month] = monthKey.split('-').map(Number);

  const days = daysOfMonth(year, month);
  const first = days[0];
  const last = days[days.length - 1];

  const supabase = await createClient();

  // La croissance constatée se mesure sur une fenêtre glissante, pas sur le
  // seul mois affiché : un mois isolé est trop court pour conclure.
  const growthWindowStart = (() => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 90);
    return date.toISOString().slice(0, 10);
  })();

  // Le CA prévisionnel du mois entier arrive en UN appel. Le calculer jour
  // par jour coûtait trente-et-un allers-retours pour afficher un tableau :
  // c'était la première cause de lenteur de cet écran.
  const [settings, forecasts, actuals, history, growth, computed] = await Promise.all([
    getRevenueSettings(),
    supabase.from('daily_forecast').select('*').gte('date', first).lte('date', last),
    supabase.from('revenue_actuals').select('*').gte('date', first).lte('date', last),
    supabase.from('revenue_history').select('date').limit(1),
    getObservedGrowth(growthWindowStart, today),
    supabase.rpc('mep_forecast_range', { d_from: first, d_to: last }),
  ]);

  const forecastByDate = new Map((forecasts.data ?? []).map((row) => [row.date, row]));
  const actualByDate = new Map((actuals.data ?? []).map((row) => [row.date, row]));
  const computedByDate = new Map(
    (computed.data ?? []).map((row) => [row.date, toNullableNumber(row.forecast)] as const),
  );

  const rows: MonthDay[] = days.map((date) => {
    const forecast = forecastByDate.get(date);
    const actual = actualByDate.get(date);
    return {
      date,
      forecastRevenue: computedByDate.get(date) ?? null,
      manualRevenue: toNullableNumber(forecast?.forecast_revenue),
      coefficient: toNullableNumber(forecast?.coefficient) ?? 1,
      isClosedDay: forecast?.is_closed_day ?? false,
      actualRevenue: toNullableNumber(actual?.revenue_ht),
      actualLunchRevenue: toNullableNumber(actual?.revenue_lunch_ht),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Chiffre d&apos;affaires</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Réglages du calcul, prévision jour par jour et saisie du réalisé. Ces données ne sont
          jamais accessibles à un employé.
        </p>
      </header>

      {(history.data ?? []).length === 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          Aucun historique de CA n&apos;est chargé : les prévisions resteront vides. Importez le CA
          de l&apos;an dernier avec{' '}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">pnpm import:ca</code>.
        </div>
      ) : null}

      <RevenueWorkbench
        settings={settings}
        monthKey={monthKey}
        days={rows}
        today={today}
        growth={growth}
      />
    </div>
  );
}
