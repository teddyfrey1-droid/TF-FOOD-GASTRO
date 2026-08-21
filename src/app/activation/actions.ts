'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { empreinte, memeEmpreinte, normaliserCode } from '@/lib/activation';

const schema = z.object({
  email: z.email('Adresse e-mail invalide.'),
  code: z.string().trim().min(6, 'Code incomplet.').max(20),
  motDePasse: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.'),
});

/** Réponse volontairement identique pour tous les refus (voir plus bas). */
const REFUS = {
  error: 'Code inconnu, déjà utilisé ou expiré. Demandez-en un nouveau à votre directeur.',
};

/**
 * Active un compte avec son code, et pose le mot de passe choisi.
 *
 * Appelée par quelqu'un qui n'est PAS connecté — c'est tout l'objet de
 * l'opération. Elle passe donc par la clé de service, et porte seule la
 * responsabilité des vérifications :
 *
 *   • l'adresse doit correspondre à un compte existant ;
 *   • le code doit être le sien, non utilisé, non expiré ;
 *   • au bout de cinq tentatives, le code est brûlé.
 *
 * Tous les refus renvoient LE MÊME message. Distinguer « adresse
 * inconnue » de « code faux » dirait à un curieux quelles adresses
 * existent — et un code sert justement à protéger un compte.
 */
export async function activerAvecCode(
  _precedent: { error?: string } | undefined,
  donnees: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const parse = schema.safeParse({
    email: String(donnees.get('email') ?? '').trim(),
    code: String(donnees.get('code') ?? ''),
    motDePasse: String(donnees.get('motDePasse') ?? ''),
  });

  if (!parse.success) {
    return { error: parse.error.issues[0]?.message ?? 'Saisie invalide.' };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: 'L’activation est indisponible : la clé de service manque.' };
  }

  // On cherche l'empreinte, jamais le code : la base ne l'a jamais vu.
  const { data: codes } = await admin
    .from('activation_codes')
    .select('id, user_id, expires_at, used_at, attempts')
    .eq('code_hash', empreinte(parse.data.code))
    .is('used_at', null)
    .limit(1);

  const ligne = codes?.[0];
  if (!ligne) return REFUS;

  if (new Date(ligne.expires_at).getTime() < Date.now()) return REFUS;

  if (ligne.attempts >= 5) {
    await admin
      .from('activation_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', ligne.id);
    return REFUS;
  }

  // L'adresse doit être celle du compte visé par le code. Sans cela, un
  // code intercepté ouvrirait n'importe quel compte.
  const { data: compte } = await admin.auth.admin.getUserById(ligne.user_id);
  const attendue = compte.user?.email?.toLowerCase() ?? '';

  if (!attendue || !memeEmpreinte(attendue, parse.data.email.toLowerCase())) {
    await admin
      .from('activation_codes')
      .update({ attempts: ligne.attempts + 1 })
      .eq('id', ligne.id);
    return REFUS;
  }

  const { error } = await admin.auth.admin.updateUserById(ligne.user_id, {
    password: parse.data.motDePasse,
    email_confirm: true,
  });

  if (error) return { error: `Enregistrement impossible : ${error.message}` };

  // Le code ne sert qu'une fois, et il vient de servir.
  await admin
    .from('activation_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', ligne.id);

  return { success: true };
}

/** Le code est saisi tel qu'il a été dicté ; on le range avant de comparer. */
export async function normaliser(code: string): Promise<string> {
  return normaliserCode(code);
}
