import { requireManager, ROLE_LABELS } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TeamManager, type TeamMember } from '@/components/admin/team-manager';
import { Card } from '@/components/ui/card';

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

      <Card className="rounded-3xl p-5">
        <h2 className="text-[17px] font-black">Donner son accès à quelqu&apos;un</h2>
        <ul className="text-muted-foreground mt-2 space-y-1.5 text-sm leading-relaxed">
          <li>
            <span className="text-foreground font-bold">Code d&apos;accès</span> — la façon
            normale. Un code de 8 caractères, valable 24 h, à dicter ou à envoyer par SMS. La
            personne va sur le site, touche « Première connexion » et choisit son mot de passe.
          </li>
          <li>
            <span className="text-foreground font-bold">🔑 Mot de passe à la main</span> — si
            vous préférez le lui donner vous-même de vive voix.
          </li>
        </ul>

        <p className="text-muted-foreground mt-3 border-t pt-3 text-[13px] leading-relaxed">
          Les liens par e-mail ont été retirés : Supabase les fait passer par sa propre page de
          vérification, qui consomme le jeton avant que la personne clique — les antivirus des
          messageries l&apos;ouvrent les premiers. D&apos;où le « lien expiré » systématique. Un
          code ne s&apos;ouvre pas tout seul.
        </p>
      </Card>

      <TeamManager members={members} />
    </div>
  );
}
