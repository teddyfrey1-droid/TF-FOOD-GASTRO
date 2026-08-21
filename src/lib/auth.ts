import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isManagerRole, isStaffLeadRole } from '@/lib/roles';
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
export async function requireStaffLead(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isStaffLeadRole(user.role)) redirect('/');
  return user;
}

export async function requireManager(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!isManagerRole(user.role)) redirect('/');
  return user;
}

/**
 * Exige un droit réglable, pas un statut.
 *
 * C'est la base qui tranche : `mep_a_le_droit` répond toujours oui au
 * directeur et au propriétaire, et consulte le tableau des droits pour
 * les autres. La page n'a donc pas à connaître la règle — elle changera
 * sans qu'on y revienne.
 */
export async function requireDroit(permission: string): Promise<CurrentUser> {
  const user = await requireUser();

  const supabase = await createClient();
  const { data } = await supabase.rpc('mep_a_le_droit', { p_permission: permission });

  if (data !== true) redirect('/');
  return user;
}

/** Le même contrôle, sans redirection : pour masquer une entrée de menu. */
export async function aLeDroit(permission: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('mep_a_le_droit', { p_permission: permission });
  return data === true;
}
