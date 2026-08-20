'use client';

import { useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Le stepper en pilule — composant signature de l'application.
 *
 * Contraintes du terrain : l'employé tient son téléphone d'une main, souvent
 * avec des doigts humides, et compte 39 produits d'affilée. Donc :
 *   • des cibles tactiles de 48 px minimum ;
 *   • le nombre en très gras, c'est l'élément le plus lu de l'app ;
 *   • le libellé de zone en gris dessous, discret ;
 *   • aucun clavier qui s'ouvre — appui long sur le nombre pour le pavé
 *     numérique de secours, réservé aux grosses quantités.
 */
export function BacStepper({
  label,
  hideLabel,
  value,
  step,
  disabled,
  onChange,
}: {
  label: string;
  /** Le libellé de zone est déjà porté par l'onglet : inutile de le répéter. */
  hideLabel?: boolean;
  value: number;
  step: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Recale sur le pas et efface la dérive flottante (0,1 + 0,2). */
  function snap(next: number): number {
    const steps = Math.round(next / step);
    return Math.max(0, Math.round(steps * step * 1e6) / 1e6);
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

  return (
    <div className="no-select flex flex-col items-center gap-1">
      <div
        className={cn(
          'bg-card flex items-center rounded-full border shadow-sm',
          disabled && 'opacity-40',
        )}
      >
        <button
          type="button"
          aria-label={`Retirer ${step} à ${label}`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(snap(value - step))}
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full',
            'active:bg-muted transition-colors disabled:opacity-25',
            'touch-manipulation',
          )}
        >
          <Minus className="size-5" strokeWidth={2.5} />
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
            className="ring-primary w-14 rounded-lg bg-transparent text-center text-2xl font-black tabular-nums ring-2 outline-none"
          />
        ) : (
          <button
            type="button"
            aria-label={`Quantité ${label} : ${value}. Appui long pour saisir au clavier.`}
            disabled={disabled}
            onPointerDown={() => {
              longPress.current = setTimeout(openKeypad, 500);
            }}
            onPointerUp={() => {
              if (longPress.current) clearTimeout(longPress.current);
            }}
            onPointerLeave={() => {
              if (longPress.current) clearTimeout(longPress.current);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              openKeypad();
            }}
            className="flex h-12 w-14 items-center justify-center text-2xl font-black tabular-nums touch-manipulation"
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
            'flex size-12 shrink-0 items-center justify-center rounded-full',
            'active:bg-muted transition-colors disabled:opacity-25',
            'touch-manipulation',
          )}
        >
          <Plus className="size-5" strokeWidth={2.5} />
        </button>
      </div>

      {hideLabel ? null : (
        <span className="text-muted-foreground text-[11px] font-medium tracking-wide">{label}</span>
      )}
    </div>
  );
}
