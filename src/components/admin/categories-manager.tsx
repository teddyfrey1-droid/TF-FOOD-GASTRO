'use client';

import { useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { pictogrammeCategorie } from '@/lib/produits/vignette';
import {
  createCategory,
  deleteCategory,
  moveCategory,
  moveCategoryProducts,
  renameCategory,
} from '@/app/admin/categories/actions';

export interface CategoryRow {
  id: string;
  name: string;
  productCount: number;
  saladbarCount: number;
  fridgeCount: number;
}

export function CategoriesManager({ categories }: { categories: CategoryRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p
          role="alert"
          className="bg-destructive/10 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold"
        >
          {error}
        </p>
      ) : null}

      <Card className="rounded-3xl p-5">
        <h2 className="font-black">Nouvelle catégorie</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Elle se range en dernier. L&apos;ordre ci-dessous est celui des rayons à l&apos;écran de
          comptage.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Sauces, Boissons…"
            className="h-12 rounded-2xl"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && newName.trim()) {
                run(() => createCategory(newName));
                setNewName('');
              }
            }}
          />
          <Button
            className="h-12 shrink-0 rounded-2xl px-5 font-bold"
            disabled={pending || newName.trim() === ''}
            onClick={() => {
              run(() => createCategory(newName));
              setNewName('');
            }}
          >
            Ajouter
          </Button>
        </div>
      </Card>

      <ul className="space-y-2.5">
        {categories.map((category, index) => (
          <CategoryCard
            key={category.id}
            category={category}
            others={categories.filter((other) => other.id !== category.id)}
            isFirst={index === 0}
            isLast={index === categories.length - 1}
            pending={pending}
            run={run}
          />
        ))}
      </ul>
    </div>
  );
}

function CategoryCard({
  category,
  others,
  isFirst,
  isLast,
  pending,
  run,
}: {
  category: CategoryRow;
  others: CategoryRow[];
  isFirst: boolean;
  isLast: boolean;
  pending: boolean;
  run: (action: () => Promise<{ error?: string }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  const [moving, setMoving] = useState(false);

  return (
    <li className="bg-card rounded-3xl border p-4">
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="bg-primary/10 flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
        >
          {pictogrammeCategorie(category.name)}
        </span>

        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="h-11 rounded-xl font-bold"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  run(() => renameCategory(category.id, draft));
                  setEditing(false);
                }
                if (event.key === 'Escape') {
                  setDraft(category.name);
                  setEditing(false);
                }
              }}
            />
            <Button
              size="sm"
              className="h-11 rounded-xl"
              disabled={pending || draft.trim() === ''}
              onClick={() => {
                run(() => renameCategory(category.id, draft));
                setEditing(false);
              }}
            >
              <Check className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-11 rounded-xl"
              onClick={() => {
                setDraft(category.name);
                setEditing(false);
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black">
                {category.name}{' '}
                <span className="text-muted-foreground">({category.productCount})</span>
              </p>
              <p className="text-muted-foreground text-xs font-semibold">
                {category.saladbarCount} au saladbar · {category.fridgeCount} au frigo du bas
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Monter ${category.name}`}
                disabled={pending || isFirst}
                onClick={() => run(() => moveCategory(category.id, -1))}
                className="size-10 rounded-xl p-0"
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Descendre ${category.name}`}
                disabled={pending || isLast}
                onClick={() => run(() => moveCategory(category.id, 1))}
                className="size-10 rounded-xl p-0"
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Renommer ${category.name}`}
                onClick={() => setEditing(true)}
                className="size-10 rounded-xl p-0"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Supprimer ${category.name}`}
                disabled={pending}
                onClick={() => run(() => deleteCategory(category.id))}
                className={cn(
                  'size-10 rounded-xl p-0',
                  category.productCount === 0 && 'text-destructive',
                )}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Vider une catégorie est le PRÉALABLE à sa suppression : autant
          proposer la manœuvre ici plutôt que de renvoyer un refus sec. */}
      {!editing && category.productCount > 0 ? (
        <div className="mt-3 border-t pt-3">
          {moving ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-sm font-semibold">
                Déplacer les {category.productCount} produits vers :
              </span>
              {others.map((other) => (
                <Button
                  key={other.id}
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={pending}
                  onClick={() => {
                    run(() => moveCategoryProducts(category.id, other.id));
                    setMoving(false);
                  }}
                >
                  {other.name}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setMoving(false)}>
                Annuler
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMoving(true)}
              disabled={others.length === 0}
              className="text-muted-foreground hover:text-foreground text-sm font-semibold disabled:opacity-40"
            >
              Déplacer ses produits ailleurs…
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}
