import { describe, expect, it } from 'vitest';
import {
  averageObservedRatio,
  computeServiceConsumption,
  eveningToLunchRatio,
  lunchShareOfDay,
  per1000,
  ratioDeviation,
  type ServiceConsumptionInput,
} from '@/lib/mep/consumption';

/**
 * Journée type : 5 gastros le matin, 3 produits avant le midi, 2 restants
 * après le service ; 4 produits l'après-midi, 1 restant le lendemain matin.
 *
 *   midi = 5 + 3 − 2 = 6
 *   soir = 2 + 4 − 1 = 5
 */
function input(overrides: Partial<ServiceConsumptionInput> = {}): ServiceConsumptionInput {
  return {
    productId: 'p1',
    stockMorning: 5,
    productionMorningDone: 3,
    stockAfternoon: 2,
    productionAfternoonDone: 4,
    stockNextMorning: 1,
    ...overrides,
  };
}

describe('§5.7 — consommation des deux services', () => {
  it('mesure le service du midi entre les deux comptages', () => {
    expect(computeServiceConsumption(input()).lunch).toBe(6);
  });

  it('mesure le service du soir grâce au comptage du lendemain matin', () => {
    // Les invendus du soir ne sont pas jetés : le stock du lendemain matin dit
    // exactement ce qui est parti le soir.
    expect(computeServiceConsumption(input()).evening).toBe(5);
  });

  it('totalise la journée entière', () => {
    const result = computeServiceConsumption(input());
    expect(result.daily).toBe(11);
    expect(result.isComplete).toBe(true);
  });

  it('compte la production réellement cochée à chaque service', () => {
    const result = computeServiceConsumption(
      input({ productionMorningDone: 0, productionAfternoonDone: 0 }),
    );
    expect(result.lunch).toBe(3);
    expect(result.evening).toBe(1);
  });

  it('ne devine pas le soir tant que le lendemain n’est pas compté', () => {
    const result = computeServiceConsumption(input({ stockNextMorning: null }));
    expect(result.lunch).toBe(6);
    expect(result.evening).toBeNull();
    expect(result.daily).toBeNull();
    expect(result.isComplete).toBe(false);
  });

  it('gère un service qui n’a rien consommé', () => {
    const result = computeServiceConsumption(
      input({ stockAfternoon: 8, productionAfternoonDone: 0, stockNextMorning: 8 }),
    );
    expect(result.lunch).toBe(0);
    expect(result.evening).toBe(0);
    expect(result.daily).toBe(0);
  });

  it('remonte une consommation négative telle quelle, pour qu’elle soit écartée', () => {
    // Plus de stock le lendemain qu'après le service : erreur de comptage, ou
    // production non cochée. Ce n'est pas une vente.
    const result = computeServiceConsumption(input({ stockNextMorning: 20 }));
    expect(result.evening).toBeLessThan(0);
  });

  it('ne dérive pas sur des demi-gastros', () => {
    const result = computeServiceConsumption({
      productId: 'p1',
      stockMorning: 0.1,
      productionMorningDone: 0.2,
      stockAfternoon: 0,
      productionAfternoonDone: 0.5,
      stockNextMorning: 0.2,
    });
    expect(result.lunch).toBe(0.3);
    expect(result.evening).toBe(0.3);
    expect(result.daily).toBe(0.6);
  });
});

describe('rapport au chiffre d’affaires de la journée', () => {
  it('ramène la consommation à 1 000 € de CA', () => {
    // 11 gastros pour 4 400 € => 2,5 pour 1 000 €.
    expect(per1000(11, 4400)).toBe(2.5);
  });

  it('ne calcule rien sans CA', () => {
    expect(per1000(11, null)).toBeNull();
    expect(per1000(11, 0)).toBeNull();
    expect(per1000(null, 4400)).toBeNull();
  });
});

describe('équilibre entre les deux services', () => {
  it('mesure la part du midi dans la journée', () => {
    // 6 sur 11 => 55 %.
    expect(lunchShareOfDay(computeServiceConsumption(input()))).toBeCloseTo(0.545, 3);
  });

  it('ne calcule pas de part sur une journée incomplète', () => {
    expect(lunchShareOfDay(computeServiceConsumption(input({ stockNextMorning: null })))).toBeNull();
  });

  it('ne calcule pas de part quand rien n’a été consommé', () => {
    const result = computeServiceConsumption(
      input({ stockAfternoon: 8, productionAfternoonDone: 0, stockNextMorning: 8 }),
    );
    expect(lunchShareOfDay(result)).toBeNull();
  });

  it('compare le soir au midi — c’est le réglage du coefficient d’après-midi', () => {
    // Le soir consomme 5 quand le midi consomme 6 : environ 83 %.
    expect(eveningToLunchRatio(6, 5)).toBeCloseTo(0.833, 3);
    // Services équivalents : coefficient 1,0.
    expect(eveningToLunchRatio(6, 6)).toBe(1);
    // Soir plus chargé : abaisser la cible du soir serait risqué.
    expect(eveningToLunchRatio(4, 6)).toBe(1.5);
  });

  it('ne compare rien sans mesure du soir', () => {
    expect(eveningToLunchRatio(6, null)).toBeNull();
    expect(eveningToLunchRatio(0, 5)).toBeNull();
  });
});

describe('marge entre cible et consommation', () => {
  it('une cible au-dessus de la consommation donne une marge positive', () => {
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
