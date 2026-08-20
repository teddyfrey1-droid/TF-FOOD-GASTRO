import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLE_SESSIONS,
  safetyFactor,
  suggestBaseFromConsumption,
  suggestBaseQty,
  type CalibrationSample,
  type ConsumptionCalibration,
} from '@/lib/mep/calibration';

function sample(overrides: Partial<CalibrationSample> = {}): CalibrationSample {
  return { sessions: 20, critical: 0, avgCoverage: 0.5, baseQty: 4.6, ...overrides };
}

describe('recalibrage d’une base « VENTE POUR »', () => {
  it('ne propose rien sans assez de comptages', () => {
    // Sous ce seuil, un seul jour atypique déplacerait la base : ce serait
    // du bruit présenté comme une mesure.
    for (let sessions = 0; sessions < MIN_SAMPLE_SESSIONS; sessions += 1) {
      expect(suggestBaseQty(sample({ sessions, critical: sessions }))).toBeNull();
    }
  });

  it('monte la base quand le produit tombe trop souvent en rupture', () => {
    // 8 ruptures sur 20 = 40 % -> facteur 1,4.
    expect(suggestBaseQty(sample({ sessions: 20, critical: 8 }))).toBe(6.4);
  });

  it('la hausse est bornée à +50 %, même en rupture permanente', () => {
    // Sans borne, un produit en rupture tous les jours doublerait d'un coup
    // et provoquerait la surproduction inverse.
    expect(suggestBaseQty(sample({ sessions: 20, critical: 20, baseQty: 4 }))).toBe(6);
  });

  it('ne bouge pas sous le seuil de 20 % de ruptures', () => {
    // 3 sur 20 = 15 % : une rupture occasionnelle n'est pas un défaut de
    // calibrage, c'est la vie d'un service.
    expect(suggestBaseQty(sample({ sessions: 20, critical: 3 }))).toBeNull();
  });

  it('descend la base d’un produit jamais en rupture et toujours plein', () => {
    expect(suggestBaseQty(sample({ sessions: 20, critical: 0, avgCoverage: 0.9 }))).toBe(4.1);
  });

  it('ne descend pas un produit jamais en rupture mais bien consommé', () => {
    // Couverture 0,5 : les bacs se vident sans jamais manquer. C'est
    // exactement le réglage recherché, il n'y a rien à corriger.
    expect(suggestBaseQty(sample({ sessions: 20, critical: 0, avgCoverage: 0.5 }))).toBeNull();
  });

  it('ne propose rien sans couverture mesurée', () => {
    expect(suggestBaseQty(sample({ critical: 0, avgCoverage: null }))).toBeNull();
  });

  it('laisse tranquille une base non renseignée', () => {
    expect(suggestBaseQty(sample({ baseQty: 0, critical: 10 }))).toBeNull();
  });

  it('ne descend jamais une base sous 0,1', () => {
    // 0,1 x 0,9 = 0,09 -> arrondi à 0,1, donc pas de baisse : on ne
    // transforme pas un produit en fantôme à cible nulle.
    expect(suggestBaseQty(sample({ baseQty: 0.1, critical: 0, avgCoverage: 0.9 }))).toBeNull();
  });

  it('la proposition garde une seule décimale, comme le Sheet', () => {
    const propose = suggestBaseQty(sample({ sessions: 20, critical: 5, baseQty: 1.7 }));
    expect(propose).not.toBeNull();
    expect(Number.isInteger(propose! * 10)).toBe(true);
  });
});

describe('recalibrage d’après la consommation mesurée', () => {
  function conso(overrides: Partial<ConsumptionCalibration> = {}): ConsumptionCalibration {
    return {
      dailyPer1000: 1.15,
      theoreticalPer1000: 2.3,
      completeDays: 20,
      baseQty: 4.6,
      ...overrides,
    };
  }

  it('mesure le facteur de sécurité réellement en vigueur', () => {
    // Cible 2,3 pour 1 000 € et consommation 1,15 : la cible couvre deux
    // journées, exactement ce qu'on vise.
    expect(safetyFactor(conso())).toBe(2);
  });

  it('ne propose rien quand le facteur est déjà le bon', () => {
    expect(suggestBaseFromConsumption(conso())).toBeNull();
  });

  it('monte la base quand la cible ne couvre pas la journée', () => {
    // Facteur 1 : la cible vaut exactement ce qui sort dans la journée, donc
    // le bac est vide avant la fin du second service.
    const propose = suggestBaseFromConsumption(conso({ dailyPer1000: 2.3 }));
    expect(propose).toBe(6.9); // 4,6 x 1,5 (hausse bornée)
  });

  it('descend la base quand on vise trois fois ce qu’on vend', () => {
    // Facteur 4 -> écart 0,5 -> base divisée par deux.
    const propose = suggestBaseFromConsumption(conso({ dailyPer1000: 0.575 }));
    expect(propose).toBe(2.3);
  });

  it('ne propose rien sans assez de journées complètes', () => {
    expect(suggestBaseFromConsumption(conso({ completeDays: 4, dailyPer1000: 2.3 }))).toBeNull();
  });

  it('ne propose rien sans consommation mesurée', () => {
    expect(suggestBaseFromConsumption(conso({ dailyPer1000: null }))).toBeNull();
    expect(safetyFactor(conso({ theoreticalPer1000: null }))).toBeNull();
  });

  it('ignore un écart de moins de 15 %', () => {
    // Facteur 2,2 : au-dessus de la cible, mais faire bouger un réglage
    // pour ça n'aurait aucun effet visible en service.
    expect(suggestBaseFromConsumption(conso({ theoreticalPer1000: 2.53 }))).toBeNull();
  });
});
