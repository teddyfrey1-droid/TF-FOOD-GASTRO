'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Un nombre saisi au clavier français : « 1,5 » vaut « 1.5 ».
 * Une chaîne vide signifie « non renseigné ».
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
    family: z.enum(['mise_en_place', 'les_plus']),
    unit: z.enum(['gastro', 'piece']),
    /** Colonne « VENTE POUR » du Sheet. */
    base_qty: positiveNumber,
    count_step: positiveNumber,
    min_mode: z.enum(['auto', 'manual']),
    min_divisor: positiveNumber,
    min_qty_manual: positiveNumber,
    floor_qty: positiveNumber,
    ceiling_qty: positiveNumber,
    /** 1 = le plus urgent, 5 = le moins. */
    priority: z.coerce.number().int().min(1).max(5),
    shelf_life_label: z.string().trim().max(20).nullable(),
    in_saladbar: z.boolean(),
    in_fridge: z.boolean(),
    sort_order: z.coerce.number().int(),
    is_active: z.boolean(),
    notes: z.string().trim().max(500).nullable(),
    // Adresse d'une photo. Vide : l'application affiche une vignette illustrée.
    image_url: z.union([z.url(), z.literal('')]).nullable(),
  })
  .refine((data) => data.count_step === null || data.count_step > 0, {
    message: 'Le pas de comptage doit être strictement positif.',
    path: ['count_step'],
  })
  .refine((data) => data.min_divisor === null || data.min_divisor > 0, {
    message: 'Le diviseur doit être strictement positif.',
    path: ['min_divisor'],
  })
  .refine((data) => data.in_saladbar || data.in_fridge, {
    message: 'Un produit doit être stocké au saladbar, au frigo, ou aux deux.',
    path: ['in_saladbar'],
  })
  .refine((data) => data.min_mode !== 'manual' || data.min_qty_manual !== null, {
    message: 'Renseignez le minimum en valeur absolue.',
    path: ['min_qty_manual'],
  })
  .refine(
    (data) =>
      data.floor_qty === null || data.ceiling_qty === null || data.floor_qty <= data.ceiling_qty,
    { message: 'Le plancher de cible ne peut pas dépasser le plafond.', path: ['ceiling_qty'] },
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
  const bool = (key: string) => formData.get(key) === 'on' || formData.get(key) === 'true';

  return {
    id: text('id') ?? undefined,
    name: String(formData.get('name') ?? ''),
    category_id: String(formData.get('category_id') ?? ''),
    family: String(formData.get('family') ?? 'mise_en_place'),
    unit: String(formData.get('unit') ?? 'gastro'),
    base_qty: text('base_qty'),
    count_step: text('count_step'),
    min_mode: String(formData.get('min_mode') ?? 'auto'),
    min_divisor: text('min_divisor'),
    min_qty_manual: text('min_qty_manual'),
    floor_qty: text('floor_qty'),
    ceiling_qty: text('ceiling_qty'),
    priority: String(formData.get('priority') ?? '3'),
    shelf_life_label: text('shelf_life_label'),
    in_saladbar: bool('in_saladbar'),
    in_fridge: bool('in_fridge'),
    sort_order: String(formData.get('sort_order') ?? '0'),
    is_active: bool('is_active'),
    notes: text('notes'),
    image_url: text('image_url'),
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

  const payload = {
    ...values,
    base_qty: values.base_qty ?? 0,
    count_step: values.count_step ?? 1,
    min_divisor: values.min_divisor ?? 2,
    // Le mode non retenu est vidé : pas de minimum manuel fantôme derrière un
    // produit repassé en automatique.
    min_qty_manual: values.min_mode === 'manual' ? values.min_qty_manual : null,
    image_url: values.image_url || null,
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
  return { success: true };
}

/**
 * Réglages modifiables en deux clics depuis le tableau, sans ouvrir de fiche.
 * Ce sont ceux que le directeur touchera le plus souvent.
 */
export async function updateProductInline(
  id: string,
  patch: {
    priority?: number;
    minMode?: 'auto' | 'manual';
    minQtyManual?: number | null;
    minDivisor?: number;
  },
): Promise<{ error?: string }> {
  const schema = z.object({
    priority: z.number().int().min(1).max(5).optional(),
    minMode: z.enum(['auto', 'manual']).optional(),
    minQtyManual: z.number().min(0).nullable().optional(),
    minDivisor: z.number().positive().optional(),
  });

  const parsed = schema.safeParse(patch);
  if (!parsed.success) return { error: 'Valeur invalide.' };

  const payload: Partial<{
    priority: number;
    min_divisor: number;
    min_mode: 'auto' | 'manual';
    min_qty_manual: number | null;
  }> = {};
  if (parsed.data.priority !== undefined) payload.priority = parsed.data.priority;
  if (parsed.data.minDivisor !== undefined) payload.min_divisor = parsed.data.minDivisor;
  if (parsed.data.minMode !== undefined) {
    payload.min_mode = parsed.data.minMode;
    // Repasser en automatique efface le minimum manuel.
    if (parsed.data.minMode === 'auto') payload.min_qty_manual = null;
  }
  if (parsed.data.minQtyManual !== undefined) payload.min_qty_manual = parsed.data.minQtyManual;

  if (Object.keys(payload).length === 0) return {};

  const supabase = await createClient();
  const { error } = await supabase.from('products').update(payload).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/admin/produits');
  return {};
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
