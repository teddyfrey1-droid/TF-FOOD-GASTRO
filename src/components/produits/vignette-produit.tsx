import { pictogrammeProduit } from '@/lib/produits/vignette';
import { cn } from '@/lib/utils';

/**
 * La pastille verte qui précède chaque produit.
 *
 * Une vraie photo si la fiche produit en porte une ; sinon le pictogramme
 * déduit du nom. Dans les deux cas la pastille a la même taille et le même
 * fond, pour que la liste garde son alignement.
 */
export function VignetteProduit({
  name,
  categoryName,
  imageUrl,
  className,
  taille = 'md',
}: {
  name: string;
  categoryName?: string | null;
  imageUrl?: string | null;
  className?: string;
  taille?: 'sm' | 'md';
}) {
  const tailles = {
    sm: 'size-11 rounded-xl text-xl',
    md: 'size-14 rounded-2xl text-2xl',
  } as const;

  return (
    <span
      aria-hidden
      className={cn(
        'bg-primary/10 flex shrink-0 items-center justify-center overflow-hidden leading-none',
        tailles[taille],
        className,
      )}
    >
      {imageUrl ? (
        // Photo fournie par le back-office : `img` plutôt que `next/image`,
        // l'URL est libre et n'a pas à être déclarée dans la configuration.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        pictogrammeProduit(name, categoryName)
      )}
    </span>
  );
}
