'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isManagerRole } from '@/lib/roles';
import type { UserRole } from '@/lib/supabase/database.types';

/**
 * `managerOnly` marque les écrans qui touchent au chiffre d'affaires, aux
 * cibles ou aux comptes. Un assistant manager ne les voit pas — et s'il
 * forçait l'adresse, la page le renverrait, puis la base refuserait.
 */
const LINKS: { href: string; label: string; exact?: boolean; managerOnly?: boolean }[] = [
  { href: '/admin', label: 'Tableau de bord', exact: true, managerOnly: true },
  { href: '/admin/produits', label: 'Produits', managerOnly: true },
  { href: '/admin/categories', label: 'Catégories', managerOnly: true },
  { href: '/admin/photos', label: 'Photos', managerOnly: true },
  { href: '/admin/simulateur', label: 'Simulateur', managerOnly: true },
  { href: '/admin/chiffre-affaires', label: "Chiffre d'affaires", managerOnly: true },
  { href: '/admin/ruptures', label: 'Ruptures', managerOnly: true },
  { href: '/admin/historique', label: 'Historique' },
  { href: '/admin/utilisateurs', label: 'Équipe', managerOnly: true },
  { href: '/compte', label: 'Mon compte' },
];

export function AdminNav({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const canSeeAll = isManagerRole(role);
  const links = LINKS.filter((link) => canSeeAll || !link.managerOnly);

  return (
    <nav className="mx-auto w-full max-w-6xl overflow-x-auto px-5">
      <ul className="flex gap-1 pb-1">
        {links.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  'inline-block rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
