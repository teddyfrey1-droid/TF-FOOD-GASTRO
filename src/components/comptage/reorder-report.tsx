'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Printer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { formatBacs, formatDuration } from '@/lib/format';
import { toggleProductionTask } from '@/app/comptage/actions';

export interface ReportTask {
  taskId: string;
  productName: string;
  gnFormat: string | null;
  notes: string | null;
  qtyToProduce: number;
  urgencyLevel: number;
  isDone: boolean;
}

/** Pastille de couleur d'urgence. Le rouge est réservé au vraiment critique. */
const URGENCY_DOT: Record<number, string> = {
  1: 'bg-slate-300',
  2: 'bg-sky-400',
  3: 'bg-amber-400',
  4: 'bg-orange-500',
  5: 'bg-red-500',
};

export function ReorderReport({
  title,
  tasks,
  sufficientCount,
  totalPrepMinutes,
}: {
  title: string;
  tasks: ReportTask[];
  sufficientCount: number;
  totalPrepMinutes: number | null;
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
        <h1 className="mt-5 text-2xl font-bold tracking-tight">Tout est au niveau.</h1>
        <p className="text-muted-foreground mt-2">Rien à relancer.</p>
        <p className="text-muted-foreground mt-6 text-sm">
          {title} validé — {sufficientCount} produit{sufficientCount > 1 ? 's' : ''} au-dessus de
          leur seuil.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3 print:block">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">À relancer</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {remaining.length} sur {tasks.length} restant
            {remaining.length > 1 ? 's' : ''}
            {totalPrepMinutes !== null && totalPrepMinutes > 0
              ? ` · environ ${formatDuration(totalPrepMinutes)} de prépa`
              : ''}
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

      <ul className="divide-y overflow-hidden rounded-lg border">
        {tasks.map((task) => {
          const isDone = done[task.taskId];
          const critical = task.urgencyLevel >= 4 || task.qtyToProduce === 0;

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
                      URGENCY_DOT[task.urgencyLevel] ?? 'bg-slate-300',
                    )}
                  />
                  <span className={cn('font-medium', isDone && 'line-through')}>
                    {task.productName}
                  </span>
                </div>

                <p className="mt-1 text-lg font-bold tabular-nums">
                  {formatBacs(task.qtyToProduce)}
                </p>

                {task.gnFormat ? (
                  <p className="text-muted-foreground text-xs">{task.gnFormat}</p>
                ) : null}
                {task.notes ? (
                  <p className="text-muted-foreground mt-1 text-xs italic">{task.notes}</p>
                ) : null}

                {critical && task.urgencyLevel >= 4 ? (
                  <Badge variant="destructive" className="mt-2 gap-1">
                    <AlertTriangle className="size-3" />
                    Rupture imminente
                  </Badge>
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
              Ces produits sont au-dessus de leur seuil de relance : il n&apos;y a rien à produire.
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
