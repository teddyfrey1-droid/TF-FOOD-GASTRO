import { aLeDroit, requireStaffLead } from '@/lib/auth';
import { isStaffLeadRole, ROLE_LABELS } from '@/lib/roles';
import { AvatarCompte } from '@/components/avatar-compte';
import { AdminNav } from '@/components/admin/admin-nav';
import { BottomTabs } from '@/components/bottom-tabs';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // L'entrée du back-office s'ouvre à l'encadrement — assistant manager
  // compris. Chaque page sensible pose ensuite sa propre garde : la
  // barrière du chiffre d'affaires reste `requireManager`, ici et en base.
  const user = await requireStaffLead();
  // L'onglet Simulateur suit le droit, plus le seul statut : le
  // directeur peut désormais l'ouvrir à un assistant manager.
  const simulateur = await aLeDroit('simulateur');

  return (
    <div className="min-h-dvh">
      <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
        <div className="pt-safe-header mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <span className="text-lg font-black tracking-tight">Gestion</span>

          <div className="flex items-center gap-3">
            <span className="text-muted-foreground hidden text-sm font-semibold sm:inline">
              {ROLE_LABELS[user.role]}
            </span>
            <AvatarCompte nom={user.fullName} />
          </div>
        </div>

        <AdminNav role={user.role} />
      </header>

      {/* La marge basse dégage la barre d'onglets : sans elle, le dernier
          bloc de chaque écran passe dessous. */}
      <main className="mx-auto w-full max-w-6xl px-5 pt-8 pb-28">{children}</main>

      {/* Un onglet du bas doit rester visible une fois arrivé, sinon c'est
          une porte à sens unique : on entre dans Gestion et la barre
          disparaît. */}
      <BottomTabs isStaffLead={isStaffLeadRole(user.role)} isManager={simulateur} />
    </div>
  );
}
