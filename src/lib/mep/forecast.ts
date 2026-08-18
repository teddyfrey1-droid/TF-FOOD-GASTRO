/**
 * §5.1 et §5.2 — Prévision de CA et CA de référence par session.
 */

import { snap } from './rounding';
import { addDays, referenceDateLastYear, type IsoDate } from './isoWeek';
import type { RevenueSettings, SessionKind } from './types';

/** Une journée de CA réalisé l'an dernier. */
export interface RevenueHistoryEntry {
  date: IsoDate;
  revenueHt: number;
  isClosedDay: boolean;
}

/** Nombre maximal de reculs d'une semaine quand la date de référence est fermée. */
export const MAX_CLOSED_DAY_LOOKBACK_WEEKS = 8;

export interface ForecastInput {
  /** Le jour J pour lequel on prévoit. */
  date: IsoDate;
  /** Historique N-1 indexé par date. */
  history: ReadonlyMap<IsoDate, RevenueHistoryEntry>;
  /** Coefficient manuel du jour (férié, vacances, météo...). Défaut 1. */
  coefficient?: number;
  growthRate: number;
}

export interface ForecastResult {
  date: IsoDate;
  /** Date N-1 effectivement utilisée (après recul éventuel sur jour de fermeture). */
  referenceDate: IsoDate | null;
  referenceRevenue: number | null;
  coefficient: number;
  /** CA prévisionnel du jour J. null si aucune référence exploitable. */
  forecastRevenue: number | null;
  /** Nombre de semaines de recul appliquées pour éviter un jour de fermeture. */
  weeksBacktracked: number;
}

/**
 * CA_prev(J) = revenue_history[date_ref] × (1 + growth_rate) × coefficient(J)
 *
 * `date_ref` est aligné sur le JOUR DE SEMAINE (même semaine ISO, année N-1),
 * pas sur la date calendaire. Si `date_ref` est un jour de fermeture, on remonte
 * au même jour de semaine de la semaine précédente.
 */
export function computeForecast(input: ForecastInput): ForecastResult {
  const coefficient = input.coefficient ?? 1;
  let candidate = referenceDateLastYear(input.date);

  for (let weeks = 0; weeks <= MAX_CLOSED_DAY_LOOKBACK_WEEKS; weeks += 1) {
    const entry = input.history.get(candidate);
    if (entry && !entry.isClosedDay) {
      return {
        date: input.date,
        referenceDate: candidate,
        referenceRevenue: entry.revenueHt,
        coefficient,
        forecastRevenue: snap(entry.revenueHt * (1 + input.growthRate) * coefficient),
        weeksBacktracked: weeks,
      };
    }
    candidate = addDays(candidate, -7);
  }

  return {
    date: input.date,
    referenceDate: null,
    referenceRevenue: null,
    coefficient,
    forecastRevenue: null,
    weeksBacktracked: MAX_CLOSED_DAY_LOOKBACK_WEEKS,
  };
}

/**
 * §5.2 — CA de référence servant au calculateur, selon la session.
 *
 *   MATIN      : CA_ref = CA_prev × (1 + safety_margin)
 *   APRÈS-MIDI : CA_ref = CA_prev × (1 + safety_margin) × afternoon_target_ratio
 */
export function referenceRevenueForSession(
  forecastRevenue: number,
  session: SessionKind,
  settings: Pick<RevenueSettings, 'safetyMargin' | 'afternoonTargetRatio'>,
): number {
  const base = forecastRevenue * (1 + settings.safetyMargin);
  return snap(session === 'afternoon' ? base * settings.afternoonTargetRatio : base);
}
