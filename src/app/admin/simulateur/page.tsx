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
        <h1 className="text-2xl font-black tracking-tight">Simulateur</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Saisissez un chiffre d&apos;affaires : vous voyez immédiatement la cible et le minimum de
          chaque produit. Saisissez ensuite un stock fictif pour voir la relance qui en découlerait.
          Rien n&apos;est enregistré.
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
