import { describe, expect, it } from 'vitest';
import { checkBracketCoverage, parseBracketHeader } from '../scripts/lib/brackets';

describe('reconnaissance des colonnes de CA', () => {
  it('lit les intervalles, quelle que soit la ponctuation', () => {
    expect(parseBracketHeader('CA 0-1500')).toMatchObject({ caMin: 0, caMax: 1500 });
    expect(parseBracketHeader('1500 - 2500')).toMatchObject({ caMin: 1500, caMax: 2500 });
    expect(parseBracketHeader('2500 à 4000 €')).toMatchObject({ caMin: 2500, caMax: 4000 });
    expect(parseBracketHeader('CA 1 000-2 000 EUR')).toMatchObject({ caMin: 1000, caMax: 2000 });
  });

  it('lit les tranches ouvertes vers le haut', () => {
    expect(parseBracketHeader('5500+')).toMatchObject({ caMin: 5500, caMax: null });
    expect(parseBracketHeader('> 5500')).toMatchObject({ caMin: 5500, caMax: null });
    expect(parseBracketHeader('CA 5500 et plus')).toMatchObject({ caMin: 5500, caMax: null });
    expect(parseBracketHeader('à partir de 5500 €')).toMatchObject({ caMin: 5500, caMax: null });
  });

  it('lit les tranches ouvertes vers le bas', () => {
    expect(parseBracketHeader('< 1000')).toMatchObject({ caMin: null, caMax: 1000 });
    expect(parseBracketHeader('moins de 1000 €')).toMatchObject({ caMin: null, caMax: 1000 });
  });

  it('ignore les colonnes qui ne sont pas des tranches de CA', () => {
    expect(parseBracketHeader('Produit')).toBeNull();
    expect(parseBracketHeader('Format GN')).toBeNull();
    expect(parseBracketHeader('Note')).toBeNull();
    expect(parseBracketHeader('')).toBeNull();
  });

  it('refuse un intervalle inversé plutôt que de l’accepter en silence', () => {
    expect(parseBracketHeader('2500-1500')).toBeNull();
  });

  it('ne prend pas un nombre nu pour une tranche', () => {
    // « 1500 » seul est ambigu : ce n'est ni « ≥ 1500 » ni « < 1500 ».
    expect(parseBracketHeader('1500')).toBeNull();
  });
});

describe('couverture des tranches', () => {
  const brackets = [
    { header: 'a', caMin: 0, caMax: 1500 },
    { header: 'b', caMin: 1500, caMax: 2500 },
    { header: 'c', caMin: 2500, caMax: null },
  ];

  it('ne signale rien quand les tranches s’enchaînent proprement', () => {
    expect(checkBracketCoverage(brackets)).toEqual([]);
  });

  it('signale un trou entre deux tranches', () => {
    const problems = checkBracketCoverage([
      { header: 'a', caMin: 0, caMax: 1500 },
      { header: 'b', caMin: 2000, caMax: null },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Trou');
  });

  it('signale un chevauchement', () => {
    const problems = checkBracketCoverage([
      { header: 'a', caMin: 0, caMax: 2000 },
      { header: 'b', caMin: 1500, caMax: null },
    ]);
    expect(problems[0]).toContain('Chevauchement');
  });

  it('signale une dernière tranche bornée : au-delà, plus aucune cible', () => {
    const problems = checkBracketCoverage([
      { header: 'a', caMin: 0, caMax: 1500 },
      { header: 'b', caMin: 1500, caMax: 2500 },
    ]);
    expect(problems.some((problem) => problem.includes('au-delà'))).toBe(true);
  });
});
