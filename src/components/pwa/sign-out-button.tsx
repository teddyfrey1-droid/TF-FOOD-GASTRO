'use client';

import { useTransition } from 'react';
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
      className={cn(className)}
      onClick={() =>
        startTransition(async () => {
          await clearServiceWorkerCache();
          await signOut();
        })
      }
    >
      {pending ? 'Déconnexion…' : 'Se déconnecter'}
    </Button>
  );
}
