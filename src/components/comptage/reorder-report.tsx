'use client';

import { useState, useTransition } from 'react';
import { Check, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { unitLabel, type ProductUnit } from '@/lib/mep';
import { toggleProductionTask } from '@/app/comptage/actions';

export interface ReportTask {
  taskId: string;
  productName: string;
  notes: string | null;
  qtyToProduce: number;
  unit: ProductUnit;
  /** 1 = le plus urgent, 5 = le moins. */
  priority: number;
  isDone: boolean;
}

/**
 * Pastille de priorité.
 *
 * ⚠️ L'échelle se lit comme un classement : **1 est le plus urgent**.
 * Le rouge est donc en haut de liste, le gris en bas.
 */
const PRIORITY_DOT: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-400',
  4: 'bg-blue-400',
  5: 'bg-neutral-300',
};

export function ReorderReport({
  title,
  tasks,
  sufficientCount,
}: {
  title: string;
  tasks: ReportTask[];
  sufficientCount: number;
}) {
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tasks.map((task) => [task.taskId, task.isDone])),
  );
  const [showSufficient, setShowSufficient] = useState(false);
  const [, startTransition] = useTransition();

  function toggle(taskId: string, next: boolean) {
    setDone((current) => ({ ...current, [taskId]: next }));
    startTransition(async () => {
      await toggleProductionTask(taskId, next);
    });
  }

  const remaining = tasks.filter((task) => !done[task.taskId]);

  if (tasks.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="bg-primary/10 mx-auto flex size-16 items-center justify-center rounded-full">
          <Check className="text-primary size-8" />
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Tout est au niveau.</h1>
        <p className="text-muted-foreground mt-2">Rien à relancer.</p>
        <p className="text-muted-foreground mt-6 text-sm">
          {title} validé — {sufficientCount} produit{sufficientCount > 1 ? 's' : ''} au-dessus de
          leur minimum.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3 print:block">
        <div>
          <h1 className="text-2xl font-black tracking-tight">À relancer</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {remaining.length} sur {tasks.length} restant{remaining.length > 1 ? 's' : ''}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="shrink-0 print:hidden"
        >
          <Printer className="size-4" />
          Imprimer
        </Button>
      </header>

      <ul className="divide-y overflow-hidden rounded-2xl border">
        {tasks.map((task) => {
          const isDone = done[task.taskId];

          return (
            <li
              key={task.taskId}
              className={cn('flex items-start gap-3 p-4', isDone && 'bg-muted/40 opacity-60')}
            >
              <Checkbox
                checked={isDone}
                aria-label={`Marquer ${task.productName} comme fait`}
                onCheckedChange={(checked) => toggle(task.taskId, checked === true)}
                className="mt-1 size-6"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      'size-2.5 shrink-0 rounded-full',
                      PRIORITY_DOT[task.priority] ?? 'bg-neutral-300',
                    )}
                  />
                  <span className={cn('font-semibold', isDone && 'line-through')}>
                    {task.productName}
                  </span>
                </div>

                <p className="mt-1 text-xl font-black tabular-nums">
                  {task.qtyToProduce.toLocaleString('fr-FR')}{' '}
                  <span className="text-muted-foreground text-sm font-medium">
                    {unitLabel(task.unit, task.qtyToProduce)}
                  </span>
                </p>

                {task.notes ? (
                  <p className="text-muted-foreground mt-1 text-xs italic">{task.notes}</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {sufficientCount > 0 ? (
        <div className="print:hidden">
          <button
            type="button"
            onClick={() => setShowSufficient((current) => !current)}
            className="text-muted-foreground hover:text-foreground w-full py-3 text-left text-sm"
          >
            {showSufficient ? '▾' : '▸'} Stock suffisant ({sufficientCount} produit
            {sufficientCount > 1 ? 's' : ''})
          </button>

          {showSufficient ? (
            <Card className="text-muted-foreground p-4 text-sm">
              Ces produits sont au-dessus de leur minimum de relance : il n&apos;y a rien à
              produire.
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
