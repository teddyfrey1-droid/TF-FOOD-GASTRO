import { requireManager, ROLE_LABELS } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { TeamManager, type TeamMember } from '@/components/admin/team-manager';
import type { UserRole } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const me = await requireManager();
  const supabase = await createClient();

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active, created_at')
    .order('is_active', { ascending: false })
    .order('full_name');

  const members: TeamMember[] = (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    role: row.role as UserRole,
    isActive: row.is_active,
    isMe: row.id === me.id,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black tracking-tight">
          Équipe <span className="text-muted-foreground font-bold">({members.length})</span>
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Créez les comptes, choisissez le statut de chacun, réinitialisez un mot de passe oublié.
          Vous êtes connecté en {ROLE_LABELS[me.role].toLowerCase()}.
        </p>
      </header>

      <TeamManager members={members} />
    </div>
  );
}
