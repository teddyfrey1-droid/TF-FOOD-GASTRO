'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { BUILD_ID } from './service-worker-registrar';

/** Une minute : assez court pour que la nouveauté arrive « tout de suite ». */
const INTERVALLE_MS = 60 * 1000;

/** Empêche une boucle de rechargement si un serveur répond encore l'ancienne version. */
const CLEF_TENTATIVE = 'mep:maj-tentee';

/**
 * Installe la dernière version publiée, d'elle-même.
 *
 * Une application ajoutée à l'écran d'accueil ne recharge jamais sa page :
 * on la rouvre depuis le sélecteur et elle reprend où elle était. Elle
 * pouvait donc rester des jours sur une version périmée alors que le même
 * site, ouvert dans Safari, affichait déjà la nouvelle.
 *
 * Elle se met désormais à jour seule, sans déconnexion ni fermeture : la
 * session vit dans un cookie que le rechargement conserve, et chaque saisie
 * de comptage est déjà écrite dans IndexedDB avant d'être envoyée. Un
 * rechargement ne coûte donc qu'une position de défilement.
 *
 * Une seule exception : l'écran de comptage. Recharger sous les doigts de
 * quelqu'un qui compte, c'est lui faire perdre le fil du rayon — là, on
 * propose, et c'est lui qui choisit le moment.
 */
export function NouvelleVersion() {
  const chemin = usePathname();
  const [disponible, setDisponible] = useState(false);
  const [enCours, setEnCours] = useState(false);

  // Le comptage est le seul écran où une interruption coûte quelque chose.
  const comptageEnCours = /^\/comptage\/[^/]+/.test(chemin ?? '');

  const appliquer = useCallback(async () => {
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
      // Peu importe la raison : le rechargement reste la meilleure chance
      // d'obtenir la nouvelle version.
    }
    window.location.reload();
  }, []);

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
        if (annule || typeof build !== 'string' || build === 'inconnu' || build === BUILD_ID) {
          return;
        }

        if (comptageEnCours) {
          setDisponible(true);
          return;
        }

        // Si un rechargement a déjà eu lieu pour cette version-là sans que
        // rien ne change, c'est que le serveur n'est pas d'accord avec
        // lui-même. On s'arrête et on laisse le bouton décider.
        let dejaTentee = false;
        try {
          dejaTentee = sessionStorage.getItem(CLEF_TENTATIVE) === build;
          sessionStorage.setItem(CLEF_TENTATIVE, build);
        } catch {
          // Navigation privée : on retombe sur la proposition manuelle.
          dejaTentee = true;
        }

        if (dejaTentee) setDisponible(true);
        else void appliquer();
      } catch {
        // Hors ligne : rien à annoncer, on réessaiera au prochain réveil.
      }
    };

    void verifier();
    const minuteur = setInterval(() => void verifier(), INTERVALLE_MS);
    const auReveil = () => void verifier();

    // `visibilitychange` couvre le retour depuis le sélecteur d'applications,
    // `focus` le retour depuis un autre onglet : les deux façons de revenir.
    document.addEventListener('visibilitychange', auReveil);
    window.addEventListener('focus', auReveil);

    return () => {
      annule = true;
      clearInterval(minuteur);
      document.removeEventListener('visibilitychange', auReveil);
      window.removeEventListener('focus', auReveil);
    };
  }, [comptageEnCours, appliquer]);

  if (!disponible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-5">
      <button
        type="button"
        onClick={() => void appliquer()}
        disabled={enCours}
        className="bg-foreground text-background pointer-events-auto flex h-12 items-center gap-2.5 rounded-full px-5 text-sm font-black shadow-lg transition-opacity active:opacity-80 disabled:opacity-60"
      >
        <RefreshCw className={enCours ? 'size-4 animate-spin' : 'size-4'} strokeWidth={2.8} />
        {enCours ? 'Mise à jour…' : 'Nouvelle version — appuyer pour l’installer'}
      </button>
    </div>
  );
}
