import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireManager } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/roles';
import { SignOutButton } from '@/components/pwa/sign-out-button';
import { AdminNav } from '@/components/admin/admin-nav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireManager();

  return (
    <div className="min-h-dvh">
      <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="pt-safe-header mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          {/*
            La sortie du back-office, à gauche, toujours au même endroit.
            Sans elle, on entrait dans la gestion sans savoir comment revenir
            à l'écran de comptage autrement qu'en retapant l'adresse.
          */}
          <Link
            href="/"
            className="hover:bg-muted -ml-2 flex items-center gap-2 rounded-full py-2 pr-4 pl-2 font-bold transition-colors"
          >
            <ArrowLeft className="size-5" strokeWidth={2.5} />
            <span>Menu principal</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {user.fullName} · {ROLE_LABELS[user.role].toLowerCase()}
            </span>
            <SignOutButton />
          </div>
        </div>

        <AdminNav />
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
