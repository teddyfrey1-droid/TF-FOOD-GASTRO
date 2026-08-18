import Link from 'next/link';
import { requireManager } from '@/lib/auth';
import { signOut } from '@/app/connexion/actions';
import { AdminNav } from '@/components/admin/admin-nav';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireManager();

  return (
    <div className="min-h-dvh">
      <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/admin" className="text-lg font-bold tracking-tight">
            MEP <span className="text-muted-foreground font-normal">back-office</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {user.fullName} · {user.role === 'owner' ? 'propriétaire' : 'directeur'}
            </span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Déconnexion
              </Button>
            </form>
          </div>
        </div>

        <AdminNav />
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
