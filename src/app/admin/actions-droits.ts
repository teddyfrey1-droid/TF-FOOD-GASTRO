'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/supabase/database.types';

/**
 * Ouvre ou ferme un droit pour un statut.
 *
 * Tout le contrôle est en base : appelant directeur, paire présente au
 * catalogue. Cette action relaie le refus, elle ne le décide pas.
 */
export async function reglerDroit(
  permission: string,
  role: UserRole,
  allowed: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mep_regler_droit', {
    p_permission: permission,
    p_role: role,
    p_allowed: allowed,
  });

  if (error) return { error: error.message };

  // Le droit change ce que chacun voit : tout l'écran de gestion et les
  // pages concernées doivent repartir de la nouvelle règle.
  revalidatePath('/', 'layout');
  return {};
}
