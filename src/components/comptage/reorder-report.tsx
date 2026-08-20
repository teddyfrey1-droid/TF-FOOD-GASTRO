'use client';

import { useState, useTransition } from 'react';
import { Check, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
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
 * Le rendu d'une priorité.
 *
 * ⚠️ L'échelle se lit comme un classement : **1 est le plus urgent**.
 * Le rouge est donc en haut de liste, le gris en bas.
 */
const PRIORITY: Record<number, { label: string; dot: string }> = {
  1: { label: 'Priorité 1', dot: 'bg-red-500' },
  2: { label: 'Priorité 2', dot: 'bg-orange-500' },
  3: { label: 'Priorité 3', dot: 'bg-yellow-400' },
  4: { label: 'Priorité 4', dot: 'bg-blue-400' },
  5: { label: 'Priorité 5', dot: 'bg-neutral-300' },
};

function priorityOf(level: number) {
  return PRIORITY[level] ?? PRIORITY[5];
}

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

  const doneCount = tasks.filter((task) => done[task.taskId]).length;
  const remaining = tasks.length - doneCount;

  if (tasks.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="bg-primary/10 mx-auto flex size-20 items-center justify-center rounded-full">
          <Check className="text-primary size-10" strokeWidth={3} />
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight">Tout est au niveau.</h1>
        <p className="text-muted-foreground mt-2 font-medium">Rien à relancer.</p>
        <p className="text-muted-foreground mt-6 text-sm">
          {title} validé — {sufficientCount} produit{sufficientCount > 1 ? 's' : ''} au-dessus de
          leur minimum.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="print:block">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              À relancer{' '}
              <span className="text-muted-foreground font-black">({tasks.length})</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-semibold">
              {remaining === 0
                ? 'Tout est produit — beau travail.'
                : `${doneCount} sur ${tasks.length} ${doneCount > 1 ? 'faites' : 'faite'}`}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="shrink-0 rounded-full print:hidden"
          >
            <Printer className="size-4" />
            Imprimer
          </Button>
        </div>

        <Progress
          value={(doneCount / tasks.length) * 100}
          className="mt-4 h-2 print:hidden"
        />
      </header>

      {/* Une ligne = une pilule pleine largeur : la quantité à gauche, en très
          gros, parce que c'est la seule chose qu'on lit en cuisine. */}
      <ul className="space-y-2.5">
        {tasks.map((task) => {
          const isDone = done[task.taskId];
          const priority = priorityOf(task.priority);

          return (
            <li key={task.taskId}>
              <button
                type="button"
                aria-pressed={isDone}
                onClick={() => toggle(task.taskId, !isDone)}
                className={cn(
                  'no-select flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-colors',
                  isDone ? 'bg-primary/10' : 'bg-muted/60 active:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl leading-none',
                    isDone ? 'bg-primary text-primary-foreground' : 'bg-card border shadow-sm',
                  )}
                >
                  {isDone ? (
                    <Check className="size-7" strokeWidth={3} />
                  ) : (
                    <>
                      <span className="text-2xl font-black tabular-nums">
                        {task.qtyToProduce.toLocaleString('fr-FR')}
                      </span>
                      <span className="text-muted-foreground mt-0.5 text-[10px] font-bold">
                        {task.unit === 'piece' ? 'pcs' : 'GN'}
                      </span>
                    </>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-[17px] leading-tight font-black',
                      isDone && 'line-through opacity-60',
                    )}
                  >
                    {task.productName}
                  </span>
                  <span className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs font-semibold">
                    <span
                      aria-hidden
                      className={cn('size-2 shrink-0 rounded-full', priority.dot)}
                    />
                    {priority.label} ·{' '}
                    {task.qtyToProduce.toLocaleString('fr-FR')}{' '}
                    {unitLabel(task.unit, task.qtyToProduce)}
                  </span>
                  {task.notes ? (
                    <span className="text-muted-foreground mt-1 block text-xs italic">
                      {task.notes}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {sufficientCount > 0 ? (
        <div className="print:hidden">
          <button
            type="button"
            onClick={() => setShowSufficient((current) => !current)}
            className="text-muted-foreground hover:text-foreground w-full py-3 text-left text-sm font-semibold"
          >
            {showSufficient ? '▾' : '▸'} Stock suffisant ({sufficientCount} produit
            {sufficientCount > 1 ? 's' : ''})
          </button>

          {showSufficient ? (
            <p className="bg-muted/60 text-muted-foreground rounded-2xl p-4 text-sm">
              Ces produits sont au-dessus de leur minimum de relance : il n&apos;y a rien à
              produire.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
