import Link from 'next/link';
import { requireUser, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth';
import { PasswordForm } from './password-form';
import { SignOutButton } from '@/components/pwa/sign-out-button';
import { NotificationToggle } from '@/components/pwa/notification-toggle';
import { BottomTabs } from '@/components/bottom-tabs';
import { isManagerRole } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { LienRetour } from '@/components/lien-retour';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mon compte — Heiko' };

export default async function AccountPage() {
  const user = await requireUser();

  return (
    <>
      <main className="mx-auto w-full max-w-md px-5 pt-8 pb-28">
        <header className="mb-7">
          <LienRetour className="mb-2" />
          <h1 className="text-3xl font-black tracking-tight">Mon compte</h1>
          <p className="text-muted-foreground mt-1.5 text-sm">{user.email}</p>
        </header>

        <Card className="mb-4 rounded-3xl p-5">
          <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Statut
          </p>
          <p className="mt-1 text-xl font-black">{ROLE_LABELS[user.role]}</p>
          <p className="text-muted-foreground mt-1 text-sm">{ROLE_DESCRIPTIONS[user.role]}</p>
        </Card>

        <Card className="rounded-3xl p-5">
          <h2 className="mb-4 text-lg font-black">Changer mon mot de passe</h2>
          <PasswordForm />
        </Card>

        <div className="mt-4 space-y-3">
          {/* Les rappels ne fonctionnent sur iPhone QUE depuis l'écran
              d'accueil : le lien d'installation se place donc juste
              au-dessus de l'interrupteur qui en dépend. */}
          <Link
            href="/installer"
            className={buttonVariants({
              variant: 'outline',
              className: 'h-12 w-full rounded-2xl font-bold',
            })}
          >
            📲 Installer sur mon téléphone
          </Link>
          <NotificationToggle />
          {isManagerRole(user.role) ? (
            <Link
              href="/admin/utilisateurs"
              className={buttonVariants({
                variant: 'outline',
                className: 'h-12 w-full rounded-2xl font-bold',
              })}
            >
              Gérer l&apos;équipe
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      </main>

      <BottomTabs isManager={isManagerRole(user.role)} />
    </>
  );
}
