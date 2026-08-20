'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { isManagerRole } from '@/lib/roles';
import type { UserRole } from '@/lib/supabase/database.types';

/**
 * Le titre de l'écran courant, et le chemin du retour.
 *
 * L'ancienne barre alignait dix onglets qui débordaient de l'écran : sur un
 * téléphone, il fallait la faire défiler pour découvrir ce qu'elle
 * contenait, et rien n'indiquait où l'on se trouvait. Le menu Gestion est
 * désormais un vrai sommaire ; cette barre ne fait plus qu'une chose,
 * ramener en arrière.
 */
const TITRES: { prefixe: string; titre: string }[] = [
  { prefixe: '/admin/produits', titre: 'Produits' },
  { prefixe: '/admin/categories', titre: 'Catégories' },
  { prefixe: '/admin/photos', titre: 'Photos' },
  { prefixe: '/admin/chiffre-affaires', titre: "Chiffre d'affaires" },
  { prefixe: '/admin/ruptures', titre: 'Ruptures' },
  { prefixe: '/admin/historique', titre: 'Historique' },
  { prefixe: '/admin/simulateur', titre: 'Simulateur' },
  { prefixe: '/admin/utilisateurs', titre: 'Équipe' },
];

export function AdminNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const surLeSommaire = pathname === '/admin';

  // Un assistant manager n'a pas de sommaire à lui : son seul écran est
  // l'historique, et son retour le ramène donc à l'accueil.
  const sommaireAccessible = isManagerRole(role);
  const retour = surLeSommaire || !sommaireAccessible ? '/' : '/admin';
  const libelle = surLeSommaire || !sommaireAccessible ? 'Menu principal' : 'Gestion';

  const courant = TITRES.find((entree) => pathname.startsWith(entree.prefixe));

  return (
    <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-5 pb-2">
      <Link
        href={retour}
        className="hover:bg-muted -ml-2 flex h-11 items-center gap-2 rounded-full pr-4 pl-2 font-bold transition-colors"
      >
        <ArrowLeft className="size-5" strokeWidth={2.5} />
        <span>{libelle}</span>
      </Link>

      {courant ? (
        <span className="text-muted-foreground truncate text-sm font-semibold">
          · {courant.titre}
        </span>
      ) : null}
    </div>
  );
}
