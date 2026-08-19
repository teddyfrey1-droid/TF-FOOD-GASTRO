'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatEuro, formatQty } from '@/lib/format';
import { runSimulation, type SimulationResult } from '@/app/admin/simulateur/simulate';

export interface FamilyInfo {
  family: string;
  label: string;
  referenceRevenue: number;
  targetMultiplier: number;
}

function parseNumber(raw: string): number {
  return Number(raw.trim().replace(',', '.'));
}

export function TargetSimulator({ families }: { families: FamilyInfo[] }) {
  const [revenue, setRevenue] = useState('4000');
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
      setResult(await runSimulation({ caRef: parseNumber(revenue), stocks: parsedStocks }));
    });
  }

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="simulated-revenue">Chiffre d&apos;affaires</Label>
            <div className="flex items-center gap-2">
              <Input
                id="simulated-revenue"
                value={revenue}
                inputMode="decimal"
                onChange={(event) => setRevenue(event.target.value)}
                className="h-11 w-32 text-lg font-bold tabular-nums"
              />
              <span className="text-muted-foreground text-sm">€ HT</span>
            </div>
          </div>

          <Button onClick={() => simulate()} disabled={pending} className="h-11">
            {pending ? 'Calcul…' : 'Simuler'}
          </Button>
        </div>

        <dl className="text-muted-foreground mt-5 grid gap-2 text-xs sm:grid-cols-2">
          {families.map((family) => (
            <div key={family.family}>
              <dt className="font-medium">{family.label}</dt>
              <dd>
                base exprimée pour {formatEuro(family.referenceRevenue)}, multipliée par{' '}
                {formatQty(family.targetMultiplier)}
              </dd>
            </div>
          ))}
        </dl>

        {result?.error ? (
          <p role="alert" className="text-destructive mt-4 text-sm font-medium">
            {result.error}
          </p>
        ) : null}
      </Card>

      {result && !result.error ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-3xl border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th scope="col" className="px-4 py-3 text-left font-semibold">Produit</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Base</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Cible</th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">Minimum</th>
                <th scope="col" className="px-3 py-3 text-center font-semibold">Stock fictif</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Relance</th>
              </tr>
            </thead>

            <tbody>
              {result.lines.map((line) => (
                <tr key={line.productId} className="hover:bg-muted/30 border-b last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-medium">
                    {line.productName}
                    <span className="text-muted-foreground block text-xs font-normal">
                      {line.categoryName} · {line.unit === 'piece' ? 'pièce' : 'gastro'} · P
                      {line.priority}
                    </span>
                  </th>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {formatQty(line.baseQty)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">
                    {formatQty(line.target)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {formatQty(line.minimum)}
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
