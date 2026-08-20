'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Les catégories sont l'ossature de l'écran de comptage : elles décident de
 * l'ordre des rayons et donc du trajet de l'employé dans la cuisine.
 *
 * La RLS reste la protection réelle. Ces actions ne font que traduire un
 * refus (zéro ligne touchée) en une phrase compréhensible — sans quoi le
 * directeur verrait une opération « réussie » qui n'a rien changé.
 */

const nameSchema = z.string().trim().min(1, 'Le nom est obligatoire.').max(60);

function refusRls(): { error: string } {
  return { error: 'Seul un directeur ou le propriétaire peut modifier les catégories.' };
}

export async function createCategory(name: string): Promise<{ error?: string }> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();

  // La nouvelle catégorie se range en dernier plutôt qu'en tête : elle ne
  // doit pas bousculer un ordre de rayons déjà rodé.
  const { data: last } = await supabase
    .from('product_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from('product_categories')
    .insert({ name: parsed.data, sort_order: (Number(last?.sort_order) || 0) + 10 })
    .select('id');

  if (error) {
    return {
      error: error.code === '23505' ? 'Une catégorie porte déjà ce nom.' : error.message,
    };
  }
  if (!data || data.length === 0) return refusRls();

  revalidatePath('/admin/categories');
  revalidatePath('/admin/produits');
  return {};
}

export async function renameCategory(id: string, name: string): Promise<{ error?: string }> {
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (!z.uuid().safeParse(id).success) return { error: 'Catégorie invalide.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('product_categories')
    .update({ name: parsed.data })
    .eq('id', id)
    .select('id');

  if (error) {
    return {
      error: error.code === '23505' ? 'Une catégorie porte déjà ce nom.' : error.message,
    };
  }
  if (!data || data.length === 0) return refusRls();

  revalidatePath('/admin/categories');
  revalidatePath('/admin/produits');
  revalidatePath('/comptage', 'layout');
  return {};
}

/**
 * Supprimer une catégorie.
 *
 * Une catégorie qui porte encore des produits n'est PAS supprimable : la
 * clé étrangère refuserait de toute façon, et supprimer les produits avec
 * elle effacerait des comptages passés. Le directeur déplace d'abord ses
 * produits — l'écran lui propose la manœuvre.
 */
export async function deleteCategory(id: string): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(id).success) return { error: 'Catégorie invalide.' };

  const supabase = await createClient();

  const { count } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if ((count ?? 0) > 0) {
    return {
      error: `Cette catégorie contient encore ${count} produit${count! > 1 ? 's' : ''}. Déplacez-les d’abord dans une autre catégorie.`,
    };
  }

  const { data, error } = await supabase
    .from('product_categories')
    .delete()
    .eq('id', id)
    .select('id');

  if (error) return { error: error.message };
  if (!data || data.length === 0) return refusRls();

  revalidatePath('/admin/categories');
  revalidatePath('/admin/produits');
  revalidatePath('/comptage', 'layout');
  return {};
}

/** Déplace tous les produits d'une catégorie vers une autre. */
export async function moveCategoryProducts(
  fromId: string,
  toId: string,
): Promise<{ error?: string; moved?: number }> {
  if (!z.uuid().safeParse(fromId).success || !z.uuid().safeParse(toId).success) {
    return { error: 'Catégorie invalide.' };
  }
  if (fromId === toId) return { error: 'Choisissez une autre catégorie.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('products')
    .update({ category_id: toId })
    .eq('category_id', fromId)
    .select('id');

  if (error) return { error: error.message };
  if (!data || data.length === 0) return refusRls();

  revalidatePath('/admin/categories');
  revalidatePath('/admin/produits');
  revalidatePath('/comptage', 'layout');
  return { moved: data.length };
}

/** L'ordre des catégories est l'ordre des rayons : il se règle à la main. */
export async function moveCategory(id: string, direction: -1 | 1): Promise<{ error?: string }> {
  if (!z.uuid().safeParse(id).success) return { error: 'Catégorie invalide.' };

  const supabase = await createClient();
  const { data: all } = await supabase
    .from('product_categories')
    .select('id, sort_order')
    .order('sort_order', { ascending: true });

  const list = all ?? [];
  const index = list.findIndex((category) => category.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= list.length) return {};

  // On réécrit TOUTES les positions : les valeurs d'origine peuvent être
  // égales entre elles, auquel cas échanger deux nombres ne changerait rien.
  const reordered = [...list];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  const results = await Promise.all(
    reordered.map((category, position) =>
      supabase
        .from('product_categories')
        .update({ sort_order: (position + 1) * 10 })
        .eq('id', category.id)
        .select('id'),
    ),
  );

  if (results.every((result) => (result.data?.length ?? 0) === 0)) return refusRls();

  revalidatePath('/admin/categories');
  revalidatePath('/admin/produits');
  revalidatePath('/comptage', 'layout');
  return {};
}
