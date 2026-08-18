'use client';

import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatEuro, formatPercent } from '@/lib/format';
import {
  saveActualRevenue,
  saveDayForecast,
  saveRevenueSettings,
  type SettingsState,
} from '@/app/admin/chiffre-affaires/actions';
import type { RevenueSettings } from '@/lib/mep';

export interface MonthDay {
  date: string;
  forecastRevenue: number | null;
  manualRevenue: number | null;
  coefficient: number;
  isClosedDay: boolean;
  actualRevenue: number | null;
  actualLunchRevenue: number | null;
}

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit' });
const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function parseNumber(raw: string): number {
  return Number(raw.trim().replace(',', '.'));
}

export function RevenueWorkbench({
  settings,
  monthKey,
  days,
  today,
}: {
  settings: RevenueSettings;
  monthKey: string;
  days: MonthDay[];
  today: string;
}) {
  return (
    <Tabs defaultValue="calendrier">
      <TabsList>
        <TabsTrigger value="calendrier">Calendrier</TabsTrigger>
        <TabsTrigger value="reglages">Réglages</TabsTrigger>
      </TabsList>

      <TabsContent value="calendrier" className="mt-5">
        <MonthTable monthKey={monthKey} days={days} today={today} />
      </TabsContent>

      <TabsContent value="reglages" className="mt-5">
        <SettingsForm settings={settings} />
      </TabsContent>
    </Tabs>
  );
}

function MonthTable({
  monthKey,
  days,
  today,
}: {
  monthKey: string;
  days: MonthDay[];
  today: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const monthLabel = MONTH_LABEL.format(new Date(`${monthKey}-01T12:00:00Z`));

  const forecastTotal = days.reduce((sum, day) => sum + (day.forecastRevenue ?? 0), 0);
  const actualTotal = days.reduce((sum, day) => sum + (day.actualRevenue ?? 0), 0);
  const comparable = days.filter((day) => day.actualRevenue !== null && day.forecastRevenue !== null);
  const gap =
    comparable.length === 0
      ? null
      : comparable.reduce(
          (sum, day) => sum + (day.actualRevenue! - day.forecastRevenue!) / day.forecastRevenue!,
          0,
        ) / comparable.length;

  function updateDay(date: string, patch: Partial<MonthDay>, base: MonthDay) {
    startTransition(async () => {
      const result = await saveDayForecast({
        date,
        coefficient: patch.coefficient ?? base.coefficient,
        forecast_revenue:
          patch.manualRevenue !== undefined ? patch.manualRevenue : base.manualRevenue,
        is_closed_day: patch.isClosedDay ?? base.isClosedDay,
      });
      setError(result.error ?? null);
    });
  }

  function updateActual(date: string, revenue: string, lunch: string) {
    if (revenue.trim() === '') return;
    startTransition(async () => {
      const result = await saveActualRevenue({
        date,
        revenue_ht: parseNumber(revenue),
        revenue_lunch_ht: lunch.trim() === '' ? null : parseNumber(lunch),
      });
      setError(result.error ?? null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`?mois=${shiftMonth(monthKey, -1)}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          ← Mois précédent
        </Link>
        <span className="font-medium capitalize">{monthLabel}</span>
        <Link
          href={`?mois=${shiftMonth(monthKey, 1)}`}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Mois suivant →
        </Link>
        {pending ? <span className="text-muted-foreground text-sm">Enregistrement…</span> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Prévu sur le mois</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatEuro(forecastTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Réalisé saisi</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{formatEuro(actualTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-xs">Écart moyen prévu / réalisé</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {gap === null ? '—' : `${gap >= 0 ? '+' : ''}${formatPercent(gap, 1)}`}
          </p>
        </Card>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th scope="col" className="px-4 py-3 text-left font-semibold">Jour</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">CA prévu</th>
              <th scope="col" className="px-3 py-3 text-center font-semibold">Coefficient</th>
              <th scope="col" className="px-3 py-3 text-center font-semibold">Écrasement manuel</th>
              <th scope="col" className="px-3 py-3 text-center font-semibold">Fermé</th>
              <th scope="col" className="px-3 py-3 text-center font-semibold">CA réel</th>
              <th scope="col" className="px-3 py-3 text-center font-semibold">dont midi</th>
            </tr>
          </thead>

          <tbody>
            {days.map((day) => (
              <DayRow
                key={day.date}
                day={day}
                isToday={day.date === today}
                onForecastChange={(patch) => updateDay(day.date, patch, day)}
                onActualChange={(revenue, lunch) => updateActual(day.date, revenue, lunch)}
              />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DayRow({
  day,
  isToday,
  onForecastChange,
  onActualChange,
}: {
  day: MonthDay;
  isToday: boolean;
  onForecastChange: (patch: Partial<MonthDay>) => void;
  onActualChange: (revenue: string, lunch: string) => void;
}) {
  const [coefficient, setCoefficient] = useState(String(day.coefficient));
  const [manual, setManual] = useState(day.manualRevenue === null ? '' : String(day.manualRevenue));
  const [actual, setActual] = useState(day.actualRevenue === null ? '' : String(day.actualRevenue));
  const [lunch, setLunch] = useState(
    day.actualLunchRevenue === null ? '' : String(day.actualLunchRevenue),
  );

  const label = WEEKDAY.format(new Date(`${day.date}T12:00:00Z`));

  return (
    <tr className={`border-b last:border-0 ${isToday ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
      <th scope="row" className="px-4 py-2 text-left font-medium capitalize">
        {label}
        {isToday ? <span className="text-primary ml-2 text-xs">aujourd&apos;hui</span> : null}
      </th>

      <td className="px-3 py-2 text-right tabular-nums">
        {day.isClosedDay ? (
          <span className="text-muted-foreground text-xs">fermé</span>
        ) : (
          formatEuro(day.manualRevenue ?? day.forecastRevenue)
        )}
      </td>

      <td className="px-3 py-2 text-center">
        <Input
          value={coefficient}
          inputMode="decimal"
          aria-label={`Coefficient du ${day.date}`}
          onChange={(event) => setCoefficient(event.target.value)}
          onBlur={() => {
            const value = parseNumber(coefficient);
            if (Number.isFinite(value) && value !== day.coefficient) {
              onForecastChange({ coefficient: value });
            }
          }}
          className="h-9 w-20 text-center tabular-nums"
        />
      </td>

      <td className="px-3 py-2 text-center">
        <Input
          value={manual}
          inputMode="decimal"
          placeholder="auto"
          aria-label={`CA imposé du ${day.date}`}
          onChange={(event) => setManual(event.target.value)}
          onBlur={() => {
            const value = manual.trim() === '' ? null : parseNumber(manual);
            if (value !== day.manualRevenue) onForecastChange({ manualRevenue: value });
          }}
          className="h-9 w-24 text-center tabular-nums"
        />
      </td>

      <td className="px-3 py-2 text-center">
        <Switch
          checked={day.isClosedDay}
          aria-label={`Jour de fermeture du ${day.date}`}
          onCheckedChange={(checked) => onForecastChange({ isClosedDay: checked })}
        />
      </td>

      <td className="px-3 py-2 text-center">
        <Input
          value={actual}
          inputMode="decimal"
          placeholder="—"
          aria-label={`CA réel du ${day.date}`}
          onChange={(event) => setActual(event.target.value)}
          onBlur={() => onActualChange(actual, lunch)}
          className="h-9 w-24 text-center tabular-nums"
        />
      </td>

      <td className="px-3 py-2 text-center">
        <Input
          value={lunch}
          inputMode="decimal"
          placeholder="—"
          aria-label={`CA du midi du ${day.date}`}
          onChange={(event) => setLunch(event.target.value)}
          onBlur={() => onActualChange(actual, lunch)}
          className="h-9 w-24 text-center tabular-nums"
        />
      </td>
    </tr>
  );
}

function SettingsForm({ settings }: { settings: RevenueSettings }) {
  const [state, formAction] = useActionState<SettingsState, FormData>(saveRevenueSettings, {});

  return (
    <Card className="max-w-2xl p-6">
      <form action={formAction} className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="growth_rate">Taux de croissance sur N-1</Label>
            <Input
              id="growth_rate"
              name="growth_rate"
              inputMode="decimal"
              defaultValue={settings.growthRate}
            />
            <p className="text-muted-foreground text-xs">0,10 = +10 % par rapport à l&apos;an dernier.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="safety_margin">Marge de sécurité</Label>
            <Input
              id="safety_margin"
              name="safety_margin"
              inputMode="decimal"
              defaultValue={settings.safetyMargin}
            />
            <p className="text-muted-foreground text-xs">
              0,10 = on prépare pour 10 % de CA en plus que prévu.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="afternoon_target_ratio">Coefficient de l&apos;après-midi</Label>
            <Input
              id="afternoon_target_ratio"
              name="afternoon_target_ratio"
              inputMode="decimal"
              defaultValue={settings.afternoonTargetRatio}
            />
            <p className="text-muted-foreground text-xs">
              1,0 = même cible le soir que le matin. Abaissez-le si vous constatez de la
              surproduction.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_reorder_ratio">Seuil de relance par défaut</Label>
            <Input
              id="default_reorder_ratio"
              name="default_reorder_ratio"
              inputMode="decimal"
              defaultValue={settings.defaultReorderRatio}
            />
            <p className="text-muted-foreground text-xs">
              0,5 = on relance sous 50 % de la cible, pour les produits qui n&apos;ont pas leur
              propre réglage.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="morning_reminder_time">Rappel du matin</Label>
            <Input id="morning_reminder_time" name="morning_reminder_time" type="time" defaultValue="07:30" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="afternoon_reminder_time">Rappel de l&apos;après-midi</Label>
            <Input id="afternoon_reminder_time" name="afternoon_reminder_time" type="time" defaultValue="15:00" />
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
          <Switch
            name="show_targets_to_employees"
            defaultChecked={settings.showTargetsToEmployees}
          />
          <span>
            <span className="font-medium">Montrer les cibles aux employés</span>
            <span className="text-muted-foreground mt-1 block text-xs">
              Désactivé par défaut. Activé, les employés voient la cible et le seuil de chaque
              produit — mais jamais le chiffre d&apos;affaires.
            </span>
          </span>
        </label>

        {state.error ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            {state.error}
          </p>
        ) : null}
        {state.success ? <p className="text-sm font-medium">Réglages enregistrés.</p> : null}

        <Button type="submit">Enregistrer les réglages</Button>
      </form>
    </Card>
  );
}
