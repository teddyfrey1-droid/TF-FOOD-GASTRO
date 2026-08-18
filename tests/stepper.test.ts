import { describe, expect, it } from 'vitest';
import { roundToNearestStep } from '@/lib/mep/rounding';

/**
 * Le stepper de l'écran de comptage utilise le même arrondi que le moteur
 * métier. Ces cas décrivent ce que l'employé voit après une série d'appuis.
 */
describe('comportement du stepper de gastros', () => {
  const press = (value: number, step: number, delta: number) =>
    Math.max(0, roundToNearestStep(value + delta, step));

  it('avance et recule par demi-gastros', () => {
    let value = 0;
    for (const expected of [0.5, 1, 1.5, 2]) {
      value = press(value, 0.5, 0.5);
      expect(value).toBe(expected);
    }
    for (const expected of [1.5, 1, 0.5, 0]) {
      value = press(value, 0.5, -0.5);
      expect(value).toBe(expected);
    }
  });

  it('ne descend jamais sous zéro', () => {
    expect(press(0, 0.5, -0.5)).toBe(0);
    expect(press(0.5, 0.5, -1)).toBe(0);
  });

  it('ne dérive pas après de nombreux appuis', () => {
    let value = 0;
    for (let i = 0; i < 60; i += 1) value = press(value, 0.5, 0.5);
    expect(value).toBe(30);
    for (let i = 0; i < 60; i += 1) value = press(value, 0.5, -0.5);
    expect(value).toBe(0);
  });

  it('recale une saisie clavier hors du pas', () => {
    // L'employé tape 3,7 au pavé numérique : on recale au demi-gastro le plus proche.
    expect(roundToNearestStep(3.7, 0.5)).toBe(3.5);
    expect(roundToNearestStep(3.8, 0.5)).toBe(4);
  });

  it('respecte un pas différent de 0,5', () => {
    expect(press(0, 1, 1)).toBe(1);
    expect(press(1, 0.25, 0.25)).toBe(1.25);
  });
});
