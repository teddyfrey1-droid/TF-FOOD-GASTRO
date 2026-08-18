import { NextRequest } from 'next/server';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/server';
import type { SessionKind } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Envoi des rappels de comptage.
 *
 * Appelée par une tâche planifiée (Vercel Cron, ou `pg_cron` côté Supabase)
 * aux heures configurées dans le back-office. Ne notifie que si le comptage
 * n'a pas déjà été validé.
 *
 * Protection : l'appelant doit présenter `CRON_SECRET`. Sans ce secret, la
 * route est un moyen d'envoyer des notifications à toute l'équipe.
 */

const MESSAGES: Record<SessionKind, { title: string; body: string; url: string }> = {
  morning: {
    title: 'Comptage du matin',
    body: 'La mise en place de la journée est à compter.',
    url: '/comptage/matin',
  },
  afternoon: {
    title: "Comptage de l'après-midi",
    body: 'Le service du midi est passé : à compter pour préparer le soir.',
    url: '/comptage/apres-midi',
  },
};

function configureVapid(): string | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return 'Clés VAPID absentes : voir NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT.';
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return null;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: 'CRON_SECRET n’est pas configurée.' }, { status: 500 });
  }

  const authorization = request.headers.get('authorization');
  if (authorization !== `Bearer ${secret}`) {
    return Response.json({ error: 'Accès refusé.' }, { status: 401 });
  }

  const session = request.nextUrl.searchParams.get('session');
  if (session !== 'morning' && session !== 'afternoon') {
    return Response.json(
      { error: 'Paramètre `session` attendu : morning ou afternoon.' },
      { status: 400 },
    );
  }

  const vapidError = configureVapid();
  if (vapidError) return Response.json({ error: vapidError }, { status: 500 });

  // Clé de service : la tâche planifiée n'a pas de session utilisateur.
  const supabase = createAdminClient();

  // L'ordonnanceur raisonne en UTC et nous appelle toutes les demi-heures ;
  // c'est la base qui décide si l'heure de Paris est venue, et qui garantit
  // un seul envoi par jour même en cas d'appels concurrents.
  const { data: claimed, error: claimError } = await supabase.rpc('mep_claim_reminder', {
    p_session: session,
  });

  if (claimError) return Response.json({ error: claimError.message }, { status: 500 });
  if (!claimed) {
    return Response.json({ sent: 0, reason: 'Heure non atteinte, ou rappel déjà envoyé.' });
  }

  const { data: targets, error } = await supabase.rpc('mep_pending_reminders', {
    p_session: session,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!targets || targets.length === 0) {
    return Response.json({ sent: 0, reason: 'Comptage déjà validé, ou aucun appareil inscrit.' });
  }

  const message = MESSAGES[session];
  const payload = JSON.stringify({ ...message, tag: `mep-${session}` });

  let sent = 0;
  const revoked: string[] = [];

  await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          payload,
        );
        sent += 1;
      } catch (cause: unknown) {
        // 404 / 410 : l'appareil s'est désinscrit ou l'application a été
        // supprimée. On marque l'abonnement mort au lieu de réessayer chaque jour.
        const status = (cause as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) revoked.push(target.subscription_id);
      }
    }),
  );

  if (revoked.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ revoked_at: new Date().toISOString() })
      .in('id', revoked);
  }

  await supabase
    .from('push_subscriptions')
    .update({ last_used_at: new Date().toISOString() })
    .in(
      'id',
      targets.map((target) => target.subscription_id).filter((id) => !revoked.includes(id)),
    );

  return Response.json({ sent, revoked: revoked.length });
}
