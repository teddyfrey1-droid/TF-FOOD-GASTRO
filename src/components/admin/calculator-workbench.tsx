'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalculatorGrid, type CalculatorProduct } from './calculator-grid';
import { TargetSimulator } from './target-simulator';
import type { BracketColumn } from '@/app/admin/calculateur/page';
import type { RevenueSettings } from '@/lib/mep';

export function CalculatorWorkbench({
  products,
  columns,
  cells,
  ratios,
  settings,
}: {
  products: CalculatorProduct[];
  columns: BracketColumn[];
  cells: Record<string, number | null>;
  ratios: Record<string, number | null>;
  settings: RevenueSettings;
}) {
  const [tab, setTab] = useState('tableau');

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="tableau">Tableau croisé</TabsTrigger>
        <TabsTrigger value="simulateur">Simulateur</TabsTrigger>
      </TabsList>

      <TabsContent value="tableau" className="mt-5">
        {columns.length === 0 ? (
          <Card className="p-8 text-center text-sm">
            Aucun palier de CA n&apos;est défini. Importez le calculateur avec{' '}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              pnpm import:calculateur
            </code>
            , ou chargez le jeu de démonstration.
          </Card>
        ) : (
          <CalculatorGrid
            products={products}
            columns={columns}
            cells={cells}
            ratios={ratios}
          />
        )}
      </TabsContent>

      <TabsContent value="simulateur" className="mt-5">
        <TargetSimulator settings={settings} />
      </TabsContent>
    </Tabs>
  );
}
