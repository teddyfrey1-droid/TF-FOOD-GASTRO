'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CloudOff, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { saveCountLine, saveCountLines, submitCount } from '@/app/comptage/actions';
import { clearSession, dequeue, enqueue, listPending, pendingKey } from '@/lib/offline/queue';
import { ProductRow, isLineDone, type CountState } from './product-row';
import { CategoryPills } from './category-pills';
import { ZoneTabs, ZONE_LABELS, type CountZone } from './zone-tabs';

export interface CountProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unit: 'gastro' | 'piece';
  countStep: number;
  inSaladbar: boolean;
  inFridge: boolean;
  notes: string | null;
}

const AUTOSAVE_DELAY_MS = 600;

export function CountingScreen({
  sessionId,
  title,
  products,
  initial,
  reportHref,
}: {
  sessionId: string;
  title: string;
  products: CountProduct[];
  initial: Record<string, CountState>;
  reportHref: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, CountState>>(initial);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [zone, setZone] = useState<CountZone>('saladbar');
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const refreshPending = useCallback(async () => {
    setPendingCount((await listPending(sessionId)).length);
  }, [sessionId]);

  /** Rejoue les saisies restées en attente. Appelé au retour du réseau. */
  const flushPending = useCallback(async () => {
    const pending = await listPending(sessionId);
    if (pending.length === 0) return;

    const result = await saveCountLines(
      pending.map((entry) => ({
        sessionId: entry.sessionId,
        productId: entry.productId,
        qtySaladbar: entry.qtySaladbar,
        qtyFridge: entry.qtyFridge,
        isNotApplicable: entry.isNotApplicable,
        notApplicableReason: entry.notApplicableReason,
        countedSaladbar: entry.countedSaladbar,
        countedFridge: entry.countedFridge,
      })),
    );

    await Promise.all(
      result.savedKeys.map((key) => {
        const entry = pending.find((candidate) => candidate.key === key);
        return entry ? dequeue(key, entry.updatedAt) : Promise.resolve();
      }),
    );

    await refreshPending();
  }, [sessionId, refreshPending]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshPending();
    void flushPending();

    const goOnline = () => {
      setOnline(true);
      void flushPending();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [flushPending, refreshPending]);

  // Les minuteries d'anti-rebond en cours doivent être annulées au démontage,
  // sinon un retour arrière déclencherait des envois fantômes.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  /**
   * Enregistre une saisie : d'abord localement (elle ne peut plus être perdue),
   * puis sur le serveur après un court anti-rebond.
   */
  const persist = useCallback(
    async (productId: string, next: CountState) => {
      const key = pendingKey(sessionId, productId);
      const updatedAt = Date.now();

      await enqueue({
        key,
        sessionId,
        productId,
        qtySaladbar: next.qtySaladbar,
        qtyFridge: next.qtyFridge,
        isNotApplicable: next.isNotApplicable,
        notApplicableReason: next.notApplicableReason,
        countedSaladbar: next.countedSaladbar,
        countedFridge: next.countedFridge,
        updatedAt,
      });
      await refreshPending();

      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);

      timers.current.set(
        key,
        setTimeout(async () => {
          timers.current.delete(key);
          const result = await saveCountLine({
            sessionId,
            productId,
            qtySaladbar: next.qtySaladbar,
            qtyFridge: next.qtyFridge,
            isNotApplicable: next.isNotApplicable,
            notApplicableReason: next.notApplicableReason,
            countedSaladbar: next.countedSaladbar,
            countedFridge: next.countedFridge,
          });

          if (result.error) {
            // Une panne réseau laisse la saisie en file, sans rien dire :
            // elle repartira toute seule. Un refus du serveur, lui, doit
            // remonter — l'employé compterait sinon dans le vide.
            if (navigator.onLine) setError(result.error);
            return;
          }

          await dequeue(key, updatedAt);
          await refreshPending();
        }, AUTOSAVE_DELAY_MS),
      );
    },
    [sessionId, refreshPending],
  );

  const update = useCallback(
    (productId: string, patch: Partial<CountState>, touchedZone?: CountZone) => {
      setState((current) => {
        const previous = current[productId];
        const next: CountState = {
          ...previous,
          ...patch,
          // Seule la zone que l'employé vient de toucher est marquée relevée.
          countedSaladbar:
            previous.countedSaladbar || touchedZone === 'saladbar' || patch.isNotApplicable === true,
          countedFridge:
            previous.countedFridge || touchedZone === 'fridge' || patch.isNotApplicable === true,
        };
        void persist(productId, next);
        return { ...current, [productId]: next };
      });
    },
    [persist],
  );

  const countedTotal = useMemo(
    () => products.filter((product) => isLineDone(state[product.id] ?? null, product)).length,
    [products, state],
  );
  const remaining = products.length - countedTotal;

  /** Vrai si la ligne a été relevée DANS la zone en cours. */
  const isCountedInZone = useCallback(
    (productId: string) => {
      const line = state[productId];
      if (!line) return false;
      if (line.isNotApplicable) return true;
      return zone === 'saladbar' ? line.countedSaladbar : line.countedFridge;
    },
    [state, zone],
  );

  const visible = useMemo(() => {
    const needle = search
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    return products.filter((product) => {
      // Un produit absent de la zone en cours n'a pas à s'y afficher.
      if (zone === 'saladbar' && !product.inSaladbar) return false;
      if (zone === 'fridge' && !product.inFridge) return false;
      if (activeCategory && product.categoryName !== activeCategory) return false;
      if (!needle) return true;
      return product.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .includes(needle);
    });
  }, [products, search, activeCategory, zone]);

  /**
   * Avancement de CHAQUE zone, séparément.
   *
   * Compter un produit au saladbar ne doit pas le marquer relevé au frigo :
   * l'employé pourrait valider sans être jamais descendu.
   */
  const zoneProgress = useMemo(() => {
    const build = (zoneKey: CountZone) => {
      const list = products.filter((product) =>
        zoneKey === 'saladbar' ? product.inSaladbar : product.inFridge,
      );
      const counted = list.filter((product) => {
        const line = state[product.id];
        if (!line) return false;
        if (line.isNotApplicable) return true;
        return zoneKey === 'saladbar' ? line.countedSaladbar : line.countedFridge;
      }).length;
      return { counted, total: list.length };
    };
    return { saladbar: build('saladbar'), fridge: build('fridge') };
  }, [products, state]);

  /** Avancement par catégorie DANS LA ZONE EN COURS, affiché dans les pills. */
  const categories = useMemo(() => {
    const inZone = products.filter((product) =>
      zone === 'saladbar' ? product.inSaladbar : product.inFridge,
    );
    const byName = new Map<string, { name: string; counted: number; total: number }>();
    for (const product of inZone) {
      const entry = byName.get(product.categoryName) ?? {
        name: product.categoryName,
        counted: 0,
        total: 0,
      };
      entry.total += 1;
      if (isCountedInZone(product.id)) entry.counted += 1;
      byName.set(product.categoryName, entry);
    }
    return [...byName.values()];
  }, [products, zone, isCountedInZone]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, CountProduct[]>();
    for (const product of visible) {
      byCategory.set(product.categoryName, [
        ...(byCategory.get(product.categoryName) ?? []),
        product,
      ]);
    }
    return [...byCategory.entries()];
  }, [visible]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    // Ne jamais valider sur des saisies encore en attente : le rapport serait faux.
    await flushPending();

    const result = await submitCount(sessionId);
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    await clearSession(sessionId);
    router.push(reportHref);
  }

  return (
    <div className="pb-40">
      <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-2xl font-black tracking-tight">{title}</h1>
            <span className="text-muted-foreground shrink-0 text-sm font-bold tabular-nums">
              {countedTotal} / {products.length}
            </span>
          </div>

          <div className="relative mt-3">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un produit…"
              autoCapitalize="none"
              autoCorrect="off"
              className="h-11 rounded-full pl-10 text-base"
            />
          </div>

          <div className="mt-3">
            <ZoneTabs zone={zone} onChange={setZone} progress={zoneProgress} />
          </div>

          <div className="mt-3">
            <CategoryPills
              categories={categories}
              active={activeCategory}
              onSelect={setActiveCategory}
            />
          </div>

          <Progress
            value={(countedTotal / Math.max(products.length, 1)) * 100}
            className="mt-3 h-1.5"
          />

          {!online || pendingCount > 0 ? (
            <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
              <CloudOff className="size-3.5" />
              {online
                ? `${pendingCount} saisie${pendingCount > 1 ? 's' : ''} en cours d’envoi`
                : `Hors ligne — ${pendingCount} saisie${pendingCount > 1 ? 's' : ''} en attente`}
            </p>
          ) : null}
        </div>
      </header>

      <div className="px-5">
        {grouped.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Aucun produit ne correspond à « {search} ».
          </p>
        ) : null}

        {grouped.map(([category, items]) => {
          // « Protéines (7) ✓ » plutôt qu'un intertitre gris : on sait d'un
          // coup d'œil combien de produits attendent dans le rayon.
          const countedHere = items.filter((product) => isCountedInZone(product.id)).length;
          const sectionDone = countedHere === items.length;

          return (
            <section key={category} className="pt-6">
              <h2 className="mb-2.5 flex items-center gap-2 text-xl font-black tracking-tight">
                {category}
                <span className="text-muted-foreground">({items.length})</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-black tabular-nums',
                    sectionDone ? 'bg-primary/15 text-primary' : 'bg-alert text-alert-foreground',
                  )}
                >
                  {sectionDone ? '✓' : `${countedHere}/${items.length}`}
                </span>
              </h2>

              <div className="space-y-2.5">
                {items.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    state={state[product.id]}
                    zone={zone}
                    onChange={(patch) => update(product.id, patch, zone)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur">
        <div className="pb-safe mx-auto w-full max-w-md space-y-2 px-5 pt-4">
          {error ? (
            <p role="alert" className="text-destructive text-sm font-medium">
              {error}
            </p>
          ) : null}

          {zone === 'saladbar' &&
          zoneProgress.saladbar.counted === zoneProgress.saladbar.total &&
          zoneProgress.fridge.counted < zoneProgress.fridge.total ? (
            // Le saladbar est fini : on envoie l'employé au frigo plutôt que
            // de le laisser chercher pourquoi le bouton reste gris.
            <Button
              onClick={() => setZone('fridge')}
              className="h-14 w-full rounded-2xl text-base font-bold"
            >
              Saladbar terminé — passer au {ZONE_LABELS.fridge.toLowerCase()}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={remaining > 0 || submitting}
              className="h-14 w-full rounded-2xl text-base font-bold"
            >
              {submitting ? (
                'Validation…'
              ) : remaining > 0 ? (
                `Encore ${remaining} produit${remaining > 1 ? 's' : ''} à compter`
              ) : (
                <>
                  <Check className={cn('size-5')} />
                  Valider le comptage
                </>
              )}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
