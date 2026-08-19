'use client';

import { useMemo, useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatQty } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toggleProductActive, updateProductInline } from '@/app/admin/produits/actions';
import { ProductForm } from './product-form';
import type { ProductWithCategory } from '@/lib/admin/queries';
import type { Tables } from '@/lib/supabase/database.types';

/**
 * ⚠️ 1 est LE PLUS urgent : l'échelle se lit comme un classement.
 * Les couleurs suivent — rouge en haut, gris en bas.
 */
const PRIORITY_DOT: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-400',
  4: 'bg-blue-400',
  5: 'bg-neutral-300',
};

/** Résume le minimum en une phrase lisible, sans jargon. */
function describeMinimum(product: ProductWithCategory): string {
  if (product.min_mode === 'manual') {
    return product.min_qty_manual === null
      ? '—'
      : `sous ${formatQty(Number(product.min_qty_manual))}`;
  }
  const divisor = Number(product.min_divisor) || 2;
  return divisor === 2 ? 'sous la moitié de la cible' : `sous la cible / ${formatQty(divisor)}`;
}

export function ProductsManager({
  products,
  categories,
}: {
  products: ProductWithCategory[];
  categories: Tables<'product_categories'>[];
}) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<ProductWithCategory | null>(null);
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return products.filter((product) => {
      if (!showInactive && !product.is_active) return false;
      if (!needle) return true;
      return (
        product.name.toLowerCase().includes(needle) ||
        (product.category?.name ?? '').toLowerCase().includes(needle)
      );
    });
  }, [products, search, showInactive]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, ProductWithCategory[]>();
    for (const product of visible) {
      const key = product.category?.name ?? 'Sans catégorie';
      byCategory.set(key, [...(byCategory.get(key) ?? []), product]);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [visible]);

  if (creating || editing) {
    return (
      <ProductForm
        product={editing}
        categories={categories}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un produit…"
          className="h-10 max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Afficher les produits désactivés
        </label>
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          Nouveau produit
        </Button>
      </div>

      {grouped.length === 0 ? (
        <Card className="p-8 text-center text-sm">Aucun produit ne correspond à la recherche.</Card>
      ) : null}

      {grouped.map(([category, items]) => (
        <section key={category} className="space-y-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {category}
          </h2>

          <div className="divide-y overflow-hidden rounded-lg border">
            {items.map((product) => (
              <div
                key={product.id}
                className="hover:bg-muted/40 flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors"
              >
                <div className="min-w-48 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{product.name}</span>
                    {!product.is_active ? <Badge variant="outline">Désactivé</Badge> : null}
                    {Number(product.base_qty) <= 0 ? (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                        base à saisir
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {product.family === 'les_plus' ? 'Les plus' : 'Mise en place'} ·{' '}
                    {product.unit === 'piece' ? 'pièce' : 'gastro'}
                    {product.shelf_life_label ? ` · DLC ${product.shelf_life_label}` : ''}
                  </p>
                </div>

                <dl className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="sr-only">Minimum de relance</dt>
                    <dd>Relance {describeMinimum(product)}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Bornes de cible</dt>
                    <dd>
                      Cible {formatQty(product.floor_qty as number | null)} –{' '}
                      {formatQty(product.ceiling_qty as number | null)}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">Base « VENTE POUR »</dt>
                    <dd>Base {formatQty(Number(product.base_qty))}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Stockage</dt>
                    <dd>
                      {[product.in_saladbar ? 'saladbar' : null, product.in_fridge ? 'frigo' : null]
                        .filter(Boolean)
                        .join(' + ')}
                    </dd>
                  </div>
                </dl>

                <div className="flex items-center gap-2">
                  <InlinePriority product={product} />
                  <InlineMinimum product={product} />
                  <Button variant="outline" size="sm" onClick={() => setEditing(product)}>
                    Modifier
                  </Button>
                  <Switch
                    checked={product.is_active}
                    aria-label={product.is_active ? 'Désactiver' : 'Réactiver'}
                    onCheckedChange={(checked) => toggleProductActive(product.id, checked)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Priorité réglable en un clic depuis le tableau, sans ouvrir de fiche.
 * C'est l'un des deux réglages que le directeur touchera le plus souvent.
 */
function InlinePriority({ product }: { product: ProductWithCategory }) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-1.5" title="Priorité : 1 = le plus urgent">
      <span
        aria-hidden
        className={cn('size-2.5 rounded-full', PRIORITY_DOT[product.priority] ?? 'bg-neutral-300')}
      />
      <select
        value={product.priority}
        disabled={pending}
        aria-label={`Priorité de ${product.name}`}
        onChange={(event) => {
          const priority = Number(event.target.value);
          startTransition(async () => {
            await updateProductInline(product.id, { priority });
          });
        }}
        className="border-input bg-background h-8 rounded-md border px-1.5 text-xs tabular-nums"
      >
        {[1, 2, 3, 4, 5].map((level) => (
          <option key={level} value={level}>
            P{level}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Bascule auto / manuel et saisie du minimum, sans quitter le tableau. */
function InlineMinimum({ product }: { product: ProductWithCategory }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(
    product.min_qty_manual === null ? '' : String(product.min_qty_manual),
  );

  const isManual = product.min_mode === 'manual';

  return (
    <div className="flex items-center gap-1">
      <Button
        variant={isManual ? 'default' : 'outline'}
        size="sm"
        disabled={pending}
        title={isManual ? 'Repasser en minimum automatique' : 'Fixer un minimum manuel'}
        onClick={() =>
          startTransition(async () => {
            await updateProductInline(product.id, {
              minMode: isManual ? 'auto' : 'manual',
              minQtyManual: isManual ? null : Number(draft.replace(',', '.')) || 1,
            });
          })
        }
      >
        {isManual ? 'Min fixe' : 'Min auto'}
      </Button>

      {isManual ? (
        <Input
          value={draft}
          inputMode="decimal"
          aria-label={`Minimum fixe de ${product.name}`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            const parsed = Number(draft.replace(',', '.'));
            if (!Number.isFinite(parsed) || parsed < 0) return;
            if (parsed === Number(product.min_qty_manual)) return;
            startTransition(async () => {
              await updateProductInline(product.id, { minQtyManual: parsed });
            });
          }}
          className="h-8 w-16 text-center text-xs tabular-nums"
        />
      ) : null}
    </div>
  );
}
