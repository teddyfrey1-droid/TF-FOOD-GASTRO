'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, Home, Refrigerator, Settings2, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Barre d'onglets en bas, jamais de menu hamburger : sur iPhone, le pouce
 * atteint le bas de l'écran, pas le coin haut-gauche.
 *
 * « Mon compte » n'y figure plus : il vit dans l'avatar en haut à droite,
 * comme partout ailleurs.
 *
 * Chacun ne voit que ce qu'il peut ouvrir. Le simulateur affiche les
 * cibles de production, que la base réserve au directeur et au
 * propriétaire : le proposer à un assistant manager n'ouvrirait qu'un
 * refus. Un onglet qui échoue vaut moins qu'un onglet absent.
 */
export function BottomTabs({
  isStaffLead,
  isManager = false,
}: {
  isStaffLead: boolean;
  isManager?: boolean;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: '/', label: 'Accueil', icon: Home, match: (p: string) => p === '/' },
    {
      href: '/comptage',
      label: 'Comptage',
      icon: ClipboardList,
      match: (p: string) => p.startsWith('/comptage'),
    },
    {
      href: '/stocks',
      label: 'Stocks',
      icon: Refrigerator,
      match: (p: string) => p.startsWith('/stocks'),
    },
    ...(isManager
      ? [
          {
            href: '/admin/simulateur',
            label: 'Simulateur',
            icon: SlidersHorizontal,
            match: (p: string) => p.startsWith('/admin/simulateur'),
          },
        ]
      : []),
    ...(isStaffLead
      ? [
          {
            href: '/admin',
            label: 'Gestion',
            icon: Settings2,
            // Le simulateur vit sous `/admin` : sans cette exclusion, les
            // deux onglets s'allumeraient en même temps.
            match: (p: string) => p.startsWith('/admin') && !p.startsWith('/admin/simulateur'),
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
                  'no-select flex h-16 flex-col items-center justify-center gap-1 px-0.5 text-[10px] font-bold transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.6 : 2} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
