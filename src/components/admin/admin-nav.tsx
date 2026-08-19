'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/admin', label: 'Tableau de bord', exact: true },
  { href: '/admin/produits', label: 'Produits' },
  { href: '/admin/simulateur', label: 'Simulateur' },
  { href: '/admin/chiffre-affaires', label: "Chiffre d'affaires" },
  { href: '/admin/historique', label: 'Historique' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mx-auto w-full max-w-6xl overflow-x-auto px-5">
      <ul className="flex gap-1 pb-1">
        {LINKS.map((link) => {
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
