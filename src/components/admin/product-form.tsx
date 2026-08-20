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
  const [minMode, setMinMode] = useState(product?.min_mode ?? 'auto');
  const [family, setFamily] = useState(product?.family ?? 'mise_en_place');

  useEffect(() => {
    if (state.success) onClose();
  }, [state.success, onClose]);

  const errors = state.fieldErrors ?? {};

  return (
    <Card className="p-6">
      <form action={formAction} className="space-y-8">
        {product ? <input type="hidden" name="id" value={product.id} /> : null}
        <input type="hidden" name="min_mode" value={minMode} />
        <input type="hidden" name="family" value={family} />

        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              {product ? `Modifier « ${product.name} »` : 'Nouveau produit'}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              La valeur « VENTE POUR » et la famille pilotent la cible. Elles ne sont jamais
              visibles d&apos;un employé.
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

          <div className="space-y-2">
            <Label htmlFor="base_qty">Valeur « VENTE POUR »</Label>
            <Input
              id="base_qty"
              name="base_qty"
              inputMode="decimal"
              defaultValue={value(product?.base_qty)}
              placeholder="4,6"
            />
            <p className="text-muted-foreground text-xs">
              Reprise du Google Sheet. C&apos;est la seule donnée qui pilote la cible.
            </p>
            <FieldError message={errors.base_qty} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unit">Unité de comptage</Label>
            <select
              id="unit"
              name="unit"
              defaultValue={product?.unit ?? 'gastro'}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="gastro">Gastro</option>
              <option value="piece">Pièce</option>
            </select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Famille</Label>
            <div className="flex flex-wrap gap-2">
              {(['mise_en_place', 'les_plus'] as const).map((candidate) => (
                <Button
                  key={candidate}
                  type="button"
                  variant={family === candidate ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFamily(candidate)}
                >
                  {candidate === 'mise_en_place'
                    ? 'Mise en place — base pour 4 000 €, x2'
                    : 'Les plus — base pour 1 000 €, x1'}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Minimum de relance</h3>
          <p className="text-muted-foreground text-sm">
            C&apos;est le plancher qui <strong>déclenche</strong> la reproduction. À ne pas
            confondre avec le plancher de cible plus bas, qui borne le calcul.
          </p>

          <div className="flex gap-2">
            {(['auto', 'manual'] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={minMode === mode ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMinMode(mode)}
              >
                {mode === 'auto' ? 'Automatique (fraction de la cible)' : 'Valeur fixe'}
              </Button>
            ))}
          </div>

          {minMode === 'auto' ? (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="min_divisor">Diviseur (2 = la moitié de la cible)</Label>
              <Input
                id="min_divisor"
                name="min_divisor"
                inputMode="decimal"
                defaultValue={value(product?.min_divisor) || '2'}
              />
              <p className="text-muted-foreground text-xs">
                Le minimum suit la cible tout seul quand le chiffre d&apos;affaires bouge.
              </p>
              <FieldError message={errors.min_divisor} />
            </div>
          ) : (
            <div className="max-w-xs space-y-2">
              <Label htmlFor="min_qty_manual">Minimum fixe</Label>
              <Input
                id="min_qty_manual"
                name="min_qty_manual"
                inputMode="decimal"
                defaultValue={value(product?.min_qty_manual)}
                placeholder="8"
              />
              <FieldError message={errors.min_qty_manual} />
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
            <Label htmlFor="priority">Priorité (1 à 5)</Label>
            <Input
              id="priority"
              name="priority"
              type="number"
              min={1}
              max={5}
              defaultValue={product?.priority ?? 3}
            />
            <p className="text-muted-foreground text-xs">
              <strong>1 = le plus urgent</strong>, 5 = le moins. Pilote l&apos;ordre du rapport.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shelf_life_label">DLC</Label>
            <Input
              id="shelf_life_label"
              name="shelf_life_label"
              defaultValue={product?.shelf_life_label ?? ''}
              placeholder="J+2"
            />
            <p className="text-muted-foreground text-xs">
              Notée pour mémoire, aucun effet sur le calcul pour l&apos;instant.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="count_step">Pas de comptage</Label>
            <Input
              id="count_step"
              name="count_step"
              inputMode="decimal"
              defaultValue={value(product?.count_step) || '1'}
            />
            <FieldError message={errors.count_step} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="image_url">Photo (adresse web)</Label>
            <Input
              id="image_url"
              name="image_url"
              inputMode="url"
              placeholder="https://…"
              defaultValue={product?.image_url ?? ''}
            />
            <FieldError message={errors.image_url} />
            <p className="text-muted-foreground text-xs">
              Facultatif. Sans photo, l&apos;écran de comptage affiche une vignette illustrée
              déduite du nom du produit.
            </p>
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
