'use client';

import { useEffect } from 'react';

/** La version embarquée dans le code chargé par ce téléphone. */
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'inconnu';

/**
 * Enregistre le service worker au chargement.
 *
 * Placé dans le layout racine plutôt que dans une page : l'employé doit être
 * couvert dès sa première visite, avant même d'ouvrir un comptage.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // On lui dit quelle version on vient de charger. S'il en gardait une
        // autre en cache, il la jette : sans cela, les pages mémorisées
        // renverraient éternellement vers l'ancienne publication.
        const annoncer = () =>
          navigator.serviceWorker.controller?.postMessage({
            type: 'mep:version',
            build: BUILD_ID,
          });

        annoncer();
        navigator.serviceWorker.addEventListener('controllerchange', annoncer);

        // Une application installée est reprise depuis le sélecteur, sans
        // recharger la page : ce réveil est le bon moment pour aller voir
        // s'il existe une version plus récente du worker lui-même.
        const auReveil = () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        };
        document.addEventListener('visibilitychange', auReveil);
      } catch {
        // Un échec d'enregistrement ne doit jamais empêcher de compter :
        // l'application reste utilisable, simplement sans mode hors ligne.
      }
    };

    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });
  }, []);

  return null;
}

/** Vide les caches du service worker — appelé à la déconnexion. */
export async function clearServiceWorkerCache(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage('mep:clear-cache');
}
