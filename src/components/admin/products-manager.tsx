'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { formatQty } from '@/lib/format';
import { toggleProductActive } from '@/app/admin/produits/actions';
import { ProductForm } from './product-form';
import type { ProductWithCategory } from '@/lib/admin/queries';
import type { Tables } from '@/lib/supabase/database.types';

const URGENCY_LABEL: Record<number, string> = {
  1: 'Faible',
  2: 'Modérée',
  3: 'Normale',
  4: 'Haute',
  5: 'Critique',
};

/** Résume le seuil en une phrase lisible, sans jargon. */
function describeThreshold(product: ProductWithCategory): string {
  if (product.reorder_mode === 'fixed') {
    return product.reorder_fixed === null
      ? '—'
      : `sous ${formatQty(Number(product.reorder_fixed))} gastro(s)`;
  }
  return product.reorder_ratio === null
    ? '—'
    : `sous ${Math.round(Number(product.reorder_ratio) * 100)} % de la cible`;
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
                    {product.gn_format?.includes('à confirmer') ? (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-600">
                        à confirmer
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {product.gn_format ?? 'Format GN non renseigné'}
                  </p>
                </div>

                <dl className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="sr-only">Seuil de relance</dt>
                    <dd>Relance {describeThreshold(product)}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Bornes de cible</dt>
                    <dd>
                      Cible {formatQty(product.floor_qty as number | null)} –{' '}
                      {formatQty(product.ceiling_qty as number | null)}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">Urgence</dt>
                    <dd>Urgence : {URGENCY_LABEL[product.urgency_level] ?? product.urgency_level}</dd>
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
