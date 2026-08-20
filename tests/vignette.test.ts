import { describe, expect, it } from 'vitest';
import { pictogrammeCategorie, pictogrammeProduit } from '@/lib/produits/vignette';

describe('vignette de produit', () => {
  it('reconnaît les produits du restaurant', () => {
    expect(pictogrammeProduit('Saumon')).toBe('🍣');
    expect(pictogrammeProduit('Gyoza Poulet')).toBe('🥟');
    expect(pictogrammeProduit('Açaï')).toBe('🫐');
  });

  it('ignore les accents et la casse', () => {
    expect(pictogrammeProduit('ÉPINARD')).toBe(pictogrammeProduit('Épinard'));
    expect(pictogrammeProduit('Pastèques')).toBe('🍉');
  });

  it('préfère le mot-clé le plus spécifique', () => {
    // « Creamy thon » est une sauce : elle ne doit pas prendre l'icône du
    // poisson, ni « Chou rouge » celle du chou générique par accident.
    expect(pictogrammeProduit('Creamy thon')).toBe('🥣');
    expect(pictogrammeProduit('Thon')).toBe('🐟');
    expect(pictogrammeProduit('Poulet Mayo')).toBe('🍗');
  });

  it('retombe sur la catégorie quand le nom ne dit rien', () => {
    expect(pictogrammeProduit('Nouvelle recette', 'Desserts')).toBe(
      pictogrammeCategorie('Desserts'),
    );
    expect(pictogrammeProduit('Nouvelle recette', 'Ingrédients')).toBe(
      pictogrammeCategorie('Ingrédients'),
    );
  });

  it('donne toujours un pictogramme, même sans catégorie connue', () => {
    expect(pictogrammeProduit('Chose inconnue')).toBeTruthy();
    expect(pictogrammeProduit('Chose inconnue', 'Catégorie inventée')).toBeTruthy();
    expect(pictogrammeCategorie('Catégorie inventée')).toBeTruthy();
  });

  it('couvre tous les produits du catalogue sans repli générique', () => {
    // Un produit qui retomberait sur le repli de catégorie serait
    // indiscernable de ses voisins dans la liste.
    const catalogue = [
      'Poulet Mayo', 'Protéine végétale', 'Saumon', 'Thon', 'Crevette',
      'Poulet Crispy', 'Effiloché de porc', 'Edamame', 'Concombre', 'Avocat',
      'Carotte', 'Mangue', 'Guacamole', 'Feta', 'Quinoa', 'Creamy citron',
      'Creamy thon', 'Pastèque', 'Coleslaw', 'Chou blanc', 'Chou japonais',
      'Chou rouge', 'Épinard', 'Poivrons', 'Gyoza Poulet', 'Gyoza Légume',
      'Bao', 'Açaï', 'Pastèques', 'Melon', 'Ananas', 'Tiramisu Oreo',
      'Tiramisu Jap', 'Brookie', 'Cœur coulant', 'Pudding chia', 'Nachos',
    ];

    const sansPictogramme = catalogue.filter(
      (name) => pictogrammeProduit(name) === pictogrammeProduit('Chose inconnue'),
    );
    expect(sansPictogramme).toEqual([]);
  });
});
