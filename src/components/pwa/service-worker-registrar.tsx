'use client';

import { useEffect } from 'react';

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

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Un échec d'enregistrement ne doit jamais empêcher de compter :
        // l'application reste utilisable, simplement sans mode hors ligne.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}

/** Vide les caches du service worker — appelé à la déconnexion. */
export async function clearServiceWorkerCache(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage('mep:clear-cache');
}
