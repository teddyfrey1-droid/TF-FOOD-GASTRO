'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, Home, Settings2, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Barre d'onglets en bas, jamais de menu hamburger : sur iPhone, le pouce
 * atteint le bas de l'écran, pas le coin haut-gauche.
 */
export function BottomTabs({ isManager }: { isManager: boolean }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/', label: 'Accueil', icon: Home, match: (p: string) => p === '/' },
    {
      href: '/comptage/matin',
      label: 'Comptage',
      icon: ClipboardList,
      match: (p: string) => p.startsWith('/comptage'),
    },
    {
      href: '/compte',
      label: 'Mon compte',
      icon: UserRound,
      match: (p: string) => p.startsWith('/compte'),
    },
    ...(isManager
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
                  'no-select flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.5 : 2} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
