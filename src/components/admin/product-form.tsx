'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { saveProduct, type ProductFormState } from '@/app/admin/produits/actions';
import type { ProductWithCategory } from '@/lib/admin/queries';
import type { Tables } from '@/lib/supabase/database.types';

/** Postgres renvoie ses numeric en chaîne : on les rend affichables tels quels. */
function value(raw: number | string | null | undefined): string {
  return raw === null || raw === undefined ? '' : String(raw);
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-destructive text-xs">{message}</p>;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Enregistrement…' : 'Enregistrer'}
    </Button>
  );
}

export function ProductForm({
  product,
  categories,
  onClose,
}: {
  product: ProductWithCategory | null;
  categories: Tables<'product_categories'>[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<ProductFormState, FormData>(saveProduct, {});
  const [reorderMode, setReorderMode] = useState(product?.reorder_mode ?? 'ratio');

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  const errors = state.fieldErrors ?? {};

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-8">
        {product ? <input type="hidden" name="id" value={product.id} /> : null}
        <input type="hidden" name="reorder_mode" value={reorderMode} />

        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {product ? `Modifier « ${product.name} »` : 'Nouveau produit'}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Le format GN s&apos;affiche à l&apos;écran de comptage. Le poids par gastro reste
              interne au back-office.
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
        </header>

        <section className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input id="name" name="name" defaultValue={product?.name ?? ''} required />
            <FieldError message={errors.name} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category_id">Catégorie</Label>
            <select
              id="category_id"
              name="category_id"
              defaultValue={product?.category_id ?? categories[0]?.id ?? ''}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              required
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <FieldError message={errors.category_id} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="gn_format">Format GN</Label>
            <Input
              id="gn_format"
              name="gn_format"
              defaultValue={product?.gn_format ?? ''}
              placeholder="GN 1/3 - 65mm"
            />
            <p className="text-muted-foreground text-xs">
              Affiché sous le nom du produit au comptage, pour lever toute ambiguïté.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Seuil de relance</h3>
          <p className="text-muted-foreground text-sm">
            C&apos;est le plancher qui <strong>déclenche</strong> la reproduction. À ne pas
            confondre avec le plancher de cible plus bas, qui borne le calcul.
          </p>

          <div className="flex gap-2">
            {(['ratio', 'fixed'] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={reorderMode === mode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setReorderMode(mode)}
              >
                {mode === 'ratio' ? 'Pourcentage de la cible' : 'Valeur fixe en gastros'}
              </Button>
            ))}
          </div>

          {reorderMode === 'ratio' ? (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="reorder_ratio">Fraction de la cible (0,5 = 50 %)</Label>
              <Input
                id="reorder_ratio"
                name="reorder_ratio"
                inputMode="decimal"
                defaultValue={value(product?.reorder_ratio) || '0.5'}
              />
              <FieldError message={errors.reorder_ratio} />
            </div>
          ) : (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="reorder_fixed">Seuil en gastros</Label>
              <Input
                id="reorder_fixed"
                name="reorder_fixed"
                inputMode="decimal"
                defaultValue={value(product?.reorder_fixed)}
                placeholder="4"
              />
              <FieldError message={errors.reorder_fixed} />
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Bornes de la cible</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="floor_qty">Plancher (gastros)</Label>
              <Input
                id="floor_qty"
                name="floor_qty"
                inputMode="decimal"
                defaultValue={value(product?.floor_qty)}
              />
              <p className="text-muted-foreground text-xs">
                On ne descend jamais sous cette cible, même un jour creux.
              </p>
              <FieldError message={errors.floor_qty} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ceiling_qty">Plafond (gastros)</Label>
              <Input
                id="ceiling_qty"
                name="ceiling_qty"
                inputMode="decimal"
                defaultValue={value(product?.ceiling_qty)}
              />
              <p className="text-muted-foreground text-xs">Capacité du frigo.</p>
              <FieldError message={errors.ceiling_qty} />
            </div>
          </div>
        </section>

        <section className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="urgency_level">Urgence (1 à 5)</Label>
            <Input
              id="urgency_level"
              name="urgency_level"
              type="number"
              min={1}
              max={5}
              defaultValue={product?.urgency_level ?? 3}
            />
            <p className="text-muted-foreground text-xs">Pilote l&apos;ordre du rapport.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prep_time_min">Prépa (min / gastro)</Label>
            <Input
              id="prep_time_min"
              name="prep_time_min"
              inputMode="decimal"
              defaultValue={value(product?.prep_time_min)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="weight_per_bac_kg">Poids par gastro (kg)</Label>
            <Input
              id="weight_per_bac_kg"
              name="weight_per_bac_kg"
              inputMode="decimal"
              defaultValue={value(product?.weight_per_bac_kg)}
            />
            <p className="text-muted-foreground text-xs">Indicatif, jamais affiché au comptage.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="count_step">Pas de comptage</Label>
            <Input
              id="count_step"
              name="count_step"
              inputMode="decimal"
              defaultValue={value(product?.count_step) || '0.5'}
            />
            <FieldError message={errors.count_step} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="production_step">Pas de production</Label>
            <Input
              id="production_step"
              name="production_step"
              inputMode="decimal"
              defaultValue={value(product?.production_step) || '0.5'}
            />
            <FieldError message={errors.production_step} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sort_order">Ordre d&apos;affichage</Label>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              defaultValue={product?.sort_order ?? 0}
            />
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Stockage et état</h3>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch name="in_saladbar" defaultChecked={product?.in_saladbar ?? true} />
              Présent au saladbar
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch name="in_fridge" defaultChecked={product?.in_fridge ?? true} />
              Présent au frigo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch name="is_active" defaultChecked={product?.is_active ?? true} />
              Actif
            </label>
          </div>
          <FieldError message={errors.in_saladbar} />
        </section>

        <div className="space-y-2">
          <Label htmlFor="notes">Note</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={product?.notes ?? ''}
            placeholder="Décongeler la veille…"
          />
          <p className="text-muted-foreground text-xs">
            Reprise telle quelle dans le rapport de relance.
          </p>
        </div>

        {state.error ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            {state.error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <SaveButton />
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}
