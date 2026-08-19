import { describe, expect, it } from 'vitest';
import {
  computeForecast,
  referenceRevenueForSession,
  type RevenueHistoryEntry,
} from '@/lib/mep/forecast';
import { computeProductTarget } from '@/lib/mep/targets';

function history(entries: Array<[string, number, boolean?]>): Map<string, RevenueHistoryEntry> {
  return new Map(
    entries.map(([date, revenueHt, isClosedDay = false]) => [
      date,
      { date, revenueHt, isClosedDay },
    ]),
  );
}

describe('§5.1 — prévision de CA', () => {
  it('utilise le même jour de semaine de l’année N-1', () => {
    const result = computeForecast({
      date: '2026-08-18', // mardi, semaine ISO 34
      history: history([['2025-08-19', 3000]]), // mardi, semaine ISO 34 de 2025
      growthRate: 0.1,
    });
    expect(result.referenceDate).toBe('2025-08-19');
    expect(result.forecastRevenue).toBe(3300);
  });

  it('applique le coefficient manuel du jour', () => {
    const result = computeForecast({
      date: '2026-08-18',
      history: history([['2025-08-19', 3000]]),
      growthRate: 0.1,
      coefficient: 0.5,
    });
    expect(result.forecastRevenue).toBe(1650);
    expect(result.coefficient).toBe(0.5);
  });

  it('vaut 1 par défaut pour le coefficient', () => {
    const result = computeForecast({
      date: '2026-08-18',
      history: history([['2025-08-19', 2000]]),
      growthRate: 0,
    });
    expect(result.coefficient).toBe(1);
    expect(result.forecastRevenue).toBe(2000);
  });

  it('remonte au même jour de la semaine précédente si N-1 était fermé', () => {
    const result = computeForecast({
      date: '2026-08-18',
      history: history([
        ['2025-08-19', 0, true], // fermé
        ['2025-08-12', 2500], // mardi précédent
      ]),
      growthRate: 0,
    });
    expect(result.referenceDate).toBe('2025-08-12');
    expect(result.weeksBacktracked).toBe(1);
    expect(result.forecastRevenue).toBe(2500);
  });

  it('remonte aussi quand la date de référence est absente de l’historique', () => {
    const result = computeForecast({
      date: '2026-08-18',
      history: history([['2025-08-05', 1800]]),
      growthRate: 0,
    });
    expect(result.referenceDate).toBe('2025-08-05');
    expect(result.weeksBacktracked).toBe(2);
  });

  it('renvoie null plutôt que d’inventer un CA quand rien n’est exploitable', () => {
    const result = computeForecast({
      date: '2026-08-18',
      history: history([]),
      growthRate: 0.1,
    });
    expect(result.forecastRevenue).toBeNull();
    expect(result.referenceDate).toBeNull();
  });
});

describe('§5.2 — CA de référence par session', () => {
  const settings = { safetyMargin: 0.1, afternoonTargetRatio: 1.0 };

  it('applique la marge de sécurité le matin', () => {
    expect(referenceRevenueForSession(3000, 'morning', settings)).toBe(3300);
  });

  it('donne le MÊME CA de référence l’après-midi quand le ratio vaut 1', () => {
    expect(referenceRevenueForSession(3000, 'afternoon', settings)).toBe(3300);
  });

  it('abaisse la cible du soir quand on réduit le ratio', () => {
    expect(
      referenceRevenueForSession(3000, 'afternoon', {
        safetyMargin: 0.1,
        afternoonTargetRatio: 0.8,
      }),
    ).toBe(2640);
  });
});

/**
 * Le scénario complet décrit par le restaurant :
 *
 *   « si le 26 juin 2025 a fait 2 000 €, alors le 25 juin 2026 est estimé à
 *     2 500 €, et on aura besoin de plus de saumon »
 *
 * C'est tout l'intérêt du calcul : anticiper la production sur un CA estimé,
 * pour ne jamais manquer sans pour autant gâcher.
 */
describe('scénario du restaurant — anticiper la production sur le CA estimé', () => {
  const saumon = {
    id: 'saumon',
    name: 'Saumon',
    family: 'mise_en_place' as const,
    unit: 'gastro' as const,
    baseQty: 4.6,
    countStep: 0.5,
    minMode: 'auto' as const,
    minDivisor: 2,
    minQtyManual: null,
    floorQty: null,
    ceilingQty: null,
    priority: 3 as const,
  };

  const history = new Map([
    ['2025-06-26', { date: '2025-06-26', revenueHt: 2000, isClosedDay: false }],
  ]);

  it('sans croissance, le 25 juin 2026 reprend le CA de l’an dernier', () => {
    const forecast = computeForecast({ date: '2026-06-25', history, growthRate: 0 });
    expect(forecast.referenceDate).toBe('2025-06-26');
    expect(forecast.forecastRevenue).toBe(2000);
  });

  it('avec 25 % de croissance, la prévision passe à 2 500 €', () => {
    const forecast = computeForecast({ date: '2026-06-25', history, growthRate: 0.25 });
    expect(forecast.forecastRevenue).toBe(2500);
  });

  it('et la cible du saumon monte avec le CA estimé', () => {
    // 4,6 x 2 x (2 000 / 4 000) = 4,6 -> 5
    expect(computeProductTarget(saumon, 2000, 2).target).toBe(5);
    // 4,6 x 2 x (2 500 / 4 000) = 5,75 -> 6
    expect(computeProductTarget(saumon, 2500, 2).target).toBe(6);
  });

  it('le taux de croissance se change à tout moment et agit immédiatement', () => {
    const previsions = [0, 0.25, 0.3].map(
      (growthRate) => computeForecast({ date: '2026-06-25', history, growthRate }).forecastRevenue,
    );
    expect(previsions).toEqual([2000, 2500, 2600]);
  });

  it('le coefficient du jour se cumule au taux de croissance', () => {
    // Jour annoncé calme : coefficient 0,8 par-dessus les +25 %.
    const forecast = computeForecast({
      date: '2026-06-25',
      history,
      growthRate: 0.25,
      coefficient: 0.8,
    });
    expect(forecast.forecastRevenue).toBe(2000);
  });
});
