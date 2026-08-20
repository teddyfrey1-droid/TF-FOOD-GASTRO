'use client';

import { useState, useTransition } from 'react';
import { Check, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { unitLabel, type ProductUnit } from '@/lib/mep';
import { VignetteProduit } from '@/components/produits/vignette-produit';
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
  imageUrl: string | null;
  categoryName: string;
}

/**
 * Le rendu d'une priorité.
 *
 * ⚠️ L'échelle se lit comme un classement : **1 est le plus urgent**.
 * Le rouge est donc en haut de liste, le gris en bas.
 */
const PRIORITE: Record<number, { label: string; pastille: string }> = {
  1: { label: 'Urgent', pastille: 'bg-red-500 text-white' },
  2: { label: 'Prioritaire', pastille: 'bg-orange-500 text-white' },
  3: { label: 'Normal', pastille: 'bg-alert text-alert-foreground' },
  4: { label: 'Si possible', pastille: 'bg-blue-400 text-white' },
  5: { label: 'En dernier', pastille: 'bg-neutral-300 text-neutral-800' },
};

function prioriteDe(niveau: number) {
  return PRIORITE[niveau] ?? PRIORITE[5];
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
          <h1 className="text-3xl font-black tracking-tight">
            À produire{' '}
            <span className="bg-primary text-primary-foreground ml-1 inline-flex size-9 items-center justify-center rounded-full align-middle text-lg tabular-nums">
              {remaining}
            </span>
          </h1>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="mt-1 shrink-0 rounded-full print:hidden"
          >
            <Printer className="size-4" />
            Imprimer
          </Button>
        </div>

        <p className="text-muted-foreground mt-1.5 text-sm font-semibold">
          {remaining === 0
            ? 'Tout est produit — beau travail.'
            : `${doneCount} sur ${tasks.length} ${doneCount > 1 ? 'faites' : 'faite'}`}
        </p>

        <Progress value={(doneCount / tasks.length) * 100} className="mt-3 h-2 print:hidden" />
      </header>

      {/* Une ligne = une pilule pleine largeur : la vignette du produit, puis
          la quantité en très gros. C'est la seule chose qu'on lit en cuisine,
          une gastro dans les mains. */}
      <ul className="space-y-2.5">
        {tasks.map((task) => {
          const isDone = done[task.taskId];
          const priorite = prioriteDe(task.priority);

          return (
            <li key={task.taskId}>
              <button
                type="button"
                aria-pressed={isDone}
                onClick={() => toggle(task.taskId, !isDone)}
                className={cn(
                  'no-select flex w-full items-center gap-3.5 rounded-3xl p-3 text-left transition-colors',
                  isDone ? 'bg-primary/10' : 'bg-muted/60 active:bg-muted',
                )}
              >
                <span className="relative shrink-0">
                  <VignetteProduit
                    name={task.productName}
                    categoryName={task.categoryName}
                    imageUrl={task.imageUrl}
                    className={cn('size-16 rounded-2xl text-3xl', isDone && 'opacity-40')}
                  />
                  {isDone ? (
                    <span className="bg-primary text-primary-foreground absolute -right-1 -bottom-1 flex size-7 items-center justify-center rounded-full">
                      <Check className="size-4" strokeWidth={3.5} />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'absolute -top-1.5 -left-1.5 rounded-full px-2 py-0.5 text-[10px] font-black',
                        priorite.pastille,
                      )}
                    >
                      {priorite.label}
                    </span>
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
                  <span className="mt-1 block">
                    <span className="text-3xl leading-none font-black tabular-nums">
                      {task.qtyToProduce.toLocaleString('fr-FR')}
                    </span>{' '}
                    <span className="text-muted-foreground text-sm font-bold">
                      {unitLabel(task.unit, task.qtyToProduce)}
                    </span>
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
