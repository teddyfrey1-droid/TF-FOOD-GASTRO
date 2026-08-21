'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { journaliser } from '@/app/journal';

/**
 * Note l'écran ouvert, à chaque changement de page.
 *
 * Deux précautions pour ne pas noyer le journal :
 *
 *   • un même chemin consécutif n'est pas réécrit — revenir en arrière
 *     puis en avant produirait trois lignes pour un seul geste ;
 *   • les identifiants sont remplacés par un jeton (`/comptage/[…]`),
 *     sinon trente lignes différentes diraient la même chose.
 *
 * Le suivi ne connaît que ce qui se passe DANS l'application : aucune
 * position, aucune adresse IP, rien de ce qui se passe ailleurs.
 */
export function TraceurNavigation() {
  const chemin = usePathname();
  const dernier = useRef<string | null>(null);

  useEffect(() => {
    if (!chemin || chemin === dernier.current) return;
    dernier.current = chemin;

    // Les UUID et les dates rendraient chaque visite unique.
    const generique = chemin
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '…')
      .replace(/\d{4}-\d{2}-\d{2}/g, '…');

    void journaliser('vue', generique);
  }, [chemin]);

  return null;
}
