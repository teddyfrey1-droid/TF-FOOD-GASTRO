'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const percent = z
  .union([z.string(), z.number()])
  .transform((value) => Number(String(value).trim().replace(',', '.')))
  .refine((value) => Number.isFinite(value), 'Nombre invalide.');

const settingsSchema = z.object({
  growth_rate: percent.refine((v) => v > -1, 'Le taux de croissance doit être supérieur à −100 %.'),
  safety_margin: percent.refine((v) => v >= 0, 'La marge de sécurité ne peut pas être négative.'),
  afternoon_target_ratio: percent.refine((v) => v >= 0, 'Le coefficient doit être positif.'),
  default_reorder_ratio: percent.refine(
    (v) => v >= 0 && v <= 1,
    'Le ratio de seuil doit être compris entre 0 et 1.',
  ),
  // Vide = « je ne sais pas » : on préfère une colonne sans valeur à un
  // chiffre inventé qui aurait l'air d'une mesure.
  lunch_revenue_share: z
    .union([z.string(), z.number(), z.null()])
    .transform((value) => {
      const text = String(value ?? '').trim().replace(',', '.');
      return text === '' ? null : Number(text);
    })
    .refine(
      (value) => value === null || (Number.isFinite(value) && value > 0 && value <= 1),
      'La part du midi doit être comprise entre 0 et 1 (0,6 = 60 %).',
    ),
  show_targets_to_employees: z.boolean(),
  morning_reminder_time: z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
  afternoon_reminder_time: z.string().regex(/^\d{2}:\d{2}$/, 'Heure invalide.'),
});

export interface SettingsState {
  error?: string;
  success?: boolean;
}

export async function saveRevenueSettings(
  _state: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = settingsSchema.safeParse({
    growth_rate: formData.get('growth_rate') ?? '0',
    safety_margin: formData.get('safety_margin') ?? '0.1',
    afternoon_target_ratio: formData.get('afternoon_target_ratio') ?? '1',
    default_reorder_ratio: formData.get('default_reorder_ratio') ?? '0.5',
    lunch_revenue_share: formData.get('lunch_revenue_share') ?? null,
    show_targets_to_employees: formData.get('show_targets_to_employees') === 'on',
    morning_reminder_time: String(formData.get('morning_reminder_time') ?? '07:30'),
    afternoon_reminder_time: String(formData.get('afternoon_reminder_time') ?? '15:00'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Réglages invalides.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('revenue_settings').update(parsed.data).eq('id', true);

  if (error) return { error: `Enregistrement impossible : ${error.message}` };

  revalidatePath('/admin/chiffre-affaires');
  revalidatePath('/admin');
  return { success: true };
}

const forecastSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coefficient: z
    .union([z.string(), z.number()])
    .transform((value) => Number(String(value).trim().replace(',', '.')))
    .refine((value) => Number.isFinite(value) && value >= 0, 'Coefficient invalide.'),
  forecast_revenue: z
    .union([z.string(), z.number(), z.null()])
    .transform((value) => {
      const text = String(value ?? '').trim().replace(',', '.');
      return text === '' ? null : Number(text);
    })
    .refine((value) => value === null || (Number.isFinite(value) && value >= 0), 'CA invalide.'),
  is_closed_day: z.boolean(),
});

/**
 * Écrit le réglage d'une journée : coefficient, écrasement manuel du CA,
 * marquage jour de fermeture. `source` passe à 'manual' dès qu'un CA est saisi
 * à la main — c'est lui qui gagne alors sur le calcul automatique.
 */
export async function saveDayForecast(input: z.input<typeof forecastSchema>): Promise<{
  error?: string;
}> {
  const parsed = forecastSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Valeurs invalides.' };

  const supabase = await createClient();
  const { error } = await supabase.from('daily_forecast').upsert(
    {
      date: parsed.data.date,
      coefficient: parsed.data.coefficient,
      forecast_revenue: parsed.data.forecast_revenue,
      source: parsed.data.forecast_revenue === null ? 'auto' : 'manual',
      is_closed_day: parsed.data.is_closed_day,
    },
    { onConflict: 'date' },
  );

  if (error) return { error: error.message };

  revalidatePath('/admin/chiffre-affaires');
  revalidatePath('/admin');
  return {};
}

const actualSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  revenue_ht: z
    .union([z.string(), z.number()])
    .transform((value) => Number(String(value).trim().replace(',', '.')))
    .refine((value) => Number.isFinite(value) && value >= 0, 'CA invalide.'),
  revenue_lunch_ht: z
    .union([z.string(), z.number(), z.null()])
    .transform((value) => {
      const text = String(value ?? '').trim().replace(',', '.');
      return text === '' ? null : Number(text);
    })
    .refine((value) => value === null || (Number.isFinite(value) && value >= 0), 'CA midi invalide.'),
});

/** Saisie a posteriori du CA réellement réalisé. */
export async function saveActualRevenue(input: z.input<typeof actualSchema>): Promise<{
  error?: string;
}> {
  const parsed = actualSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Valeurs invalides.' };

  const supabase = await createClient();
  const { error } = await supabase.from('revenue_actuals').upsert(parsed.data, {
    onConflict: 'date',
  });

  if (error) return { error: error.message };

  revalidatePath('/admin/chiffre-affaires');
  return {};
}
