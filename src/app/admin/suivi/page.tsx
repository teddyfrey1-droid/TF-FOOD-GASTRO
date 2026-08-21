import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { SuiviPersonne, type LignePersonne } from '@/components/admin/suivi-personne';
import { LienRetour } from '@/components/lien-retour';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Suivi de connexion — Lafayette' };

export default async function SuiviPage() {
  const user = await requireUser();

  // Le statut est vérifié ici ET en base : les deux fonctions appelées
  // refusent tout le monde sauf le propriétaire. Cette redirection sert
  // seulement à ne pas afficher un écran vide au directeur.
  if (user.role !== 'owner') redirect('/admin');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mep_suivi_equipe');

  const personnes: LignePersonne[] = (data ?? []).map((ligne) => ({
    userId: ligne.user_id,
    fullName: ligne.full_name,
    email: ligne.email,
    role: ligne.role,
    isActive: ligne.is_active,
    derniereConnexion: ligne.derniere_connexion,
    derniereActivite: ligne.derniere_activite,
    vues7j: ligne.vues_7j,
    actions7j: ligne.actions_7j,
    comptages30j: ligne.comptages_30j,
    modifications30j: ligne.modifications_30j,
  }));

  const jamaisVenus = personnes.filter(
    (personne) => personne.isActive && personne.derniereConnexion === null,
  ).length;

  return (
    <div className="space-y-5">
      <LienRetour className="mb-1" />

      <header>
        <h1 className="text-3xl font-black tracking-tight">Suivi de connexion</h1>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
          Qui se connecte, quand, et ce qui a été fait. Touchez une personne pour dérouler ses
          trente derniers jours.
        </p>
      </header>

      {error ? (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-2xl px-4 py-3 text-sm font-semibold">
          {error.message}
        </p>
      ) : null}

      {jamaisVenus > 0 ? (
        <p className="bg-alert text-alert-foreground border-alert-border rounded-2xl border px-4 py-2.5 text-[13px] font-bold">
          {jamaisVenus} compte{jamaisVenus > 1 ? 's actifs ne se sont' : ' actif ne s’est'} jamais
          connecté.
        </p>
      ) : null}

      <div className="space-y-2.5">
        {personnes.map((personne) => (
          <SuiviPersonne key={personne.userId} personne={personne} />
        ))}
      </div>

      {/* Ce que l'écran voit, et ce qu'il ne voit pas. Écrit ici parce
          qu'un outil de suivi doit pouvoir se relire : on doit savoir ce
          qu'il enregistre sans avoir à ouvrir le code. */}
      <Card className="rounded-2xl p-4">
        <h2 className="text-[13px] font-black">Ce que ce suivi enregistre</h2>
        <ul className="text-muted-foreground mt-1.5 space-y-1 text-[12px] leading-relaxed">
          <li>Les connexions, les écrans ouverts, et les gestes qui changent quelque chose.</li>
          <li>Les comptages validés et les réglages modifiés, avec leur horodatage.</li>
          <li>
            <span className="text-foreground font-bold">Rien d’autre</span> : aucune position,
            aucune adresse IP, rien de ce qui se passe hors de l’application.
          </li>
          <li>
            Les traces sont effacées au bout de{' '}
            <span className="text-foreground font-bold">90 jours</span>, automatiquement.
          </li>
          <li>
            Visible par le propriétaire uniquement — ni le directeur, ni l’assistant manager, ni
            l’intéressé.
          </li>
        </ul>
      </Card>
    </div>
  );
}
