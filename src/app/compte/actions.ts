'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export interface PasswordState {
  error?: string;
  success?: string;
}

const schema = z
  .object({
    current: z.string().min(1, 'Saisissez votre mot de passe actuel.'),
    next: z.string().min(8, 'Le nouveau mot de passe doit faire au moins 8 caractères.'),
    confirm: z.string(),
  })
  .refine((data) => data.next === data.confirm, {
    message: 'Les deux nouveaux mots de passe ne correspondent pas.',
    path: ['confirm'],
  })
  .refine((data) => data.next !== data.current, {
    message: 'Le nouveau mot de passe doit être différent de l’ancien.',
    path: ['next'],
  });

export async function changeOwnPassword(
  _state: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const parsed = schema.safeParse({
    current: String(formData.get('current') ?? ''),
    next: String(formData.get('next') ?? ''),
    confirm: String(formData.get('confirm') ?? ''),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Formulaire invalide.' };
  }

  const user = await getCurrentUser();
  if (!user?.email) return { error: 'Session expirée. Reconnectez-vous.' };

  const supabase = await createClient();

  // On revérifie le mot de passe actuel : sans cela, un téléphone laissé
  // déverrouillé sur le plan de travail suffirait à changer le mot de passe.
  const { error: checkError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  });

  if (checkError) return { error: 'Mot de passe actuel incorrect.' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
  if (error) return { error: `Changement impossible : ${error.message}` };

  return { success: 'Mot de passe changé.' };
}
