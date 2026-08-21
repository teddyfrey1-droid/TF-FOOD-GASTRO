'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, ChevronDown, Printer } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { unitLabel, type ProductUnit } from '@/lib/mep';
import { formatQty } from '@/lib/format';
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
  /** Sous le seuil critique : arrive en tête, en rouge. */
  isCritical: boolean;
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

export interface ProduitSuffisant {
  productId: string;
  productName: string;
  imageUrl: string | null;
  qtyTotal: number;
  /** « surplus » ou « surplus_fort » : il y en a plus que nécessaire. */
  etat: string;
}

export function ReorderReport({
  title,
  tasks,
  suffisants,
}: {
  title: string;
  tasks: ReportTask[];
  suffisants: ProduitSuffisant[];
}) {
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(tasks.map((task) => [task.taskId, task.isDone])),
  );
  const [showSufficient, setShowSufficient] = useState(false);
  // Deux façons de lire la même liste : par urgence quand on décide quoi
  // faire, par poste quand on est devant le plan de travail et qu'on
  // enchaîne tout ce qui se prépare au même endroit.
  const [groupement, setGroupement] = useState<'urgence' | 'poste'>('urgence');
  const [, startTransition] = useTransition();

  function toggle(taskId: string, next: boolean) {
    setDone((current) => ({ ...current, [taskId]: next }));
    startTransition(async () => {
      await toggleProductionTask(taskId, next);
    });
  }

  const doneCount = tasks.filter((task) => done[task.taskId]).length;
  const remaining = tasks.length - doneCount;
  const criticalRemaining = tasks.filter(
    (task) => task.isCritical && !done[task.taskId],
  ).length;

  /**
   * La liste, groupée ou non.
   *
   * En mode « urgence » un seul groupe sans titre : l'ordre venu du
   * serveur (critique, puis priorité) fait déjà tout le travail, et le
   * casser en sections le masquerait.
   */
  const groupes = useMemo(() => {
    if (groupement === 'urgence') return [{ titre: null, items: tasks }] as const;

    const parPoste = new Map<string, ReportTask[]>();
    for (const task of tasks) {
      parPoste.set(task.categoryName, [...(parPoste.get(task.categoryName) ?? []), task]);
    }
    return [...parPoste.entries()].map(([titre, items]) => ({ titre, items }));
  }, [tasks, groupement]);

  if (tasks.length === 0) {
    return (
      <div className="py-10 text-center">
        <div className="bg-primary/10 mx-auto flex size-20 items-center justify-center rounded-full">
          <Check className="text-primary size-10" strokeWidth={3} />
        </div>
        <h1 className="mt-5 text-3xl font-black tracking-tight">Tout est au niveau.</h1>
        <p className="text-muted-foreground mt-2 font-medium">Rien à relancer.</p>
        <p className="text-muted-foreground mt-6 text-sm">
          {title} validé — {suffisants.length} produit{suffisants.length > 1 ? 's' : ''} au-dessus de
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

          <div className="mt-1 flex shrink-0 items-center gap-2 print:hidden">
            <Tabs
              value={groupement}
              onValueChange={(value) => setGroupement(value as 'urgence' | 'poste')}
            >
              <TabsList className="h-9">
                <TabsTrigger value="urgence" className="text-xs font-bold">
                  Urgence
                </TabsTrigger>
                <TabsTrigger value="poste" className="text-xs font-bold">
                  Poste
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="rounded-full"
            >
              <Printer className="size-4" />
              Imprimer
            </Button>
          </div>
        </div>

        <p className="text-muted-foreground mt-1.5 text-sm font-semibold">
          {remaining === 0
            ? 'Tout est produit — beau travail.'
            : `${doneCount} sur ${tasks.length} ${doneCount > 1 ? 'faites' : 'faite'}`}
        </p>

        {criticalRemaining > 0 ? (
          <p className="mt-2 rounded-2xl bg-red-500/10 px-3.5 py-2 text-sm font-black text-red-700">
            {criticalRemaining} produit{criticalRemaining > 1 ? 's' : ''} sous le seuil critique —
            à faire en premier.
          </p>
        ) : null}

        <Progress value={(doneCount / tasks.length) * 100} className="mt-3 h-2 print:hidden" />
      </header>

      {/* Une ligne = une pilule pleine largeur : la vignette du produit, puis
          la quantité en très gros. C'est la seule chose qu'on lit en cuisine,
          une gastro dans les mains. */}
      {groupes.map((groupe) => (
        <section key={groupe.titre ?? 'tout'} className={groupe.titre ? 'pt-2' : undefined}>
          {groupe.titre ? (
            <h2 className="mb-2.5 text-xl font-black tracking-tight">
              {groupe.titre}{' '}
              <span className="text-muted-foreground">({groupe.items.length})</span>
            </h2>
          ) : null}

          <ul className="space-y-2.5">
            {groupe.items.map((task) => {
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
                  isDone && 'bg-primary/10',
                  // Le critique se voit de loin : c'est ce qui manquera
                  // pendant le service, quelle que soit sa priorité.
                  !isDone && task.isCritical && 'bg-red-500/10 ring-2 ring-red-500/40',
                  !isDone && !task.isCritical && 'bg-muted/60 active:bg-muted',
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
                        task.isCritical ? 'bg-red-600 text-white' : priorite.pastille,
                      )}
                    >
                      {task.isCritical ? 'CRITIQUE' : priorite.label}
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
        </section>
      ))}

      {suffisants.length > 0 ? (
        <div className="print:hidden">
          <button
            type="button"
            onClick={() => setShowSufficient((current) => !current)}
            aria-expanded={showSufficient}
            className="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 py-3 text-left text-sm font-semibold"
          >
            <ChevronDown
              className={cn('size-4 transition-transform', showSufficient && 'rotate-180')}
              strokeWidth={2.6}
            />
            Stock suffisant ({suffisants.length} produit{suffisants.length > 1 ? 's' : ''})
          </button>

          {/* On montrait une phrase, pas les produits. Or c'est
              justement là qu'on vérifie « il en reste combien ? » sans
              redescendre au frigo. Photo, nom, quantité relevée. */}
          {showSufficient ? (
            <ul className="grid grid-cols-2 gap-2">
              {suffisants.map((produit) => (
                <li
                  key={produit.productId}
                  className={cn(
                    'bg-card flex items-center gap-2.5 rounded-2xl border p-2.5',
                    produit.etat === 'surplus_fort' && 'border-destructive/30 bg-destructive/[0.05]',
                    produit.etat === 'surplus' && 'border-alert-border bg-alert/40',
                  )}
                >
                  <VignetteProduit
                    name={produit.productName}
                    imageUrl={produit.imageUrl}
                    taille="sm"
                    className="shrink-0"
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] leading-tight font-bold">
                      {produit.productName}
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-[11px] font-black tabular-nums">
                      {formatQty(produit.qtyTotal)} en stock
                      {produit.etat === 'surplus_fort'
                        ? ' · beaucoup trop'
                        : produit.etat === 'surplus'
                          ? ' · surplus'
                          : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
