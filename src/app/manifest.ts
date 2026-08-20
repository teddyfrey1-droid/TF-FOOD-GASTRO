import type { MetadataRoute } from 'next';

/**
 * Manifeste de l'application installable.
 *
 * `display: standalone` retire la barre d'adresse : une fois ajoutée à
 * l'écran d'accueil, l'application se comporte comme n'importe quelle autre.
 * `orientation: portrait` parce qu'on compte le téléphone à la verticale,
 * d'une seule main.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lafayette — Mise en place',
    short_name: 'Lafayette',
    description:
      'Comptage des stocks et relance de production — Poké Bowl Lafayette.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#2f7d55',
    theme_color: '#2f7d55',
    categories: ['business', 'productivity', 'food'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Comptage du matin',
        short_name: 'Matin',
        url: '/comptage/matin',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: "Comptage de l'après-midi",
        short_name: 'Après-midi',
        url: '/comptage/apres-midi',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
