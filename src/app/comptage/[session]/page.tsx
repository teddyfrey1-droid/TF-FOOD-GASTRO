import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { buttonVariants } from '@/components/ui/button';
import type { SessionKind } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

/** Le segment d'URL est en français ; la base, elle, parle `morning` / `afternoon`. */
const SESSION_SLUGS: Record<string, { kind: SessionKind; title: string }> = {
  matin: { kind: 'morning', title: 'Comptage du matin' },
  'apres-midi': { kind: 'afternoon', title: "Comptage de l'après-midi" },
};

export default async function CountPage({ params }: { params: Promise<{ session: string }> }) {
  await requireUser();
  const { session } = await params;
  const config = SESSION_SLUGS[session];
  if (!config) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <h1 className="text-2xl font-bold tracking-tight">{config.title}</h1>

      <p className="mt-8 rounded-lg border border-dashed p-6 text-sm">
        L&apos;écran de comptage (steppers saladbar / frigo, recherche, sauvegarde automatique et
        rapport de relance) arrive en phase 2.
      </p>

      <Link href="/" className={buttonVariants({ variant: 'outline', className: 'mt-6 h-11 w-full' })}>
        Retour
      </Link>
    </main>
  );
}
