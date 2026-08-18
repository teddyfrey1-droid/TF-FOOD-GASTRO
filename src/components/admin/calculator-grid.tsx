'use client';

import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { saveBracketCell } from '@/app/admin/calculateur/actions';
import { isMultipleOfStep } from '@/lib/mep';
import type { BracketColumn } from '@/app/admin/calculateur/page';

export interface CalculatorProduct {
  id: string;
  name: string;
  categoryName: string;
  gnFormat: string | null;
}

function cellKey(productId: string, column: BracketColumn): string {
  return `${productId}::${column.caMin ?? '-'}|${column.caMax ?? '-'}`;
}

/** Accepte « 2,5 » comme « 2.5 ». Une chaîne vide efface la cellule. */
function parseCell(raw: string): number | null | 'invalid' {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) return 'invalid';
  return parsed;
}

/**
 * Le tableau croisé du Google Sheet, en éditable : produits en lignes,
 * tranches de CA en colonnes. Chaque cellule s'enregistre en quittant le champ.
 */
export function CalculatorGrid({
  products,
  columns,
  cells,
  ratios,
}: {
  products: CalculatorProduct[];
  columns: BracketColumn[];
  cells: Record<string, number | null>;
  ratios: Record<string, number | null>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      products.flatMap((product) =>
        columns.map((column) => {
          const key = cellKey(product.id, column);
          const value = cells[key];
          return [key, value === null || value === undefined ? '' : String(value)];
        }),
      ),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, startSaving] = useTransition();

  function commit(product: CalculatorProduct, column: BracketColumn, raw: string) {
    const key = cellKey(product.id, column);
    const original = cells[key];
    const originalText = original === null || original === undefined ? '' : String(original);
    if (raw.trim() === originalText.trim()) return;

    const parsed = parseCell(raw);
    if (parsed === 'invalid') {
      setErrors((current) => ({ ...current, [key]: 'Nombre invalide' }));
      return;
    }

    if (parsed !== null && !isMultipleOfStep(parsed, 0.5)) {
      setErrors((current) => ({ ...current, [key]: 'Multiples de 0,5 uniquement' }));
      return;
    }

    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });

    startSaving(async () => {
      const result = await saveBracketCell({
        productId: product.id,
        caMin: column.caMin,
        caMax: column.caMax,
        targetQty: parsed,
      });
      if (result.error) {
        setErrors((current) => ({ ...current, [key]: result.error! }));
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        Cibles en gastros, par multiples de 0,5. La modification est enregistrée en quittant la
        cellule.{' '}
        {saving ? <span className="text-foreground font-medium">Enregistrement…</span> : null}
      </p>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-3xl border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th
                scope="col"
                className="bg-muted/50 sticky left-0 z-10 px-4 py-3 text-left font-semibold"
              >
                Produit
              </th>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  className="px-3 py-3 text-center font-semibold whitespace-nowrap"
                >
                  {column.label}
                </th>
              ))}
              <th scope="col" className="px-3 py-3 text-center font-semibold whitespace-nowrap">
                Ratio / 1 000 €
              </th>
            </tr>
          </thead>

          <tbody>
            {products.map((product) => {
              const ratio = ratios[product.id];
              return (
                <tr key={product.id} className="hover:bg-muted/30 border-b last:border-0">
                  <th
                    scope="row"
                    className="bg-background sticky left-0 z-10 px-4 py-2 text-left font-medium"
                  >
                    {product.name}
                    <span className="text-muted-foreground block text-xs font-normal">
                      {product.categoryName}
                    </span>
                  </th>

                  {columns.map((column) => {
                    const key = cellKey(product.id, column);
                    return (
                      <td key={key} className="px-2 py-1.5 text-center">
                        <Input
                          value={values[key] ?? ''}
                          inputMode="decimal"
                          aria-label={`${product.name}, ${column.label}`}
                          aria-invalid={Boolean(errors[key])}
                          disabled={ratio !== null && ratio !== undefined}
                          onChange={(event) =>
                            setValues((current) => ({ ...current, [key]: event.target.value }))
                          }
                          onBlur={(event) => commit(product, column, event.target.value)}
                          className="h-9 w-20 text-center tabular-nums"
                        />
                        {errors[key] ? (
                          <span className="text-destructive mt-0.5 block text-[11px]">
                            {errors[key]}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}

                  <td className="text-muted-foreground px-3 py-2 text-center text-xs tabular-nums">
                    {ratio === null || ratio === undefined ? '—' : ratio}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p className="text-muted-foreground text-xs">
        Un produit réglé au ratio ignore les paliers : sa ligne est verrouillée et le ratio fait
        foi.
      </p>
    </div>
  );
}
