'use server';

import { createClient } from '@/lib/supabase/server';

export interface LigneFrise {
  survenuLe: string;
  categorie: string;
  libelle: string;
  detail: string;
}

/**
 * La frise d'activité d'une personne, chargée à la demande.
 *
 * Trente jours × six personnes feraient plusieurs milliers de lignes à
 * l'ouverture de l'écran, pour un détail qu'on consulte une personne à
 * la fois. Le contrôle du statut est fait EN BASE : cette action ne
 * fait que relayer le refus.
 */
export async function chargerFrise(userId: string): Promise<{
  lignes: LigneFrise[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mep_suivi_detail', {
    p_user_id: userId,
    p_jours: 30,
    p_limite: 200,
  });

  if (error) return { lignes: [], error: error.message };

  return {
    lignes: (data ?? []).map((ligne) => ({
      survenuLe: ligne.survenu_le,
      categorie: ligne.categorie,
      libelle: ligne.libelle,
      detail: ligne.detail,
    })),
  };
}
