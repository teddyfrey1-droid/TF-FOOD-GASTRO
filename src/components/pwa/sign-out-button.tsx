'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/connexion/actions';
import { clearServiceWorkerCache } from './service-worker-registrar';

/**
 * Déconnexion.
 *
 * Le service worker garde en cache les pages déjà visitées pour le mode hors
 * ligne. On les purge avant de partir : le téléphone est parfois partagé, et
 * une page de comptage ne doit pas rester consultable après déconnexion.
 */
export function SignOutButton({
  className,
  variant = 'ghost',
}: {
  className?: string;
  variant?: 'ghost' | 'outline';
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={variant}
      disabled={pending}
      // Pastille pleine largeur, en rouge doux : bien visible sans crier.
      // Une déconnexion doit se trouver sans chercher, et ne jamais se
      // déclencher par mégarde en visant autre chose.
      className={cn(
        'text-destructive hover:bg-destructive/10 hover:text-destructive h-12 w-full rounded-full text-sm font-black',
        className,
      )}
      onClick={() =>
        startTransition(async () => {
          await clearServiceWorkerCache();
          await signOut();
        })
      }
    >
      <LogOut className="size-4" strokeWidth={2.6} />
      {pending ? 'Déconnexion…' : 'Se déconnecter'}
    </Button>
  );
}
