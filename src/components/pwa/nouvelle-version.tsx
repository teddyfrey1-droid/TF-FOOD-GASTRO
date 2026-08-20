'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BUILD_ID } from './service-worker-registrar';

/** Toutes les vingt minutes suffisent : on ne publie pas dix fois par jour. */
const INTERVALLE_MS = 20 * 60 * 1000;

/**
 * Propose de passer à la dernière version publiée.
 *
 * Une application ajoutée à l'écran d'accueil ne recharge jamais sa page :
 * on la rouvre depuis le sélecteur, elle reprend là où elle était. Elle peut
 * donc rester des jours sur une version périmée alors que le même site,
 * ouvert dans Safari, affiche déjà la nouvelle — c'est exactement ce qu'on
 * observait.
 *
 * Le remède ne peut pas être automatique : recharger tout seul effacerait un
 * comptage en cours de saisie. On prévient, et c'est la personne qui décide
 * du moment.
 */
export function NouvelleVersion() {
  const [disponible, setDisponible] = useState(false);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    if (BUILD_ID === 'inconnu') return;
    let annule = false;

    const verifier = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const reponse = await fetch('/api/version', { cache: 'no-store' });
        if (!reponse.ok) return;
        const { build } = (await reponse.json()) as { build?: string };
        // Une panne réseau renvoie l'ancienne réponse ou rien : on ne
        // signale une version qu'en présence d'une réponse exploitable.
        if (!annule && typeof build === 'string' && build !== 'inconnu' && build !== BUILD_ID) {
          setDisponible(true);
        }
      } catch {
        // Hors ligne : rien à annoncer, on réessaiera au prochain réveil.
      }
    };

    void verifier();
    const minuteur = setInterval(() => void verifier(), INTERVALLE_MS);
    const auReveil = () => void verifier();
    document.addEventListener('visibilitychange', auReveil);

    return () => {
      annule = true;
      clearInterval(minuteur);
      document.removeEventListener('visibilitychange', auReveil);
    };
  }, []);

  const mettreAJour = useCallback(async () => {
    setEnCours(true);
    try {
      // Les caches d'abord : sans cela, le rechargement reservirait les
      // mêmes fichiers et la version ne bougerait pas d'un pouce.
      if ('caches' in window) {
        const clefs = await caches.keys();
        await Promise.all(clefs.map((clef) => caches.delete(clef)));
      }
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update().catch(() => {});
    } catch {
      // Peu importe la raison : le rechargement ci-dessous reste la
      // meilleure chance d'obtenir la nouvelle version.
    }
    window.location.reload();
  }, []);

  if (!disponible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-5">
      <button
        type="button"
        onClick={() => void mettreAJour()}
        disabled={enCours}
        className="bg-foreground text-background pointer-events-auto flex h-12 items-center gap-2.5 rounded-full px-5 text-sm font-black shadow-lg transition-opacity active:opacity-80 disabled:opacity-60"
      >
        <RefreshCw className={enCours ? 'size-4 animate-spin' : 'size-4'} strokeWidth={2.8} />
        {enCours ? 'Mise à jour…' : 'Nouvelle version — appuyer pour l’installer'}
      </button>
    </div>
  );
}
