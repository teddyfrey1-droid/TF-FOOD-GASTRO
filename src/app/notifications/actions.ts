'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  p256dh: z.string().min(1).max(300),
  auth: z.string().min(1).max(300),
  userAgent: z.string().max(400).optional(),
});

export type SubscriptionInput = z.input<typeof subscriptionSchema>;

/** Enregistre l'appareil courant pour recevoir les rappels de comptage. */
export async function savePushSubscription(
  input: SubscriptionInput,
): Promise<{ error?: string }> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { error: 'Abonnement invalide.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Authentification requise.' };

  // Un même appareil peut se réabonner après une révocation : on réactive
  // l'enregistrement existant plutôt que d'en créer un doublon.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      user_agent: parsed.data.userAgent ?? null,
      revoked_at: null,
    },
    { onConflict: 'endpoint' },
  );

  if (error) return { error: error.message };
  return {};
}

/** Retire l'appareil courant de la liste des rappels. */
export async function removePushSubscription(endpoint: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) return { error: error.message };
  return {};
}
