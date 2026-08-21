import { requireUser, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth';
import { isManagerRole, isStaffLeadRole } from '@/lib/roles';
import { Bell, KeyRound, Smartphone, Users } from 'lucide-react';
import { PasswordForm } from './password-form';
import { SignOutButton } from '@/components/pwa/sign-out-button';
import { NotificationToggle } from '@/components/pwa/notification-toggle';
import { BottomTabs } from '@/components/bottom-tabs';
import { LienRetour } from '@/components/lien-retour';
import { GroupeMenu, RangeeMenu } from '@/components/rangee-menu';
import { Card } from '@/components/ui/card';
import { CarteVersion } from '@/components/pwa/carte-version';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Mon compte — Lafayette' };

export default async function AccountPage() {
  const user = await requireUser();
  const prenom = user.fullName.trim().split(/\s+/)[0] || user.fullName;

  return (
    <>
      <main className="pt-safe-header mx-auto w-full max-w-md px-5 pt-4 pb-28">
        <LienRetour className="mb-2" />

        {/* L'identité en tête, comme sur les écrans de compte que l'équipe
            connaît déjà : gros rond à initiale, nom, statut. */}
        <header className="mb-7 flex items-center gap-4">
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-black shadow-sm"
          >
            {prenom.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl leading-tight font-black tracking-tight">
              {user.fullName}
            </h1>
            <p className="text-muted-foreground mt-0.5 truncate text-sm font-semibold">
              {user.email}
            </p>
          </div>
        </header>

        <div className="space-y-6">
          <Card className="rounded-3xl p-5">
            <p className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
              Statut
            </p>
            <p className="mt-1 text-2xl font-black">{ROLE_LABELS[user.role]}</p>
            <p className="text-muted-foreground mt-1 text-sm font-medium">
              {ROLE_DESCRIPTIONS[user.role]}
            </p>
          </Card>

          <GroupeMenu titre="Sur ce téléphone">
            <RangeeMenu
              href="/installer"
              icone={<Smartphone className="size-5" strokeWidth={2.2} />}
              titre="Installer l'application"
              detail="L'ajouter à l'écran d'accueil"
            />
            <div className="px-3 py-2.5">
              <span className="flex items-center gap-3.5">
                <span
                  aria-hidden
                  className="bg-muted text-foreground/70 flex size-11 shrink-0 items-center justify-center rounded-xl"
                >
                  <Bell className="size-5" strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                  <NotificationToggle />
                </span>
              </span>
            </div>
          </GroupeMenu>

          {isStaffLeadRole(user.role) ? (
            <GroupeMenu titre="L'équipe">
              {isManagerRole(user.role) ? (
                <RangeeMenu
                  href="/admin/utilisateurs"
                  icone={<Users className="size-5" strokeWidth={2.2} />}
                  titre="Gérer l'équipe"
                  detail="Comptes, statuts, activation"
                />
              ) : null}
              <RangeeMenu
                href="/admin/historique"
                icone={<KeyRound className="size-5" strokeWidth={2.2} />}
                titre="Historique des comptages"
                detail="Qui a compté quoi, et quand"
              />
            </GroupeMenu>
          ) : null}

          <GroupeMenu titre="Sécurité">
            <div className="px-3 py-3">
              <h2 className="mb-3 text-[17px] font-bold">Changer mon mot de passe</h2>
              <PasswordForm />
            </div>
          </GroupeMenu>

          <div className="pt-2">
            <SignOutButton />
          </div>

          <CarteVersion />
        </div>
      </main>

      <BottomTabs isStaffLead={isStaffLeadRole(user.role)} isManager={isManagerRole(user.role)} />
    </>
  );
}
