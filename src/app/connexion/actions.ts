'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const credentialsSchema = z.object({
  email: z.email('Adresse e-mail invalide.'),
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
  suite: z.string().optional(),
});

export interface LoginState {
  error?: string;
}

export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: String(formData.get('email') ?? '').trim(),
    password: formData.get('password'),
    suite: formData.get('suite') ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Identifiants invalides.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Message volontairement générique : ne pas révéler si le compte existe.
    return { error: 'E-mail ou mot de passe incorrect.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { error: 'Ce compte a été désactivé. Contactez votre directeur.' };
  }

  revalidatePath('/', 'layout');
  const suite = parsed.data.suite;
  // On n'accepte qu'un chemin interne : jamais une URL absolue fournie par l'appelant.
  redirect(suite && suite.startsWith('/') && !suite.startsWith('//') ? suite : '/');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/connexion');
}
