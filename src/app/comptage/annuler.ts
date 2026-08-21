'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { journaliser } from '@/app/journal';

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

  void journaliser('action', 'Comptage annulé');

  revalidatePath('/');
  revalidatePath('/comptage');
  return {};
}

/**
 * Remet un comptage validé du jour en cours de saisie.
 *
 * La validation suivante recalculera entièrement la liste de relance :
 * `mep_submit_count` efface et reconstruit les tâches. Aucun relevé
 * n'est perdu, seul l'état change.
 */
export async function rouvrirComptage(sessionId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mep_rouvrir_comptage', { p_session_id: sessionId });

  if (error) return { error: error.message };

  void journaliser('action', 'Comptage rouvert');

  revalidatePath('/');
  revalidatePath('/comptage');
  return {};
}
