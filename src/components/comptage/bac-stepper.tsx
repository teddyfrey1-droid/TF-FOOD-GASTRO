'use client';

import { useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { roundToNearestStep } from '@/lib/mep/rounding';

/**
 * Compteur de gastros.
 *
 * Contraintes du terrain : l'employé tient son téléphone d'une main, souvent
 * avec des gants humides. Les cibles tactiles font 48 px minimum, le clavier
 * ne s'ouvre jamais tout seul, et un appui long sur la valeur donne accès au
 * pavé numérique pour les grosses quantités.
 */
export function BacStepper({
  label,
  value,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Recale sur le pas, sans dérive flottante. On réutilise l'arrondi du moteur
   * métier plutôt que d'en écrire un second : c'est la même règle des demi-gastros.
   */
  function snap(next: number): number {
    return Math.max(0, roundToNearestStep(next, step));
  }

  function openKeypad() {
    if (disabled) return;
    setDraft(String(value));
    setEditing(true);
  }

  function commitDraft() {
    const parsed = Number(draft.trim().replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) onChange(snap(parsed));
    setEditing(false);
  }

  function startLongPress() {
    longPress.current = setTimeout(openKeypad, 500);
  }

  function cancelLongPress() {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Retirer ${step} à ${label}`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(snap(value - step))}
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-l-lg border',
            'active:bg-muted disabled:opacity-30 disabled:pointer-events-none',
            'touch-manipulation select-none',
          )}
        >
          <Minus className="size-5" />
        </button>

        {editing ? (
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={draft}
            aria-label={`Quantité ${label}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitDraft();
              if (event.key === 'Escape') setEditing(false);
            }}
            className="border-primary h-12 w-14 rounded-none border-y border-x-0 text-center text-lg font-semibold tabular-nums outline-none"
          />
        ) : (
          <button
            type="button"
            aria-label={`Quantité ${label} : ${value}. Appui long pour saisir au clavier.`}
            disabled={disabled}
            onPointerDown={startLongPress}
            onPointerUp={cancelLongPress}
            onPointerLeave={cancelLongPress}
            onContextMenu={(event) => {
              event.preventDefault();
              openKeypad();
            }}
            className={cn(
              'flex h-12 w-14 items-center justify-center border-y text-lg font-semibold tabular-nums',
              'touch-manipulation select-none disabled:opacity-40',
            )}
          >
            {value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
          </button>
        )}

        <button
          type="button"
          aria-label={`Ajouter ${step} à ${label}`}
          disabled={disabled}
          onClick={() => onChange(snap(value + step))}
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-r-lg border',
            'active:bg-muted disabled:opacity-30 disabled:pointer-events-none',
            'touch-manipulation select-none',
          )}
        >
          <Plus className="size-5" />
        </button>
      </div>
    </div>
  );
}
