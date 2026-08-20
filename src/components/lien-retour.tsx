import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Le chemin du retour, toujours au même endroit.
 *
 * Une application ajoutée à l'écran d'accueil n'a NI barre d'adresse NI
 * bouton « précédent » : entrer dans un écran sans lien de sortie visible,
 * c'est s'y retrouver enfermé.
 */
export function LienRetour({
  href = '/',
  label = 'Menu principal',
  className,
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'text-muted-foreground hover:text-foreground hover:bg-muted -ml-2 inline-flex h-11 items-center gap-1.5 rounded-full pr-4 pl-2 text-sm font-bold transition-colors',
        className,
      )}
    >
      <ArrowLeft className="size-4" strokeWidth={2.5} />
      {label}
    </Link>
  );
}
