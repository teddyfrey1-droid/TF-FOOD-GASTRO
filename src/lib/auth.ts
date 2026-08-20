import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isManagerRole } from '@/lib/roles';
import type { UserRole } from '@/lib/supabase/database.types';

export interface CurrentUser {
  id: string;
  email: string | null;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

// Les libellés et prédicats de statut vivent dans `@/lib/roles`, sans
// dépendance serveur, pour rester importables depuis un composant client.
export {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  isManagerRole,
  isStaffLeadRole,
} from '@/lib/roles';

/** Utilisateur connecté, ou null. Ne redirige pas. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    role: profile.role,
    isActive: profile.is_active,
  };
}

/** Exige un utilisateur connecté et actif, sinon redirige vers la connexion. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !user.isActive) redirect('/connexion');
  return user;
}

/**
 * Exige un directeur ou le propriétaire.
 *
 * Cette barrière est un confort de navigation : la protection réelle des
 * données reste la RLS, qui ne renverrait rien à un employé même si celui-ci
 * forçait l'URL.
 */
export async function requireManager(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isManagerRole(user.role)) redirect('/');
  return user;
}
