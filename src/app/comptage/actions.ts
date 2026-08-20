'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SessionKind } from '@/lib/supabase/database.types';

/** Ouvre (ou retrouve) la session du jour et prépare une ligne par produit actif. */
export async function openSession(session: SessionKind): Promise<{
  sessionId?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mep_open_count_session', {
    p_session: session,
    p_device_info: null,
  });

  if (error) return { error: `Impossible d’ouvrir le comptage : ${error.message}` };
  return { sessionId: data as unknown as string };
}

const lineSchema = z.object({
  sessionId: z.uuid(),
  productId: z.uuid(),
  qtySaladbar: z.number().min(0).max(999),
  qtyFridge: z.number().min(0).max(999),
  isNotApplicable: z.boolean(),
  notApplicableReason: z.string().trim().max(200).nullable(),
  countedSaladbar: z.boolean(),
  countedFridge: z.boolean(),
});

export type SaveLineInput = z.input<typeof lineSchema>;

/**
 * Enregistre une ligne de comptage.
 *
 * Le client appelle cette action à chaque changement (avec anti-rebond). En
 * cas d'échec réseau, la saisie reste dans la file IndexedDB et sera rejouée :
 * cette action doit donc rester **idempotente**.
 */
export async function saveCountLine(input: SaveLineInput): Promise<{ error?: string }> {
  const parsed = lineSchema.safeParse(input);
  if (!parsed.success) return { error: 'Saisie invalide.' };

  const { sessionId, productId, isNotApplicable, notApplicableReason } = parsed.data;

  if (isNotApplicable && !notApplicableReason) {
    return { error: 'Indiquez pourquoi le produit n’est pas applicable.' };
  }

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('count_lines')
    .update({
      // Un produit non applicable ne porte pas de quantité.
      qty_saladbar: isNotApplicable ? 0 : parsed.data.qtySaladbar,
      qty_fridge: isNotApplicable ? 0 : parsed.data.qtyFridge,
      is_not_applicable: isNotApplicable,
      not_applicable_reason: isNotApplicable ? notApplicableReason : null,
      counted_at: now,
      // Un produit « absent » vaut pour les deux zones : il n'y a rien à
      // relever nulle part.
      counted_saladbar_at:
        isNotApplicable || parsed.data.countedSaladbar ? now : null,
      counted_fridge_at: isNotApplicable || parsed.data.countedFridge ? now : null,
    })
    .eq('session_id', sessionId)
    .eq('product_id', productId)
    .select('id');

  if (error) return { error: error.message };

  // Zéro ligne touchée : la RLS a filtré. En pratique, un collègue a validé le
  // comptage pendant la saisie. Il faut le dire — sinon l'employé continue de
  // compter dans le vide en croyant que tout est enregistré.
  if (!data || data.length === 0) {
    return {
      error:
        'Ce comptage a été validé entre-temps : vos dernières saisies n’ont pas été enregistrées.',
    };
  }

  return {};
}

/** Rejoue plusieurs saisies d'un coup, au retour du réseau. */
export async function saveCountLines(
  inputs: SaveLineInput[],
): Promise<{ savedKeys: string[]; error?: string }> {
  const savedKeys: string[] = [];

  for (const input of inputs) {
    const result = await saveCountLine(input);
    if (result.error) return { savedKeys, error: result.error };
    savedKeys.push(`${input.sessionId}:${input.productId}`);
  }

  return { savedKeys };
}

export interface ReorderItem {
  productId: string;
  productName: string;
  notes: string | null;
  qtyToProduce: number;
  unit: 'gastro' | 'piece';
  /** 1 = le plus urgent, 5 = le moins. */
  priority: number;
  imageUrl: string | null;
  categoryName: string;
}

/**
 * Valide le comptage. Tout le calcul (cible, seuil, besoin) se fait en base :
 * la réponse ne contient ni CA, ni cible, ni seuil (§5.8).
 */
export async function submitCount(sessionId: string): Promise<{
  items?: ReorderItem[];
  error?: string;
}> {
  if (!z.uuid().safeParse(sessionId).success) return { error: 'Session invalide.' };

  const supabase = await createClient();

  // Le refus d'un comptage incomplet appartient au SERVEUR, et à lui seul.
  // Il vérifie zone par zone : `counted_at` est renseigné dès qu'une seule
  // zone est touchée, et s'y fier laissait valider une journée où le frigo
  // du bas n'avait jamais été ouvert.
  const { data, error } = await supabase.rpc('mep_submit_count', { p_session_id: sessionId });

  if (error) {
    // Message métier explicite (« il reste 3 produits à compter ») : on le
    // montre tel quel plutôt que noyé dans un préfixe technique.
    return { error: error.code === 'P0001' ? error.message : `Validation impossible : ${error.message}` };
  }

  revalidatePath('/');
  revalidatePath('/comptage', 'layout');

  return {
    items: (data ?? []).map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      notes: row.notes,
      qtyToProduce: Number(row.qty_to_produce),
      unit: row.unit,
      priority: Number(row.priority),
      imageUrl: row.image_url,
      categoryName: row.category_name,
    })),
  };
}

/** Coche ou décoche une tâche de production depuis le rapport. */
export async function toggleProductionTask(
  taskId: string,
  isDone: boolean,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('production_tasks')
    .update({
      is_done: isDone,
      done_at: isDone ? new Date().toISOString() : null,
      done_by: isDone ? (user?.id ?? null) : null,
    })
    .eq('id', taskId);

  if (error) return { error: error.message };

  revalidatePath('/comptage', 'layout');
  return {};
}
