import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBoolean, parseCsv, parseDate, parseFrenchNumber } from '../scripts/lib/csv';

describe('lecture CSV', () => {
  it('accepte le point-virgule d’Excel français', () => {
    const { headers, rows } = parseCsv('Produit;CA 0-1500\nSaumon;3');
    expect(headers).toEqual(['Produit', 'CA 0-1500']);
    expect(rows).toEqual([{ Produit: 'Saumon', 'CA 0-1500': '3' }]);
  });

  it('accepte aussi la virgule', () => {
    const { rows } = parseCsv('Produit,CA\nSaumon,3');
    expect(rows[0]).toEqual({ Produit: 'Saumon', CA: '3' });
  });

  it('retire le BOM ajouté par Excel', () => {
    const { headers } = parseCsv('﻿Produit;CA\nSaumon;3');
    expect(headers[0]).toBe('Produit');
  });

  it('gère les guillemets et les guillemets doublés', () => {
    const { rows } = parseCsv('Produit;Note\n"Saumon";"Dit ""frais"" en cuisine"');
    expect(rows[0].Note).toBe('Dit "frais" en cuisine');
  });

  it('gère un retour à la ligne à l’intérieur d’un champ', () => {
    const { rows } = parseCsv('Produit;Note\nSaumon;"ligne 1\nligne 2"');
    expect(rows).toHaveLength(1);
    expect(rows[0].Note).toBe('ligne 1\nligne 2');
  });

  it('ignore les lignes entièrement vides', () => {
    const { rows } = parseCsv('Produit;CA\nSaumon;3\n\n;\nThon;2');
    expect(rows.map((row) => row.Produit)).toEqual(['Saumon', 'Thon']);
  });

  it('gère les fins de ligne Windows', () => {
    const { rows } = parseCsv('Produit;CA\r\nSaumon;3\r\n');
    expect(rows[0]).toEqual({ Produit: 'Saumon', CA: '3' });
  });
});

describe('conversion des valeurs', () => {
  it('lit les nombres à la française', () => {
    expect(parseFrenchNumber('2,5')).toBe(2.5);
    expect(parseFrenchNumber('2.5')).toBe(2.5);
    expect(parseFrenchNumber('1 234,50')).toBe(1234.5);
    expect(parseFrenchNumber('3 200 €')).toBe(3200);
    expect(parseFrenchNumber('')).toBeNull();
    expect(parseFrenchNumber('abc')).toBeNull();
  });

  it('lit les dates ISO et françaises', () => {
    expect(parseDate('2025-08-19')).toBe('2025-08-19');
    expect(parseDate('19/08/2025')).toBe('2025-08-19');
    expect(parseDate('3/1/2025')).toBe('2025-01-03');
    expect(parseDate('pas une date')).toBeNull();
  });

  it('lit les booléens de fermeture', () => {
    expect(parseBoolean('1')).toBe(true);
    expect(parseBoolean('oui')).toBe(true);
    expect(parseBoolean('X')).toBe(true);
    expect(parseBoolean('0')).toBe(false);
    expect(parseBoolean('')).toBe(false);
  });
});

describe('fichiers d’exemple fournis', () => {
  it('le modèle de référentiel produits se lit correctement', () => {
    const { headers, rows } = parseCsv(readFileSync('data/produits.example.csv', 'utf8'));
    expect(rows).toHaveLength(5);
    expect(rows[0].Produit).toBe('Saumon');
    expect(parseFrenchNumber(rows[0]['VENTE POUR'])).toBe(4.6);
    expect(rows[3].Famille).toBe('les_plus');

    // La colonne conso/1000 est présente dans l'export du Sheet : elle doit
    // être lue sans erreur, mais l'import l'ignore volontairement.
    expect(headers).toContain('conso/1000');
  });

  it('le modèle de CA se lit correctement', () => {
    const { rows } = parseCsv(readFileSync('data/ca-n-1.example.csv', 'utf8'));
    expect(rows).toHaveLength(7);
    expect(parseDate(rows[1].date)).toBe('2025-08-19');
    expect(parseFrenchNumber(rows[1].ca_ht)).toBe(3200);
    expect(parseBoolean(rows[6].ferme)).toBe(true);
  });
});
