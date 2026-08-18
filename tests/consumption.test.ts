import { describe, expect, it } from 'vitest';
import {
  averageObservedRatio,
  computeLunchConsumption,
  ratioDeviation,
  type ConsumptionInput,
} from '@/lib/mep/consumption';

function input(overrides: Partial<ConsumptionInput> = {}): ConsumptionInput {
  return {
    productId: 'p1',
    stockMorning: 5,
    productionMorningDone: 3,
    stockAfternoon: 2,
    ...overrides,
  };
}

/**
 * Le restaurant enregistre son chiffre d'affaires À LA JOURNÉE, pas par
 * service. La consommation du midi se rapporte donc au CA du jour.
 */
describe('§5.7 — consommation du midi', () => {
  it('mesure la consommation entre les deux comptages', () => {
    const result = computeLunchConsumption(input(), { dailyHt: 4000 });
    // 5 au matin + 3 produits − 2 restants = 6 gastros partis au midi.
    expect(result.consumedLunch).toBe(6);
  });

  it('compte la production du matin réellement cochée', () => {
    expect(
      computeLunchConsumption(input({ productionMorningDone: 0 }), { dailyHt: 4000 })
        .consumedLunch,
    ).toBe(3);
  });

  it('rapporte la consommation au CA de la JOURNÉE, sans hypothèse', () => {
    const result = computeLunchConsumption(input(), { dailyHt: 4000 });
    // 6 gastros pour 4 000 € => 1,5 gastro pour 1 000 €.
    expect(result.lunchPerDaily1000).toBe(1.5);
    expect(result.basis).toBeNull();
  });

  it('n’extrapole rien tant que la part du midi est inconnue', () => {
    const result = computeLunchConsumption(input(), { dailyHt: 4000 });
    expect(result.fullDayPer1000).toBeNull();
    expect(result.basis).toBeNull();
  });

  it('extrapole la journée entière quand la part du midi est réglée', () => {
    const result = computeLunchConsumption(input(), { dailyHt: 4000, lunchShare: 0.6 });
    // 1,5 mesuré au midi, qui pèse 60 % du CA => 2,5 sur la journée.
    expect(result.fullDayPer1000).toBe(2.5);
    expect(result.basis).toBe('estime');
  });

  it('préfère le CA du midi réel dès qu’il est saisi', () => {
    const result = computeLunchConsumption(input(), {
      dailyHt: 4000,
      lunchHt: 2400,
      lunchShare: 0.9,
    });
    // Le CA du midi est connu : la part réelle (2400/4000 = 60 %) l'emporte
    // sur le réglage à 90 %.
    expect(result.basis).toBe('saisi');
    expect(result.fullDayPer1000).toBe(2.5);
  });

  it('ignore une part du midi aberrante', () => {
    for (const lunchShare of [0, -0.5, 1.5]) {
      expect(computeLunchConsumption(input(), { dailyHt: 4000, lunchShare }).fullDayPer1000).toBeNull();
    }
  });

  it('ne calcule aucun ratio sans CA du jour', () => {
    const result = computeLunchConsumption(input(), { dailyHt: null, lunchShare: 0.6 });
    expect(result.consumedLunch).toBe(6);
    expect(result.lunchPerDaily1000).toBeNull();
    expect(result.fullDayPer1000).toBeNull();
  });

  it('ne calcule aucun ratio sur un CA nul', () => {
    expect(computeLunchConsumption(input(), { dailyHt: 0 }).lunchPerDaily1000).toBeNull();
  });

  it('remonte une consommation négative telle quelle, pour qu’elle soit écartée', () => {
    // Plus de stock l'après-midi que le matin : c'est une erreur de comptage,
    // pas une vente. La détection se fait chez l'appelant.
    const result = computeLunchConsumption(
      input({ stockMorning: 2, productionMorningDone: 0, stockAfternoon: 5 }),
      { dailyHt: 4000 },
    );
    expect(result.consumedLunch).toBe(-3);
  });

  it('ne dérive pas sur des demi-gastros', () => {
    const result = computeLunchConsumption(
      input({ stockMorning: 0.1, productionMorningDone: 0.2, stockAfternoon: 0 }),
      { dailyHt: 1000 },
    );
    expect(result.consumedLunch).toBe(0.3);
  });
});

describe('marge entre cible et consommation', () => {
  it('une cible au-dessus de la consommation donne une marge positive', () => {
    // Cible 3, consommation constatée 2 => 33 % de marge.
    expect(ratioDeviation(3, 2)).toBeCloseTo(0.3333, 3);
  });

  it('une cible sous la consommation donne une marge négative', () => {
    expect(ratioDeviation(2, 3)).toBe(-0.5);
  });

  it('ne calcule rien sans cible théorique', () => {
    expect(ratioDeviation(null, 3)).toBeNull();
    expect(ratioDeviation(0, 3)).toBeNull();
    expect(ratioDeviation(3, null)).toBeNull();
  });
});

describe('moyenne sur la période', () => {
  it('ignore les jours sans mesure', () => {
    expect(averageObservedRatio([2, null, 4])).toBe(3);
  });

  it('rend null quand aucun jour n’est exploitable', () => {
    expect(averageObservedRatio([null, null])).toBeNull();
    expect(averageObservedRatio([])).toBeNull();
  });
});
