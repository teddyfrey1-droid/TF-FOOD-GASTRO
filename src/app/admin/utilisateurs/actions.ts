'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient, createSignUpClient } from '@/lib/supabase/server';
import { getCurrentUser, isManagerRole } from '@/lib/auth';
import { empreinte, genererCode } from '@/lib/activation';
import type { UserRole } from '@/lib/supabase/database.types';

/**
 * La création de comptes passe par la clé de service : c'est la seule façon
 * d'inscrire quelqu'un sans lui demander de le faire lui-même. On vérifie
 * donc DEUX FOIS que l'appelant est bien directeur ou propriétaire — la RLS
 * ne protège pas un client à privilèges.
 */
async function requireManagerOrThrow() {
  const user = await getCurrentUser();
  if (!user || !user.isActive || !isManagerRole(user.role)) {
    throw new Error('Seul un directeur ou le propriétaire peut gérer les comptes.');
  }
  return user;
}

const createSchema = z.object({
  email: z.email('Adresse e-mail invalide.'),
  fullName: z.string().trim().min(1, 'Le prénom est obligatoire.').max(80),
  password: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.'),
  role: z.enum(['employee', 'assistant_manager', 'manager', 'owner']),
});

export interface UserFormState {
  error?: string;
  success?: string;
}

/**
 * Message affiché quand la clé de service manque.
 *
 * Créer un compte pour quelqu'un d'autre est la SEULE opération de
 * l'application qui l'exige : elle écrit dans le service d'authentification,
 * hors de portée d'une clé publique. Plutôt qu'une erreur technique, on
 * indique le geste exact à faire.
 */
/**
 * Traduit les refus de Supabase à l'inscription.
 *
 * Le plus fréquent de loin : une adresse dont le domaine ne reçoit pas de
 * courrier. Supabase la rejette, et son message brut ne dit pas quoi faire.
 */
function messageInscription(brut: string | undefined): string {
  const message = brut ?? 'erreur inconnue';

  if (/already|registered|exists/i.test(message)) {
    return 'Un compte existe déjà avec cette adresse.';
  }
  if (/invalid/i.test(message) && /email/i.test(message)) {
    return (
      'Adresse refusée par Supabase : le domaine doit pouvoir recevoir du courrier. ' +
      'Une adresse Gmail ou celle du restaurant fonctionne ; une adresse inventée, non.'
    );
  }
  if (/rate|limit|too many/i.test(message)) {
    return 'Trop de créations d’affilée. Patientez quelques minutes puis réessayez.';
  }
  if (/password/i.test(message)) {
    return 'Mot de passe refusé : il doit faire au moins 8 caractères.';
  }
  return `Création impossible : ${message}`;
}

/**
 * Message affiché quand la clé de service manque.
 *
 * Depuis que la création de comptes passe par l'inscription ordinaire, une
 * SEULE opération l'exige encore : réinitialiser le mot de passe de
 * quelqu'un d'autre. Changer le mot de passe d'un tiers se fait dans le
 * service d'authentification, hors de portée d'une clé publique.
 *
 * Contournement sans la clé : désactiver le compte, en recréer un avec la
 * même adresse — ou laisser l'employé changer son mot de passe lui-même
 * depuis « Mon compte ».
 */
const CLE_DE_SERVICE_MANQUANTE =
  'Réinitialisation indisponible : la clé de service Supabase n’est pas renseignée sur ' +
  'Vercel. En attendant, l’employé peut changer son mot de passe lui-même depuis ' +
  '« Mon compte ». Pour l’activer : Vercel → Settings → Environment Variables → ' +
  'SUPABASE_SERVICE_ROLE_KEY, puis redéployer.';

export async function createTeamMember(
  _state: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  try {
    await requireManagerOrThrow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Accès refusé.' };
  }

  const parsed = createSchema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    fullName: String(formData.get('fullName') ?? ''),
    password: String(formData.get('password') ?? ''),
    role: String(formData.get('role') ?? 'employee'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };
  }

  // Inscription ordinaire, avec la clé PUBLIQUE : aucune clé de service
  // n'est nécessaire. Le client n'écrit pas de cookies, sinon le directeur
  // serait déconnecté au profit du compte qu'il vient de créer.
  const { data, error } = await createSignUpClient().auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });

  if (error || !data.user) {
    return { error: messageInscription(error?.message) };
  }

  // Le compte naît non confirmé et le profil désactivé. Le directeur qui
  // vient de le créer EST la validation : il remet le mot de passe en main
  // propre. On confirme donc l'adresse à sa place — l'e-mail de Supabase
  // n'aurait jamais été ouvert depuis une cuisine.
  const supabase = await createClient();
  const { error: activationError } = await supabase.rpc('mep_activer_compte', {
    p_user_id: data.user.id,
    p_full_name: parsed.data.fullName,
    p_role: parsed.data.role as UserRole,
  });

  if (activationError) {
    return {
      error: `Compte créé, mais non activé : ${activationError.message}. Activez-le depuis la liste ci-dessous.`,
    };
  }

  revalidatePath('/admin/utilisateurs');
  return { success: `${parsed.data.fullName} peut se connecter dès maintenant.` };
}

/**
 * Fabrique un code d'activation pour quelqu'un.
 *
 * Le code remplace le lien par courriel, qui ne pouvait pas marcher :
 * Supabase fait passer ses liens par son propre point de vérification,
 * lequel CONSOMME le jeton puis redirige vers l'adresse configurée dans
 * son tableau de bord — restée sur `localhost:3000`, hors de notre
 * portée. Et les antivirus des messageries ouvrent les liens avant leur
 * destinataire, ce qui brûle le jeton : d'où le « lien expiré » à chaque
 * essai, sans que personne ait rien fait de travers.
 *
 * Un code ne s'ouvre pas tout seul, se dicte au téléphone, et ne dépend
 * d'aucun réglage que nous ne maîtrisons pas.
 */
export async function creerCodeActivation(
  userId: string,
): Promise<{ error?: string; code?: string; expireLe?: string }> {
  try {
    await requireManagerOrThrow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Accès refusé.' };
  }

  const code = genererCode();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mep_creer_code_activation', {
    p_user_id: userId,
    p_code_hash: empreinte(code),
    p_heures: 24,
  });

  if (error) return { error: error.message };

  revalidatePath('/admin/utilisateurs');
  // Le code n'existe en clair QUE dans cette réponse : il n'est stocké
  // nulle part, et ne pourra pas être réaffiché.
  return { code, expireLe: data };
}

/**
 * Supprime définitivement un compte.
 *
 * Les droits sont vérifiés EN BASE (`mep_peut_supprimer_compte`) avant
 * d'employer la clé de service, qui ne connaît aucune règle : on ne lui
 * confie le geste qu'une fois l'autorisation établie.
 *
 * Les comptages réalisés par la personne survivent. L'historique du
 * restaurant ne se réécrit pas parce qu'un salarié est parti.
 */
export async function supprimerCompte(
  userId: string,
): Promise<{ error?: string; success?: string }> {
  try {
    await requireManagerOrThrow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Accès refusé.' };
  }

  const supabase = await createClient();
  const { error: refus } = await supabase.rpc('mep_peut_supprimer_compte', {
    p_user_id: userId,
  });
  if (refus) return { error: refus.message };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'La clé de service manque sur l’hébergement : suppression impossible.' };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: `Suppression impossible : ${error.message}` };

  revalidatePath('/admin/utilisateurs');
  return { success: 'Compte supprimé.' };
}

export async function setMemberRole(userId: string, role: UserRole): Promise<{ error?: string }> {
  try {
    await requireManagerOrThrow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Accès refusé.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) return { error: error.message };

  revalidatePath('/admin/utilisateurs');
  return {};
}

export async function setMemberActive(
  userId: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  const me = await getCurrentUser().catch(() => null);
  try {
    await requireManagerOrThrow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Accès refusé.' };
  }

  // Se désactiver soi-même reviendrait à se verrouiller dehors.
  if (me?.id === userId && !isActive) {
    return { error: 'Vous ne pouvez pas désactiver votre propre compte.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', userId);
  if (error) return { error: error.message };

  revalidatePath('/admin/utilisateurs');
  return {};
}

const passwordSchema = z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.');

/** Réinitialise le mot de passe d'un membre de l'équipe. */
export async function resetMemberPassword(
  userId: string,
  password: string,
): Promise<{ error?: string; success?: string }> {
  try {
    await requireManagerOrThrow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Accès refusé.' };
  }

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: CLE_DE_SERVICE_MANQUANTE };
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password: parsed.data });
  if (error) return { error: `Réinitialisation impossible : ${error.message}` };

  return { success: 'Mot de passe réinitialisé.' };
}
