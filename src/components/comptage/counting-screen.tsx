'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, Check, CloudOff, LayoutGrid, List, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { saveCountLine, saveCountLines, submitCount } from '@/app/comptage/actions';
import { clearSession, dequeue, enqueue, listPending, pendingKey } from '@/lib/offline/queue';
import {
  ProductRow,
  isLineDone,
  EMPTY_LINE,
  type CountLayout,
  type CountState,
} from './product-row';
import { CategoryPills } from './category-pills';
import { ZoneTabs, ZONE_LABELS, type CountZone } from './zone-tabs';
import { LienRetour } from '@/components/lien-retour';

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
  imageUrl: string | null;
}

const AUTOSAVE_DELAY_MS = 600;

/** Ce que devient la file après une tentative d'envoi. */
interface FlushResult {
  /** Saisies encore en attente. Zéro = tout est arrivé au serveur. */
  restant: number;
  /** Le réseau a manqué : il n'y a rien à corriger, juste à attendre. */
  horsLigne?: boolean;
  /** Le serveur a refusé, et pourquoi. */
  erreur?: string;
}

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
  // Deux produits côte à côte par défaut : on parcourt le rayon deux fois
  // plus vite. La liste reste à un appui pour les noms longs.
  const [layout, setLayout] = useState<CountLayout>('grille');
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const refreshPending = useCallback(async () => {
    setPendingCount((await listPending(sessionId)).length);
  }, [sessionId]);

  /**
   * Rejoue les saisies restées en attente, et dit ce qu'il en reste.
   *
   * Le retour compte : la validation s'appuie dessus pour refuser de figer
   * un comptage dont des saisies ne sont pas encore arrivées. Un envoi qui
   * échoue laisse la saisie dans la file — jamais perdue, réessayée plus
   * tard — et remonte son motif pour qu'on puisse l'afficher.
   */
  const flushPending = useCallback(async (): Promise<FlushResult> => {
    const pending = await listPending(sessionId);
    if (pending.length === 0) return { restant: 0 };

    if (!navigator.onLine) return { restant: pending.length, horsLigne: true };

    setEnvoiEnCours(true);
    try {
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
          isDeferred: entry.isDeferred,
          deferredReason: entry.deferredReason,
        })),
      );

      await Promise.all(
        result.savedKeys.map((key) => {
          const entry = pending.find((candidate) => candidate.key === key);
          return entry ? dequeue(key, entry.updatedAt) : Promise.resolve();
        }),
      );

      const restant = pending.length - result.savedKeys.length;
      setPendingCount(restant);
      return { restant, erreur: result.error };
    } catch {
      // Coupure en plein envoi : rien n'est retiré de la file, tout sera
      // rejoué. On le dit plutôt que d'échouer en silence.
      await refreshPending();
      return { restant: pending.length, horsLigne: true };
    } finally {
      setEnvoiEnCours(false);
    }
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

  // Le réseau peut revenir sans que le navigateur émette « online » : un
  // wifi de sous-sol qui répond de nouveau, un serveur qui se remet. On
  // retente donc régulièrement tant qu'il reste quelque chose à envoyer,
  // sans jamais rien perdre entre deux essais.
  useEffect(() => {
    if (pendingCount === 0 || !online) return;

    const minuterie = setInterval(() => {
      void flushPending();
    }, 15_000);

    return () => clearInterval(minuterie);
  }, [pendingCount, online, flushPending]);

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
        isDeferred: next.isDeferred,
        deferredReason: next.deferredReason,
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
            isDeferred: next.isDeferred,
            deferredReason: next.deferredReason,
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

  /**
   * Miroir synchrone de l'état.
   *
   * `update` doit rester STABLE d'un rendu à l'autre, sinon les lignes
   * mémoïsées se redessineraient toutes. Il ne peut donc pas dépendre de
   * `state` : il lit cette référence, tenue à jour au moment même de
   * l'écriture. Et l'enregistrement sort du calcul d'état — un effet de
   * bord n'a rien à faire dans une fonction que React peut rejouer.
   */
  const stateRef = useRef(state);

  const update = useCallback(
    (productId: string, patch: Partial<CountState>, touchedZone?: CountZone) => {
      const previous = stateRef.current[productId] ?? EMPTY_LINE;
      const next: CountState = {
        ...previous,
        ...patch,
        // Seule la zone que l'employé vient de toucher est marquée relevée.
        // Un produit absent ou reporté, lui, vaut pour les DEUX zones : il
        // n'y a rien à relever nulle part.
        countedSaladbar:
          previous.countedSaladbar ||
          touchedZone === 'saladbar' ||
          patch.isNotApplicable === true ||
          patch.isDeferred === true,
        countedFridge:
          previous.countedFridge ||
          touchedZone === 'fridge' ||
          patch.isNotApplicable === true ||
          patch.isDeferred === true,
      };

      stateRef.current = { ...stateRef.current, [productId]: next };
      setState(stateRef.current);
      void persist(productId, next);
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
      if (line.isNotApplicable || line.isDeferred) return true;
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
        if (line.isNotApplicable || line.isDeferred) return true;
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

  /**
   * Emmène l'employé au premier produit qu'il reste à relever.
   *
   * Sans cela, un bouton grisé annonçait « encore 1 produit à compter »
   * sans dire lequel — et il fallait redescendre trente-sept lignes pour
   * le retrouver. Les filtres actifs sont levés au passage, sinon le
   * produit manquant peut être caché par une recherche ou une catégorie.
   */
  function goToNextMissing() {
    const zoneOf = (product: CountProduct): CountZone | null => {
      const line = state[product.id];
      if (line?.isNotApplicable || line?.isDeferred) return null;
      if (product.inSaladbar && !line?.countedSaladbar) return 'saladbar';
      if (product.inFridge && !line?.countedFridge) return 'fridge';
      return null;
    };

    // On cherche d'abord dans la zone où l'employé se trouve : le faire
    // descendre au frigo alors qu'il lui reste du saladbar serait un
    // aller-retour inutile à travers la cuisine.
    const dansLaZone = products.find((product) => zoneOf(product) === zone);
    const cible = dansLaZone ?? products.find((product) => zoneOf(product) !== null);
    if (!cible) return;

    const zoneCible = zoneOf(cible);
    if (zoneCible && zoneCible !== zone) setZone(zoneCible);
    setSearch('');
    setActiveCategory(null);

    // Le changement de zone doit être peint avant que le défilement vise
    // l'élément : sinon la carte n'est pas encore montée.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = document.getElementById(`produit-${cible.id}`);
        node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    // Ne jamais valider sur des saisies encore en attente : le rapport
    // serait calculé sur un stock incomplet. Jusqu'ici on tentait l'envoi
    // sans regarder s'il avait abouti — et on validait quand même.
    const file = await flushPending();
    if (file.restant > 0) {
      setError(
        file.horsLigne
          ? `${file.restant} saisie${file.restant > 1 ? 's ne sont' : ' n’est'} pas encore ` +
            'enregistrée' +
            (file.restant > 1 ? 's' : '') +
            ' : reconnectez-vous au réseau avant de valider. Rien n’est perdu.'
          : (file.erreur ??
            `${file.restant} saisie${file.restant > 1 ? 's' : ''} n’a pas pu être enregistrée. Réessayez dans un instant.`),
      );
      setSubmitting(false);
      return;
    }

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
        <div className="pt-safe-header px-5 pt-2 pb-3">
          {/* La saisie est enregistrée à chaque appui : quitter en cours de
              comptage ne perd rien, et le bouton doit le montrer. */}
          <LienRetour label="Quitter" className="mb-1" />

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

          <div className="mt-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <ZoneTabs zone={zone} onChange={setZone} progress={zoneProgress} />
            </div>
            <button
              type="button"
              onClick={() => setLayout(layout === 'grille' ? 'liste' : 'grille')}
              aria-label={
                layout === 'grille' ? 'Afficher en liste' : 'Afficher deux par ligne'
              }
              className="bg-muted text-muted-foreground active:bg-muted/70 no-select flex size-12 shrink-0 items-center justify-center rounded-2xl transition-colors"
            >
              {layout === 'grille' ? (
                <List className="size-5" strokeWidth={2.5} />
              ) : (
                <LayoutGrid className="size-5" strokeWidth={2.5} />
              )}
            </button>
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
        </div>
      </header>

      {/*
        L'état d'envoi FLOTTE au-dessus de la page.

        Tant qu'il vivait dans l'en-tête collant, son apparition rallongeait
        l'en-tête et poussait toute la liste vers le bas — en plein milieu
        d'une série d'appuis sur « + ». Le doigt visait encore l'ancienne
        position et tapait à côté : impossible de monter à 5 d'affilée.
        Hors du flux, il ne déplace plus rien.
      */}
      {!online || pendingCount > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-5 print:hidden"
        >
          <div
            className={cn(
              'flex items-center gap-2 rounded-full py-2 pr-2 pl-4 text-xs font-bold shadow-lg backdrop-blur',
              online
                ? 'bg-foreground/90 text-background'
                : 'bg-alert text-alert-foreground ring-alert-foreground/15 ring-1',
            )}
          >
            {envoiEnCours ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CloudOff className="size-3.5" />
            )}

            <span>
              {envoiEnCours
                ? `Envoi de ${pendingCount} saisie${pendingCount > 1 ? 's' : ''}…`
                : online
                  ? `${pendingCount} saisie${pendingCount > 1 ? 's' : ''} à renvoyer`
                  : `Hors ligne — ${pendingCount} saisie${pendingCount > 1 ? 's' : ''} gardée${pendingCount > 1 ? 's' : ''}`}
            </span>

            {/* Rien n'est perdu, mais l'attente inquiète : un bouton rend la
                main à l'employé plutôt que de le laisser deviner. */}
            {online && !envoiEnCours && pendingCount > 0 ? (
              <button
                type="button"
                onClick={() => void flushPending()}
                className="bg-background/20 hover:bg-background/30 rounded-full px-2.5 py-1 font-black transition-colors"
              >
                Réessayer
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

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

              <div
                className={
                  layout === 'grille' ? 'grid grid-cols-2 gap-2.5' : 'space-y-2.5'
                }
              >
                {items.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    state={state[product.id]}
                    zone={zone}
                    layout={layout}
                    onChange={update}
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
              onClick={remaining > 0 ? goToNextMissing : handleSubmit}
              disabled={submitting}
              variant={remaining > 0 ? 'outline' : 'default'}
              className="h-14 w-full rounded-2xl text-base font-bold"
            >
              {submitting ? (
                'Validation…'
              ) : remaining > 0 ? (
                <>
                  <ArrowDown className="size-5" strokeWidth={2.5} />
                  {`Aller au produit à compter (${remaining})`}
                </>
              ) : (
                <>
                  <Check className="size-5" strokeWidth={2.5} />
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
