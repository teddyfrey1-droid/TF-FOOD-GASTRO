import { requireManager, ROLE_LABELS } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TeamManager, type TeamMember } from '@/components/admin/team-manager';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const me = await requireManager();
  const supabase = await createClient();

  // `profiles` ne porte pas les adresses : elles vivent dans `auth.users`,
  // que la RLS n'expose à personne. `mep_equipe()` les recolle côté base,
  // en refusant tout le monde sauf le directeur — c'est cette fonction qui
  // garde le secret, pas cet écran.
  const { data, error } = await supabase.rpc('mep_equipe');

  const members: TeamMember[] = (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    isMe: row.id === me.id,
    lastSignInAt: row.derniere_connexion,
  }));

  const jamaisConnectes = members.filter(
    (member) => member.isActive && member.lastSignInAt === null,
  ).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          Équipe <span className="text-muted-foreground font-bold">({members.length})</span>
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Créez les comptes, choisissez le statut de chacun, envoyez un lien d&apos;activation par
          e-mail. Vous êtes connecté en {ROLE_LABELS[me.role].toLowerCase()}.
        </p>
      </header>

      {error ? (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-2xl px-4 py-3 text-sm font-medium">
          La liste n&apos;a pas pu être chargée : {error.message}
        </p>
      ) : null}

      {jamaisConnectes > 0 ? (
        <p className="bg-alert text-alert-foreground rounded-2xl px-4 py-3 text-sm font-bold">
          {jamaisConnectes} compte{jamaisConnectes > 1 ? 's' : ''} n&apos;
          {jamaisConnectes > 1 ? 'ont' : 'a'} jamais servi. Envoyez-leur le lien d&apos;activation
          avec le bouton ✉️.
        </p>
      ) : null}

      <TeamManager members={members} />
    </div>
  );
}
