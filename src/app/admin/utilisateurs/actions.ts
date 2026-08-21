'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient, createSignUpClient } from '@/lib/supabase/server';
import { getCurrentUser, isManagerRole } from '@/lib/auth';
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

/** Adresse publique du site, pour le retour du lien d'activation. */
function adresseDuSite(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : 'https://tf-food-gastro.vercel.app')
  );
}

/**
 * Envoie à l'employé un lien pour choisir son mot de passe.
 *
 * On passe par le courriel de RÉINITIALISATION plutôt que par une
 * invitation : le résultat est le même pour la personne qui le reçoit, et
 * le message part même si le compte a déjà servi.
 *
 * ⚠️ Le service d'envoi intégré à Supabase plafonne à DEUX messages par
 * heure pour tout le projet. Au-delà il répond 429 et n'envoie rien : le
 * lien semblait parti et n'arrivait jamais. On réserve donc le créneau en
 * base AVANT d'appeler Supabase, et on le rend si l'envoi échoue quand
 * même. Le directeur sait ainsi toujours où il en est de son quota.
 */
export async function envoyerLienActivation(
  email: string,
): Promise<{ error?: string; success?: string }> {
  try {
    await requireManagerOrThrow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Accès refusé.' };
  }

  const parsed = z.email().safeParse(email.trim());
  if (!parsed.success) return { error: 'Adresse e-mail invalide.' };

  const supabase = await createClient();
  const { data: creneau, error: quota } = await supabase.rpc('mep_reserver_envoi_activation', {
    p_email: parsed.data,
  });

  // Le message de la base porte déjà l'heure du prochain créneau : on le
  // montre tel quel plutôt que de le réécrire en moins précis.
  if (quota) return { error: quota.message };

  const { error } = await createSignUpClient().auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${adresseDuSite()}/definir-mot-de-passe`,
  });

  if (error) {
    if (creneau) await supabase.rpc('mep_annuler_envoi_activation', { p_id: creneau });

    if (/rate|limit|too many|seconds/i.test(error.message)) {
      return {
        error:
          'Supabase a refusé l’envoi : son quota horaire est déjà atteint. ' +
          'Utilisez « Copier le lien » — il fonctionne sans e-mail.',
      };
    }
    return { error: `Envoi impossible : ${error.message}` };
  }

  revalidatePath('/admin/utilisateurs');
  return {
    success: `Lien envoyé à ${parsed.data}. Il est valable une heure.`,
  };
}

/**
 * Fabrique le lien d'activation sans envoyer aucun courriel.
 *
 * C'est le chemin fiable, et il n'a aucun quota : la clé de service
 * demande à Supabase un jeton à usage unique, et on le pose sur NOTRE
 * adresse. Le directeur transmet ensuite le lien par SMS ou WhatsApp —
 * souvent plus sûr qu'un courriel qui finit en indésirables.
 *
 * Le lien ne passe pas par `/auth/v1/verify` de Supabase, dont la
 * redirection retombe sur l'« adresse du site » configurée dans le tableau
 * de bord. Il pointe droit sur `/definir-mot-de-passe`, qui échange le
 * jeton lui-même : rien à régler ailleurs pour que ça marche.
 */
/**
 * Vérifie où atterrit RÉELLEMENT le lien envoyé par courriel.
 *
 * Supabase n'accepte une adresse de retour que si elle figure dans sa
 * liste blanche ; sinon il retombe silencieusement sur l'« adresse du
 * site » configurée dans son tableau de bord. Quand celle-ci est restée
 * sur `http://localhost:3000`, le courriel part, arrive — et son lien
 * mène à une machine de développement. Vu de l'écran Équipe, tout allait
 * bien.
 *
 * `generateLink` renvoie l'adresse que Supabase a retenue : on la lit et
 * on la compare à la nôtre. Le diagnostic remonte donc du serveur, au
 * lieu de rester dans les journaux.
 */
export async function verifierRetourCourriel(): Promise<{
  correct?: boolean;
  retenue?: string;
  attendue?: string;
  error?: string;
}> {
  try {
    await requireManagerOrThrow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Accès refusé.' };
  }

  const attendue = adresseDuSite();

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'La clé de service manque : impossible de vérifier.' };
  }

  const { data: equipe } = await (await createClient()).rpc('mep_equipe');
  const cobaye = (equipe ?? []).find((membre) => membre.email)?.email;
  if (!cobaye) return { error: 'Aucune adresse en base pour faire le test.' };

  // `generateLink` n'envoie aucun courriel : la vérification ne coûte
  // rien au quota, et peut donc se faire à chaque ouverture de l'écran.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: cobaye,
    options: { redirectTo: `${attendue}/definir-mot-de-passe` },
  });

  if (error) return { error: error.message };

  const lien = data.properties?.action_link;
  if (!lien) return { error: 'Supabase n’a pas renvoyé de lien.' };

  const retenue = new URL(lien).searchParams.get('redirect_to') ?? '(aucune)';
  return { correct: retenue.startsWith(attendue), retenue, attendue };
}

export async function genererLienActivation(
  email: string,
): Promise<{ error?: string; lien?: string }> {
  try {
    await requireManagerOrThrow();
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Accès refusé.' };
  }

  const parsed = z.email().safeParse(email.trim());
  if (!parsed.success) return { error: 'Adresse e-mail invalide.' };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      error:
        'La clé de service manque sur l’hébergement : seul l’envoi par e-mail est possible.',
    };
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: parsed.data,
  });

  if (error) return { error: `Lien impossible à créer : ${error.message}` };

  const jeton = data.properties?.hashed_token;
  if (!jeton) return { error: 'Supabase n’a pas renvoyé de jeton utilisable.' };

  return {
    lien: `${adresseDuSite()}/definir-mot-de-passe?token_hash=${encodeURIComponent(jeton)}&type=recovery`,
  };
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
