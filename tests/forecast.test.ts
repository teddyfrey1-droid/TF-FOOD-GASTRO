import { describe, expect, it } from 'vitest';
import {
  computeForecast,
  referenceRevenueForSession,
  type RevenueHistoryEntry,
} from '@/lib/mep/forecast';
import { computeLunchConsumption, ratioDeviation, averageObservedRatio } from '@/lib/mep/consumption';

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

describe('§5.7 — consommation réelle', () => {
  it('mesure la consommation du midi', () => {
    const result = computeLunchConsumption(
      { productId: 'p1', stockMorning: 5, productionMorningDone: 3, stockAfternoon: 2 },
      2000,
    );
    expect(result.consumedLunch).toBe(6);
    expect(result.consumedPer1000Eur).toBe(3);
  });

  it('renvoie null quand le CA du midi est inconnu', () => {
    const result = computeLunchConsumption(
      { productId: 'p1', stockMorning: 5, productionMorningDone: 0, stockAfternoon: 2 },
      null,
    );
    expect(result.consumedPer1000Eur).toBeNull();
  });

  it('calcule l’écart entre ratio théorique et ratio constaté', () => {
    expect(ratioDeviation(2, 3)).toBe(0.5);
    expect(ratioDeviation(0, 3)).toBeNull();
  });

  it('moyenne les ratios constatés en ignorant les trous', () => {
    expect(averageObservedRatio([2, null, 4])).toBe(3);
    expect(averageObservedRatio([null, null])).toBeNull();
  });
});
