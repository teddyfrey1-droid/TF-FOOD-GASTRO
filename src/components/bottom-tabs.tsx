'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, Home, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Barre d'onglets en bas, jamais de menu hamburger : sur iPhone, le pouce
 * atteint le bas de l'écran, pas le coin haut-gauche.
 *
 * « Mon compte » n'y figure plus : il vit dans l'avatar en haut à droite,
 * comme partout ailleurs. Moins d'onglets, donc des cibles plus larges pour
 * les deux qui servent vraiment.
 */
export function BottomTabs({ isStaffLead }: { isStaffLead: boolean }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/', label: 'Accueil', icon: Home, match: (p: string) => p === '/' },
    {
      href: '/comptage',
      label: 'Comptage',
      icon: ClipboardList,
      match: (p: string) => p.startsWith('/comptage'),
    },
    ...(isStaffLead
      ? [
          {
            href: '/admin',
            label: 'Gestion',
            icon: Settings2,
            match: (p: string) => p.startsWith('/admin'),
          },
        ]
      : []),
  ];

  return (
    <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur print:hidden">
      <ul className="pb-safe mx-auto flex w-full max-w-md">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'no-select flex h-16 flex-col items-center justify-center gap-1 text-xs font-bold transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-6" strokeWidth={active ? 2.6 : 2} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
