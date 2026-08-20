import { requireUser } from '@/lib/auth';
import { GuideInstallation } from '@/components/admin/guide-installation';
import { LienRetour } from '@/components/lien-retour';

export const dynamic = 'force-dynamic';

export const metadata = { title: "Installer l'application — Lafayette" };

export default async function InstallerPage() {
  // Accessible à TOUTE l'équipe : ce sont les employés qui installent
  // l'application sur leur propre téléphone, pas le directeur à leur place.
  await requireUser();

  // L'adresse à recopier dans Safari. Elle vient de la configuration, pas
  // d'une chaîne écrite en dur qui deviendrait fausse au premier changement
  // de domaine.
  const adresse =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'https://tf-food-gastro.vercel.app');

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-5 py-8">
      <LienRetour className="mb-2" />

      <header>
        <h1 className="text-3xl font-black tracking-tight">Installer l&apos;application</h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Sur le téléphone de chaque employé. Les étapes ci-dessous s&apos;adaptent à
          l&apos;appareil depuis lequel vous lisez cette page.
        </p>
      </header>

      <GuideInstallation adresse={adresse} />
    </div>
  );
}
