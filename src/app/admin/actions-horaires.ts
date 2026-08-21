'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const heure = z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.');

/**
 * Change les heures d'ouverture des comptages.
 *
 * Le contrôle de fond — appelant directeur, après-midi postérieur au
 * matin — est fait EN BASE : cette action ne fait que traduire le refus.
 */
export async function reglerHeuresComptage(
  matin: string,
  apresMidi: string,
): Promise<{ error?: string }> {
  const parse = z.object({ matin: heure, apresMidi: heure }).safeParse({ matin, apresMidi });
  if (!parse.success) return { error: 'Heure invalide.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('mep_regler_heures_comptage', {
    p_morning: `${parse.data.matin}:00`,
    p_afternoon: `${parse.data.apresMidi}:00`,
  });

  if (error) return { error: error.message };

  // L'accueil et l'onglet Comptage affichent le grisage : ils doivent
  // repartir de la nouvelle heure sans attendre.
  revalidatePath('/');
  revalidatePath('/comptage');
  revalidatePath('/admin');
  return {};
}
