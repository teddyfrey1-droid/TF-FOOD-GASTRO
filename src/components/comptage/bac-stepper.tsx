'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Le compteur pleine largeur — composant signature de l'application.
 *
 * Contraintes du terrain : l'employé tient son téléphone d'une main, souvent
 * avec des doigts humides, et compte trente-sept produits d'affilée. Donc :
 *
 *   • des cibles tactiles de 56 px, pleine largeur, qu'on atteint sans viser
 *     — c'est ce qui permet d'enchaîner cinq appuis sans rater ;
 *   • le nombre au centre, en très gras : l'élément le plus lu de l'app ;
 *   • un bouton « Zéro » EXPLICITE. Sans lui, déclarer un bac vide obligeait
 *     à faire « + » puis « − » pour que la ligne compte comme relevée ;
 *   • aucun clavier qui s'ouvre — appui long sur le nombre pour le pavé
 *     numérique de secours, réservé aux grosses quantités.
 */
export function BacStepper({
  label,
  value,
  step,
  /** Vrai quand la zone a été relevée, même à zéro. */
  counted,
  compact,
  disabled,
  onChange,
  onZero,
}: {
  label: string;
  value: number;
  step: number;
  counted: boolean;
  /** Deux produits côte à côte : le « 0 » passe sous le compteur. */
  compact?: boolean;
  disabled?: boolean;
  onChange: (next: number) => void;
  /** Déclarer la zone vide : met à zéro ET marque la ligne relevée. */
  onZero: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

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

  /**
   * Une valeur TAPÉE est prise telle quelle.
   *
   * `snap` recale sur le pas de comptage : avec un pas de 1, taper 4,5
   * donnait 5. Or c'est précisément pour saisir un demi-bac qu'on ouvre
   * le clavier. Le recalage reste sur « + » et « − », où il empêche la
   * dérive des flottants.
   */
  function commitDraft() {
    const parsed = Number(draft.trim().replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) {
      onChange(Math.max(0, Math.round(parsed * 1000) / 1000));
    }
    setEditing(false);
  }

  const zeroConfirmed = counted && value === 0;

  /* « Zéro » : un bac vide se déclare, il ne se devine pas. */
  const boutonZero = (
    <button
      type="button"
      aria-label={`${label} : déclarer zéro`}
      aria-pressed={zeroConfirmed}
      disabled={disabled}
      onClick={onZero}
      className={cn(
        'flex touch-manipulation items-center justify-center',
        'rounded-2xl font-black transition-colors',
        compact ? 'h-11 w-full text-lg' : 'h-14 w-[4.5rem] shrink-0 text-xl',
        zeroConfirmed
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground active:bg-muted/70',
        disabled && 'opacity-40',
      )}
    >
      0
    </button>
  );

  return (
    <div className={cn('no-select', compact ? 'space-y-2' : 'flex items-stretch gap-2')}>
      {compact ? null : boutonZero}

      <div
        className={cn(
          'bg-card flex items-center rounded-2xl border shadow-sm',
          compact ? 'h-13 w-full' : 'h-14 flex-1',
          disabled && 'opacity-40',
          counted && value > 0 && 'border-primary/50',
        )}
      >
        <button
          type="button"
          aria-label={`Retirer ${step} à ${label}`}
          disabled={disabled || value <= 0}
          onClick={() => onChange(snap(value - step))}
          className={cn(
            'flex h-full shrink-0 items-center justify-center rounded-l-2xl',
            compact ? 'w-11' : 'w-16',
            'active:bg-muted touch-manipulation transition-colors disabled:opacity-25',
          )}
        >
          <Minus className={compact ? 'size-5' : 'size-6'} strokeWidth={3} />
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
            className="ring-primary min-w-0 flex-1 rounded-lg bg-transparent text-center text-3xl font-black tabular-nums ring-2 outline-none"
          />
        ) : (
          <button
            type="button"
            aria-label={`Quantité ${label} : ${value}. Toucher pour saisir au clavier.`}
            disabled={disabled}
            onClick={openKeypad}
            className={cn(
              'h-full min-w-0 flex-1 touch-manipulation font-black tabular-nums',
              compact ? 'text-2xl' : 'text-3xl',
              !counted && value === 0 && 'text-muted-foreground/30',
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
            'flex h-full shrink-0 items-center justify-center rounded-r-2xl',
            compact ? 'w-11' : 'w-16',
            'active:bg-muted touch-manipulation transition-colors disabled:opacity-25',
          )}
        >
          <Plus className={compact ? 'size-5' : 'size-6'} strokeWidth={3} />
        </button>
      </div>

      {compact ? boutonZero : null}
    </div>
  );
}
