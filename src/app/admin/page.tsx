import { requireManager } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const user = await requireManager();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Back-office</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Connecté en tant que {user.fullName} ({user.role === 'owner' ? 'propriétaire' : 'directeur'}
        ).
      </p>

      <p className="mt-8 rounded-lg border border-dashed p-6 text-sm">
        Le pilotage du CA, le calculateur avec simulateur, la gestion des produits et les imports
        CSV arrivent en phase 1.
      </p>
    </main>
  );
}
