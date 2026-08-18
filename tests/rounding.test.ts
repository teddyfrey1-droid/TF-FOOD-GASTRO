import { describe, expect, it } from 'vitest';
import { clamp, isMultipleOfStep, roundToNearestStep, roundUpToStep, snap } from '@/lib/mep/rounding';

describe('arrondis au demi-gastro', () => {
  it('arrondit vers le haut au multiple du pas', () => {
    expect(roundUpToStep(0.1, 0.5)).toBe(0.5);
    expect(roundUpToStep(0.5, 0.5)).toBe(0.5);
    expect(roundUpToStep(0.51, 0.5)).toBe(1);
    expect(roundUpToStep(2.25, 0.5)).toBe(2.5);
    expect(roundUpToStep(0, 0.5)).toBe(0);
  });

  it("ne remonte pas une valeur déjà alignée sur le pas (dérive flottante)", () => {
    // 4.2 / 0.5 vaut 8.399999999999999 en IEEE-754 : sans tolérance, 7.5 deviendrait 8.
    expect(roundUpToStep(7.5, 0.5)).toBe(7.5);
    expect(roundUpToStep(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(roundUpToStep(1.4, 0.7)).toBe(1.4);
  });

  it('arrondit au multiple le plus proche', () => {
    expect(roundToNearestStep(0.24, 0.5)).toBe(0);
    expect(roundToNearestStep(0.25, 0.5)).toBe(0.5);
    expect(roundToNearestStep(0.74, 0.5)).toBe(0.5);
    expect(roundToNearestStep(2.75, 0.5)).toBe(3);
  });

  it('produit toujours un multiple exact du pas', () => {
    for (const value of [0.3, 1.1, 3.7, 8.9, 12.34]) {
      expect(isMultipleOfStep(roundUpToStep(value, 0.5), 0.5)).toBe(true);
      expect(isMultipleOfStep(roundToNearestStep(value, 0.5), 0.5)).toBe(true);
    }
  });

  it('refuse un pas nul ou négatif', () => {
    expect(() => roundUpToStep(1, 0)).toThrow();
    expect(() => roundToNearestStep(1, -0.5)).toThrow();
  });

  it('borne avec plancher et plafond optionnels', () => {
    expect(clamp(2, 4, 10)).toBe(4);
    expect(clamp(12, 4, 10)).toBe(10);
    expect(clamp(6, null, null)).toBe(6);
    expect(clamp(2, 4, null)).toBe(4);
    expect(clamp(12, null, 10)).toBe(10);
  });

  it('efface la dérive binaire', () => {
    expect(snap(0.1 + 0.2)).toBe(0.3);
  });
});
