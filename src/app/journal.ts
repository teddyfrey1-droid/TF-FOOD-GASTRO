'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Enregistre une trace d'usage.
 *
 * Volontairement silencieuse : le journal ne doit JAMAIS faire échouer
 * ce que la personne était en train de faire. Un comptage qui refuse de
 * se valider parce qu'une ligne de suivi n'est pas partie serait un
 * comble.
 *
 * L'auteur n'est pas un paramètre — la base le lit dans le jeton. Cette
 * fonction ne peut donc pas servir à écrire au nom d'un collègue.
 */
export async function journaliser(
  kind: 'vue' | 'action',
  label: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc('mep_journaliser', {
      p_kind: kind,
      p_label: label,
      p_detail: detail ? JSON.parse(JSON.stringify(detail)) : null,
    });
  } catch {
    // Rien à faire : une trace manquante vaut mieux qu'un écran cassé.
  }
}
