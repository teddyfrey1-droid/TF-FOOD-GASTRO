'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Annule un comptage commencé.
 *
 * Toutes les règles — comptage en cours seulement, auteur ou
 * encadrement, journée en cours — vivent dans la base. Cette action ne
 * fait que relayer le refus, en français, à l'écran.
 */
export async function annulerComptage(sessionId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mep_annuler_comptage', { p_session_id: sessionId });

  if (error) return { error: error.message };

  revalidatePath('/');
  revalidatePath('/comptage');
  return {};
}
