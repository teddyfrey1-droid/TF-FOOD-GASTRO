'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, createAdminClient } from '@/lib/supabase/server';
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
const CLE_DE_SERVICE_MANQUANTE =
  'Création de comptes indisponible : la clé de service Supabase n’est pas encore ' +
  'renseignée sur Vercel. Réglages du projet → Environment Variables → ajouter ' +
  'SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API keys → service_role), ' +
  'puis redéployer. Les autres réglages de cette page fonctionnent sans elle.';

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

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: CLE_DE_SERVICE_MANQUANTE };
  }

  // `email_confirm` évite d'envoyer un e-mail de validation : en cuisine,
  // personne n'ira relever sa boîte pour activer un compte.
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (error || !data.user) {
    return {
      error: error?.message?.includes('already')
        ? 'Un compte existe déjà avec cette adresse.'
        : `Création impossible : ${error?.message ?? 'erreur inconnue'}`,
    };
  }

  // Le déclencheur crée le profil en « salarié désactivé » : le directeur
  // ayant explicitement créé ce compte, on l'active et on pose son statut.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      role: parsed.data.role as UserRole,
      is_active: true,
    })
    .eq('id', data.user.id);

  if (profileError) {
    return { error: `Compte créé, mais statut non appliqué : ${profileError.message}` };
  }

  revalidatePath('/admin/utilisateurs');
  return { success: `${parsed.data.fullName} peut se connecter dès maintenant.` };
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
