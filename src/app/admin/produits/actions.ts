'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Un nombre saisi au clavier français : « 1,5 » doit être accepté au même titre
 * que « 1.5 ». Une chaîne vide vaut « non renseigné ».
 */
const frenchNumber = z
  .union([z.string(), z.number(), z.null()])
  .transform((value) => {
    if (value === null) return null;
    const text = String(value).trim().replace(',', '.');
    if (text === '') return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  })
  .refine((value) => value === null || !Number.isNaN(value), 'Nombre invalide.');

const positiveNumber = frenchNumber.refine(
  (value) => value === null || value >= 0,
  'La valeur ne peut pas être négative.',
);

const productSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, 'Le nom est obligatoire.').max(120),
    category_id: z.uuid('Choisissez une catégorie.'),
    gn_format: z.string().trim().max(80).nullable(),
    count_step: positiveNumber,
    production_step: positiveNumber,
    reorder_mode: z.enum(['ratio', 'fixed']),
    reorder_ratio: positiveNumber,
    reorder_fixed: positiveNumber,
    floor_qty: positiveNumber,
    ceiling_qty: positiveNumber,
    urgency_level: z.coerce.number().int().min(1).max(5),
    prep_time_min: positiveNumber,
    weight_per_bac_kg: positiveNumber,
    in_saladbar: z.boolean(),
    in_fridge: z.boolean(),
    sort_order: z.coerce.number().int(),
    is_active: z.boolean(),
    notes: z.string().trim().max(500).nullable(),
  })
  .refine((data) => data.count_step === null || data.count_step > 0, {
    message: 'Le pas de comptage doit être strictement positif.',
    path: ['count_step'],
  })
  .refine((data) => data.production_step === null || data.production_step > 0, {
    message: 'Le pas de production doit être strictement positif.',
    path: ['production_step'],
  })
  .refine((data) => data.in_saladbar || data.in_fridge, {
    message: 'Un produit doit être stocké au saladbar, au frigo, ou aux deux.',
    path: ['in_saladbar'],
  })
  .refine((data) => data.reorder_mode !== 'ratio' || data.reorder_ratio !== null, {
    message: 'Renseignez le pourcentage de la cible qui déclenche la relance.',
    path: ['reorder_ratio'],
  })
  .refine((data) => data.reorder_mode !== 'fixed' || data.reorder_fixed !== null, {
    message: 'Renseignez le seuil de relance en gastros.',
    path: ['reorder_fixed'],
  })
  .refine(
    (data) =>
      data.floor_qty === null || data.ceiling_qty === null || data.floor_qty <= data.ceiling_qty,
    {
      message: 'Le plancher de cible ne peut pas dépasser le plafond.',
      path: ['ceiling_qty'],
    },
  );

export interface ProductFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function readForm(formData: FormData) {
  const text = (key: string) => {
    const value = formData.get(key);
    if (value === null) return null;
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
  };

  return {
    id: text('id') ?? undefined,
    name: String(formData.get('name') ?? ''),
    category_id: String(formData.get('category_id') ?? ''),
    gn_format: text('gn_format'),
    count_step: text('count_step'),
    production_step: text('production_step'),
    reorder_mode: String(formData.get('reorder_mode') ?? 'ratio'),
    reorder_ratio: text('reorder_ratio'),
    reorder_fixed: text('reorder_fixed'),
    floor_qty: text('floor_qty'),
    ceiling_qty: text('ceiling_qty'),
    urgency_level: String(formData.get('urgency_level') ?? '3'),
    prep_time_min: text('prep_time_min'),
    weight_per_bac_kg: text('weight_per_bac_kg'),
    in_saladbar: formData.get('in_saladbar') === 'on' || formData.get('in_saladbar') === 'true',
    in_fridge: formData.get('in_fridge') === 'on' || formData.get('in_fridge') === 'true',
    sort_order: String(formData.get('sort_order') ?? '0'),
    is_active: formData.get('is_active') === 'on' || formData.get('is_active') === 'true',
    notes: text('notes'),
  };
}

export async function saveProduct(
  _state: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = productSchema.safeParse(readForm(formData));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '_');
      fieldErrors[key] ??= issue.message;
    }
    return { error: 'Corrigez les champs signalés.', fieldErrors };
  }

  const { id, ...values } = parsed.data;

  // Le mode non retenu est vidé : on ne garde jamais un seuil fixe fantôme
  // derrière un produit passé en pourcentage.
  const payload = {
    ...values,
    reorder_ratio: values.reorder_mode === 'ratio' ? values.reorder_ratio : null,
    reorder_fixed: values.reorder_mode === 'fixed' ? values.reorder_fixed : null,
    count_step: values.count_step ?? 0.5,
    production_step: values.production_step ?? 0.5,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from('products').update(payload).eq('id', id)
    : await supabase.from('products').insert(payload);

  if (error) {
    return {
      error:
        error.code === '23505'
          ? 'Un produit porte déjà ce nom.'
          : `Enregistrement impossible : ${error.message}`,
    };
  }

  revalidatePath('/admin/produits');
  revalidatePath('/admin/calculateur');
  return { success: true };
}

/**
 * Désactiver ne supprime jamais : l'historique des comptages doit rester
 * cohérent. Il n'existe volontairement aucune action de suppression.
 */
export async function toggleProductActive(id: string, isActive: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase.from('products').update({ is_active: isActive }).eq('id', id);
  revalidatePath('/admin/produits');
}

/** Réordonnancement : enregistre la position de chaque produit. */
export async function reorderProducts(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from('products')
        .update({ sort_order: (index + 1) * 10 })
        .eq('id', id),
    ),
  );
  revalidatePath('/admin/produits');
}
