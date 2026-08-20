'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Rattrape un lien d'activation qui n'a pas atterri au bon endroit.
 *
 * Supabase n'honore l'adresse de retour demandée que si elle figure dans sa
 * liste d'adresses autorisées — un réglage du tableau de bord. Sinon il
 * renvoie sur l'adresse principale du site, avec le jeton dans le fragment.
 * La personne se retrouve alors connectée sur l'accueil, sans jamais avoir
 * choisi son mot de passe, et sans comprendre pourquoi.
 *
 * Ce composant regarde le fragment sur n'importe quelle page et emmène au
 * bon écran quand il reconnaît un lien de récupération.
 */
export function RattrapageLienActivation() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === '/definir-mot-de-passe') return;

    const fragment = window.location.hash;
    if (!fragment.includes('type=recovery')) return;

    // Le fragment est conservé : c'est lui qui porte le jeton, et la page
    // de destination en a besoin pour ouvrir la session.
    router.replace(`/definir-mot-de-passe${fragment}`);
  }, [pathname, router]);

  return null;
}
