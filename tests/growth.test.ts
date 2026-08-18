import { describe, expect, it } from 'vitest';
import {
  MIN_GROWTH_SAMPLE_DAYS,
  observedGrowthRate,
  shouldSuggestGrowthAdjustment,
  type GrowthSample,
} from '@/lib/mep/growth';

function samples(pairs: Array<[number, number]>): GrowthSample[] {
  return pairs.map(([actualHt, referenceHt], index) => ({
    date: `2026-06-${String(index + 1).padStart(2, '0')}`,
    actualHt,
    referenceHt,
  }));
}

describe('croissance constatée', () => {
  it('mesure la croissance sur l’agrégat de la période', () => {
    // 2 500 réalisés contre 2 000 l'an dernier : +25 %.
    const result = observedGrowthRate(samples([[2500, 2000]]));
    expect(result.observedRate).toBe(0.25);
    expect(result.sampleDays).toBe(1);
  });

  it('pondère par le poids réel des journées, pas par une moyenne de pourcentages', () => {
    // Un samedi à 4 000 contre 3 000 (+33 %) et un lundi à 300 contre 500 (−40 %).
    // Agrégat : 4 300 / 3 500 = +22,9 %. Une moyenne de pourcentages aurait
    // donné −3 %, écrasée par la petite journée.
    const result = observedGrowthRate(samples([[4000, 3000], [300, 500]]));
    expect(result.observedRate).toBeCloseTo(0.2286, 3);
  });

  it('écarte les journées sans référence exploitable', () => {
    const result = observedGrowthRate(samples([[2500, 2000], [1000, 0]]));
    expect(result.sampleDays).toBe(1);
    expect(result.observedRate).toBe(0.25);
  });

  it('rend null quand rien n’est comparable', () => {
    expect(observedGrowthRate([]).observedRate).toBeNull();
    expect(observedGrowthRate(samples([[1000, 0]])).observedRate).toBeNull();
  });

  it('mesure aussi une décroissance', () => {
    expect(observedGrowthRate(samples([[1500, 2000]])).observedRate).toBe(-0.25);
  });

  it('reporte les cumuls, pour que le directeur puisse vérifier', () => {
    const result = observedGrowthRate(samples([[2500, 2000], [1500, 1000]]));
    expect(result.totalActual).toBe(4000);
    expect(result.totalReference).toBe(3000);
  });
});

describe('proposer un ajustement du taux', () => {
  const enough = (rate: number) =>
    observedGrowthRate(
      Array.from({ length: MIN_GROWTH_SAMPLE_DAYS }, (_, index) => ({
        date: `2026-06-${String(index + 1).padStart(2, '0')}`,
        actualHt: 1000 * (1 + rate),
        referenceHt: 1000,
      })),
    );

  it('propose quand l’écart est net et les jours assez nombreux', () => {
    expect(shouldSuggestGrowthAdjustment(0, enough(0.25))).toBe(true);
  });

  it('ne dérange pas pour un écart d’un point', () => {
    expect(shouldSuggestGrowthAdjustment(0.24, enough(0.25))).toBe(false);
  });

  it('ne propose rien sur trop peu de jours', () => {
    const few = observedGrowthRate(samples([[2500, 2000], [2500, 2000]]));
    expect(shouldSuggestGrowthAdjustment(0, few)).toBe(false);
  });

  it('ne propose rien sans observation', () => {
    expect(shouldSuggestGrowthAdjustment(0.1, observedGrowthRate([]))).toBe(false);
  });

  it('propose aussi de baisser le taux quand on surestime', () => {
    expect(shouldSuggestGrowthAdjustment(0.3, enough(0.05))).toBe(true);
  });
});
