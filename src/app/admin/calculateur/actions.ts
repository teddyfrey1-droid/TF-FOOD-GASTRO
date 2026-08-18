'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { todayInParis } from '@/lib/format';

/**
 * Versionnage (§7.3) : on ne réécrit JAMAIS une règle en place quand elle a
 * déjà servi. On clôt l'ancienne à hier et on en ouvre une nouvelle à
 * aujourd'hui — l'historique de septembre reste lisible avec les règles de
 * septembre. Seule une règle créée le jour même est modifiée sur place, sinon
 * on empilerait des versions à chaque frappe.
 */
async function supersedeRule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  existingId: string,
  existingValidFrom: string,
  today: string,
): Promise<'update-in-place' | 'superseded'> {
  if (existingValidFrom === today) return 'update-in-place';

  await supabase
    .from('calculator_rules')
    .update({ valid_to: previousDay(today) })
    .eq('id', existingId);

  return 'superseded';
}

function previousDay(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

const cellSchema = z.object({
  productId: z.uuid(),
  caMin: z.number().nullable(),
  caMax: z.number().nullable(),
  /** null efface la cible de ce palier. */
  targetQty: z.number().min(0).nullable(),
});

export interface CalculatorActionResult {
  error?: string;
}

/** Écrit une cellule du tableau croisé (produit × palier de CA). */
export async function saveBracketCell(
  input: z.input<typeof cellSchema>,
): Promise<CalculatorActionResult> {
  const parsed = cellSchema.safeParse(input);
  if (!parsed.success) return { error: 'Valeur invalide.' };

  const { productId, caMin, caMax, targetQty } = parsed.data;
  const today = todayInParis();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('calculator_rules')
    .select('id, valid_from')
    .eq('product_id', productId)
    .eq('mode', 'bracket')
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .filter('ca_min', caMin === null ? 'is' : 'eq', caMin === null ? null : caMin)
    .filter('ca_max', caMax === null ? 'is' : 'eq', caMax === null ? null : caMax)
    .maybeSingle();

  if (existing) {
    const outcome = await supersedeRule(supabase, existing.id, existing.valid_from, today);

    if (outcome === 'update-in-place') {
      if (targetQty === null) {
        await supabase.from('calculator_rules').delete().eq('id', existing.id);
        revalidatePath('/admin/calculateur');
        return {};
      }
      const { error } = await supabase
        .from('calculator_rules')
        .update({ target_qty: targetQty })
        .eq('id', existing.id);
      if (error) return { error: error.message };
      revalidatePath('/admin/calculateur');
      return {};
    }
  }

  // Effacer une cellule qui n'existait pas : rien à faire.
  if (targetQty === null) {
    revalidatePath('/admin/calculateur');
    return {};
  }

  const { error } = await supabase.from('calculator_rules').insert({
    product_id: productId,
    mode: 'bracket',
    ca_min: caMin,
    ca_max: caMax,
    target_qty: targetQty,
    valid_from: today,
  });

  if (error) return { error: error.message };

  revalidatePath('/admin/calculateur');
  return {};
}

const ratioSchema = z.object({
  productId: z.uuid(),
  qtyPer1000Eur: z.number().min(0).nullable(),
});

/** Bascule un produit en mode ratio (« X gastros pour 1 000 € »). */
export async function saveRatioRule(
  input: z.input<typeof ratioSchema>,
): Promise<CalculatorActionResult> {
  const parsed = ratioSchema.safeParse(input);
  if (!parsed.success) return { error: 'Valeur invalide.' };

  const { productId, qtyPer1000Eur } = parsed.data;
  const today = todayInParis();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('calculator_rules')
    .select('id, valid_from')
    .eq('product_id', productId)
    .eq('mode', 'ratio')
    .lte('valid_from', today)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .maybeSingle();

  if (existing) {
    const outcome = await supersedeRule(supabase, existing.id, existing.valid_from, today);
    if (outcome === 'update-in-place') {
      if (qtyPer1000Eur === null) {
        await supabase.from('calculator_rules').delete().eq('id', existing.id);
      } else {
        await supabase
          .from('calculator_rules')
          .update({ qty_per_1000_eur: qtyPer1000Eur })
          .eq('id', existing.id);
      }
      revalidatePath('/admin/calculateur');
      return {};
    }
  }

  if (qtyPer1000Eur !== null) {
    const { error } = await supabase.from('calculator_rules').insert({
      product_id: productId,
      mode: 'ratio',
      qty_per_1000_eur: qtyPer1000Eur,
      valid_from: today,
    });
    if (error) return { error: error.message };
  }

  revalidatePath('/admin/calculateur');
  return {};
}
