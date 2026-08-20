import { requireManager } from '@/lib/auth';
import { getFamilySettings } from '@/lib/admin/queries';
import { TargetSimulator } from '@/components/admin/target-simulator';

export const dynamic = 'force-dynamic';

export default async function SimulatorPage() {
  await requireManager();
  const families = await getFamilySettings();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">Simulateur</h1>
        <p className="text-muted-foreground mt-1.5 text-sm font-medium">
          Un chiffre d&apos;affaires en haut, les cibles en dessous. Saisissez un stock sous un
          produit pour voir la relance qui en découlerait. Rien n&apos;est enregistré.
        </p>
      </header>

      <TargetSimulator
        families={families.map((family) => ({
          family: family.family,
          label: family.label,
          referenceRevenue: Number(family.reference_revenue),
          targetMultiplier: Number(family.target_multiplier),
        }))}
      />
    </div>
  );
}
