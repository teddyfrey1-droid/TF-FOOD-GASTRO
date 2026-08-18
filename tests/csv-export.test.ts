import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv-export';

const strip = (csv: string) => csv.replace('﻿', '').trimEnd().split('\r\n');

describe('export CSV pour Excel français', () => {
  it('sépare par point-virgule', () => {
    expect(strip(toCsv(['Produit', 'Cible'], [['Saumon', 8]]))).toEqual([
      'Produit;Cible',
      'Saumon;8',
    ]);
  });

  it('écrit les décimales à la française', () => {
    expect(strip(toCsv(['Qté'], [[1.5]]))[1]).toBe('1,5');
  });

  it('protège les cellules contenant un point-virgule', () => {
    expect(strip(toCsv(['Note'], [['Décongeler; la veille']]))[1]).toBe(
      '"Décongeler; la veille"',
    );
  });

  it('double les guillemets internes', () => {
    expect(strip(toCsv(['Note'], [['Dit "frais"']]))[1]).toBe('"Dit ""frais"""');
  });

  it('protège les retours à la ligne', () => {
    expect(strip(toCsv(['Note'], [['ligne 1\nligne 2']])).join('\r\n')).toContain(
      '"ligne 1\nligne 2"',
    );
  });

  it('rend une cellule vide pour null et undefined', () => {
    expect(strip(toCsv(['A', 'B'], [[null, undefined]]))[1]).toBe(';');
  });

  it('commence par le BOM qu’attend Excel', () => {
    expect(toCsv(['A'], [['é']]).startsWith('﻿')).toBe(true);
  });
});
