'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { formatEuro, formatQty } from '@/lib/format';
import { runSimulation, type SimulationResult } from '@/app/admin/calculateur/simulate';
import type { RevenueSettings } from '@/lib/mep';
import type { SessionKind } from '@/lib/supabase/database.types';

function parseNumber(raw: string): number {
  return Number(raw.trim().replace(',', '.'));
}

export function TargetSimulator({ settings }: { settings: RevenueSettings }) {
  const [revenue, setRevenue] = useState('3200');
  const [session, setSession] = useState<SessionKind>('morning');
  const [stocks, setStocks] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [pending, startTransition] = useTransition();

  function simulate(nextStocks: Record<string, string> = stocks) {
    const parsedStocks: Record<string, number> = {};
    for (const [productId, raw] of Object.entries(nextStocks)) {
      if (raw.trim() === '') continue;
      const value = parseNumber(raw);
      if (Number.isFinite(value) && value >= 0) parsedStocks[productId] = value;
    }

    startTransition(async () => {
      setResult(
        await runSimulation({
          forecastRevenue: parseNumber(revenue),
          session,
          settings,
          stocks: parsedStocks,
        }),
      );
    });
  }

  const withoutRule = result?.lines.filter((line) => !line.hasRule) ?? [];

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="simulated-revenue">CA prévisionnel du jour</Label>
            <div className="flex items-center gap-2">
              <Input
                id="simulated-revenue"
                value={revenue}
                inputMode="decimal"
                onChange={(event) => setRevenue(event.target.value)}
                className="h-10 w-32 tabular-nums"
              />
              <span className="text-muted-foreground text-sm">€ HT</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="simulated-session">Session</Label>
            <select
              id="simulated-session"
              value={session}
              onChange={(event) => setSession(event.target.value as SessionKind)}
              className="border-input bg-background h-10 rounded-md border px-3 text-sm"
            >
              <option value="morning">Matin</option>
              <option value="afternoon">Après-midi</option>
            </select>
          </div>

          <Button onClick={() => simulate()} disabled={pending} className="h-10">
            {pending ? 'Calcul…' : 'Simuler'}
          </Button>
        </div>

        {result && !result.error ? (
          <p className="text-muted-foreground mt-4 text-sm">
            CA de référence après marge de sécurité ({Math.round(settings.safetyMargin * 100)} %)
            {session === 'afternoon' && settings.afternoonTargetRatio !== 1
              ? ` et coefficient d'après-midi (${settings.afternoonTargetRatio})`
              : ''}{' '}
            : <strong className="text-foreground">{formatEuro(result.caRef)}</strong>
          </p>
        ) : null}

        {result?.error ? (
          <p role="alert" className="text-destructive mt-4 text-sm font-medium">
            {result.error}
          </p>
        ) : null}
      </Card>

      {withoutRule.length > 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          {withoutRule.length} produit{withoutRule.length > 1 ? 's' : ''} sans règle de calculateur
          pour ce CA : {withoutRule.map((line) => line.productName).join(', ')}. Leur cible se
          réduit à leur plancher.
        </Card>
      ) : null}

      {result && !result.error ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-2xl border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th scope="col" className="px-4 py-3 text-left font-semibold">
                  Produit
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Cible
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Seuil
                </th>
                <th scope="col" className="px-3 py-3 text-center font-semibold">
                  Stock fictif
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Relance
                </th>
              </tr>
            </thead>

            <tbody>
              {result.lines.map((line) => (
                <tr key={line.productId} className="hover:bg-muted/30 border-b last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-medium">
                    {line.productName}
                    <span className="text-muted-foreground block text-xs font-normal">
                      {line.gnFormat ?? line.categoryName}
                    </span>
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatQty(line.target)}</td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {formatQty(line.reorderThreshold)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Input
                      value={stocks[line.productId] ?? ''}
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`Stock fictif de ${line.productName}`}
                      onChange={(event) =>
                        setStocks((current) => ({
                          ...current,
                          [line.productId]: event.target.value,
                        }))
                      }
                      onBlur={() => simulate()}
                      className="h-9 w-20 text-center tabular-nums"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    {line.stock === null ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : line.needsReorder ? (
                      <Badge className="tabular-nums">
                        relancer {formatQty(line.qtyToProduce)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">rien à faire</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
