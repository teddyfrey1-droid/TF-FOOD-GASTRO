import { requireManager, ROLE_LABELS } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TeamManager, type TeamMember } from '@/components/admin/team-manager';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

const HEURE = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

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

  // Le quota d'envoi appartient au projet Supabase entier, pas à un
  // destinataire : deux courriels par heure, tous employés confondus.
  const ilYAUneHeure = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: envois } = await supabase
    .from('activation_email_sends')
    .select('sent_at')
    .gt('sent_at', ilYAUneHeure)
    .order('sent_at');

  const envoisRestants = Math.max(0, 2 - (envois?.length ?? 0));
  const prochainCreneau =
    envoisRestants === 0 && envois?.[0]
      ? new Date(new Date(envois[0].sent_at).getTime() + 60 * 60 * 1000)
      : null;

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
        <h2 className="text-[17px] font-black">Donner son accès à quelqu’un</h2>
        <ul className="text-muted-foreground mt-2 space-y-1.5 text-sm leading-relaxed">
          <li>
            <span className="text-foreground font-bold">🔗 Copier le lien</span> — le plus sûr.
            Aucun e-mail, aucune limite : collez-le dans un SMS ou un WhatsApp. Il vaut une
            heure et ne sert qu’une fois.
          </li>
          <li>
            <span className="text-foreground font-bold">✉️ Envoyer par e-mail</span> — plus
            confortable, mais Supabase n’accepte que{' '}
            <span className="text-foreground font-bold">2 envois par heure</span> pour tout le
            restaurant.
          </li>
          <li>
            <span className="text-foreground font-bold">🔑 Mot de passe à la main</span> — à
            dicter de vive voix, la personne le changera ensuite.
          </li>
        </ul>

        <p
          className={
            envoisRestants > 0
              ? 'bg-muted mt-4 rounded-2xl px-4 py-2.5 text-sm font-bold'
              : 'bg-alert text-alert-foreground mt-4 rounded-2xl px-4 py-2.5 text-sm font-bold'
          }
        >
          {envoisRestants > 0
            ? `${envoisRestants} e-mail${envoisRestants > 1 ? 's' : ''} encore possible${
                envoisRestants > 1 ? 's' : ''
              } cette heure-ci.`
            : `Quota d’e-mails atteint. Prochain envoi possible à ${HEURE.format(
                prochainCreneau!,
              )} — d’ici là, utilisez « Copier le lien ».`}
        </p>
      </Card>

      <TeamManager members={members} />
    </div>
  );
}
