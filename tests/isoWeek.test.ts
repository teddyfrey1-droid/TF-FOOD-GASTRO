import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateFromIsoWeek,
  isoWeekNumber,
  isoWeekday,
  isoWeekYear,
  isoWeeksInYear,
  referenceDateLastYear,
} from '@/lib/mep/isoWeek';

describe('semaine ISO', () => {
  it('numérote les jours de lundi (1) à dimanche (7)', () => {
    expect(isoWeekday('2026-08-17')).toBe(1); // lundi
    expect(isoWeekday('2026-08-23')).toBe(7); // dimanche
  });

  it('calcule le numéro et l’année ISO, y compris à cheval sur l’an', () => {
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    expect(isoWeekYear('2026-01-01')).toBe(2026);
    // 1er janvier 2027 = vendredi -> semaine 53 de l'année ISO 2026
    expect(isoWeekNumber('2027-01-01')).toBe(53);
    expect(isoWeekYear('2027-01-01')).toBe(2026);
  });

  it('connaît les années ISO à 53 semaines', () => {
    expect(isoWeeksInYear(2026)).toBe(53);
    expect(isoWeeksInYear(2025)).toBe(52);
  });

  it('reconstruit une date depuis (année, semaine, jour)', () => {
    expect(dateFromIsoWeek(2026, 34, 1)).toBe('2026-08-17');
    expect(dateFromIsoWeek(2026, 1, 4)).toBe('2026-01-01');
  });

  it('décale de N jours', () => {
    expect(addDays('2026-03-01', -7)).toBe('2026-02-22');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('date de référence N-1 (§5.1)', () => {
  it('conserve le JOUR DE SEMAINE, pas la date calendaire', () => {
    // Mardi 18 août 2026 (semaine ISO 34) -> mardi de la semaine 34 de 2025.
    const ref = referenceDateLastYear('2026-08-18');
    expect(isoWeekday(ref)).toBe(isoWeekday('2026-08-18'));
    expect(isoWeekNumber(ref)).toBe(isoWeekNumber('2026-08-18'));
    expect(isoWeekYear(ref)).toBe(2025);
    expect(ref).toBe('2025-08-19');
  });

  it('cas du restaurant : 25 juin 2026 -> 26 juin 2025', () => {
    // Exemple donné par le restaurant. Les deux dates sont des jeudis de la
    // semaine ISO 26 : c'est bien le JOUR DE SEMAINE qui commande, pas le
    // quantième. Comparer un 25 juin à un 25 juin comparerait un jeudi à un
    // mercredi — et donc un jour de semaine à un autre.
    expect(referenceDateLastYear('2026-06-25')).toBe('2025-06-26');
    expect(isoWeekday('2026-06-25')).toBe(isoWeekday('2025-06-26'));
    expect(isoWeekNumber('2026-06-25')).toBe(26);
  });

  it('ne renvoie jamais la même date calendaire quand le jour de semaine diffère', () => {
    const ref = referenceDateLastYear('2026-03-10'); // mardi
    expect(isoWeekday(ref)).toBe(2);
    expect(ref).not.toBe('2025-03-10');
  });

  it('retombe sur la semaine 52 quand N-1 n’a pas de semaine 53', () => {
    // 2026-12-31 est en semaine ISO 53 ; 2025 n'a que 52 semaines.
    const ref = referenceDateLastYear('2026-12-31');
    expect(isoWeekNumber(ref)).toBe(52);
    expect(isoWeekYear(ref)).toBe(2025);
    expect(isoWeekday(ref)).toBe(isoWeekday('2026-12-31'));
  });

  it('reste cohérent sur toute une année (même jour de semaine, année ISO N-1)', () => {
    let date = '2026-01-01';
    for (let i = 0; i < 365; i += 1) {
      const ref = referenceDateLastYear(date);
      expect(isoWeekday(ref)).toBe(isoWeekday(date));
      expect(isoWeekYear(ref)).toBe(isoWeekYear(date) - 1);
      date = addDays(date, 1);
    }
  });
});
