/**
 * Vignette d'un produit.
 *
 * L'écran de comptage fait défiler trente-neuf lignes. Reconnaître
 * « Chou japonais » à sa vignette est plus rapide que le lire — c'est tout
 * l'intérêt des pastilles illustrées de Foodflow.
 *
 * Tant qu'aucune photo n'est renseignée sur la fiche produit, on retombe
 * sur un pictogramme choisi d'après le NOM. Aucune photo à héberger, aucun
 * chargement réseau, et le produit reste identifiable dès le premier jour.
 */

/** Retire accents, casse et ponctuation pour comparer des noms de produits. */
function normalise(name: string): string {
  return (
    name
      .toLowerCase()
      // `NFD` ne décompose PAS les ligatures : sans cette ligne, « Cœur
      // coulant » devient « c ur coulant » et ne correspond plus à rien.
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  );
}

/**
 * Association mot-clé -> pictogramme, du plus spécifique au plus général.
 *
 * L'ordre COMPTE : « chou rouge » doit être testé avant « chou », et
 * « creamy thon » avant « thon », sinon la sauce prendrait l'icône du
 * poisson.
 */
const PICTOGRAMMES: ReadonlyArray<readonly [string, string]> = [
  // Les plus, EN PREMIER : « Gyoza Poulet » contient « poulet » et prendrait
  // sinon l'icône de la protéine.
  ['gyoza', '🥟'],
  ['bao', '🥟'],
  ['nachos', '🌮'],

  // Sauces et préparations, avant leur ingrédient principal.
  ['creamy citron', '🍋'],
  ['creamy thon', '🥣'],
  ['guacamole', '🥑'],
  ['coleslaw', '🥗'],
  ['poulet mayo', '🍗'],
  ['poulet crispy', '🍗'],
  ['proteine vegetale', '🌱'],
  ['effiloche de porc', '🐖'],

  // Protéines.
  ['saumon', '🍣'],
  ['thon', '🐟'],
  ['crevette', '🍤'],
  ['poulet', '🍗'],

  // Ingrédients.
  ['edamame', '🫛'],
  ['concombre', '🥒'],
  ['avocat', '🥑'],
  ['carotte', '🥕'],
  ['mangue', '🥭'],
  ['feta', '🧀'],
  ['quinoa', '🌾'],
  ['pasteque', '🍉'],
  ['chou rouge', '🥬'],
  ['chou blanc', '🥬'],
  ['chou japonais', '🥬'],
  ['chou', '🥬'],
  ['epinard', '🥬'],
  ['poivron', '🫑'],

  // Desserts.
  ['acai', '🫐'],
  ['pudding chia', '🍮'],
  ['tiramisu', '🍰'],
  ['brookie', '🍪'],
  ['coeur coulant', '🍫'],
  ['melon', '🍈'],
  ['ananas', '🍍'],
];

/** Repli par catégorie, quand le nom ne dit rien de reconnaissable. */
const PAR_CATEGORIE: Record<string, string> = {
  Protéines: '🍽️',
  Ingrédients: '🧺',
  'Les plus': '🍽️',
  Desserts: '🍨',
};

export function pictogrammeProduit(name: string, categoryName?: string | null): string {
  const cible = normalise(name);
  for (const [motCle, pictogramme] of PICTOGRAMMES) {
    if (cible.includes(motCle)) return pictogramme;
  }
  // Repli neutre : jamais un pictogramme déjà attribué à un produit, sinon
  // deux lignes voisines deviendraient indiscernables.
  return (categoryName && PAR_CATEGORIE[categoryName]) || '🍽️';
}

/** Pictogramme d'une catégorie, pour les pastilles de filtre. */
export function pictogrammeCategorie(name: string): string {
  return PAR_CATEGORIE[name] ?? '🍽️';
}
