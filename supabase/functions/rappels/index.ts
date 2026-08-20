/**
 * Rappels de comptage — fonction Edge.
 *
 * « Il est 15 h, le comptage de l'après-midi n'est pas fait. »
 *
 * Pourquoi ici plutôt que sur l'hébergeur du site :
 *
 *   • la clé de service est injectée d'office dans une fonction Edge ; il
 *     n'y a donc aucune valeur secrète à poser à la main quelque part ;
 *   • le plan Hobby de Vercel n'autorise qu'UN déclenchement par jour et
 *     par tâche, ce qui obligeait à caler les rappels sur l'heure d'hiver
 *     — et à les envoyer une heure trop tard six mois par an. `pg_cron`
 *     réveille cette fonction toutes les quinze minutes, et c'est la base
 *     qui décide si l'heure de Paris est venue.
 *
 *
 * AUTHENTIFICATION : la vérification de JWT est désactivée, car `pg_cron`
 * ne dispose d'aucun jeton d'utilisateur. Elle est remplacée par un secret
 * partagé, gardé au coffre-fort de la base. Sans ce contrôle, l'adresse de
 * la fonction serait un moyen de notifier toute l'équipe à volonté.
 */

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'jsr:@supabase/supabase-js@2';

type SessionKind = 'morning' | 'afternoon';

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

const SITE = 'https://tf-food-gastro.vercel.app';

/**
 * Comparaison à durée constante.
 *
 * Un `===` s'arrête au premier caractère différent : le temps de réponse
 * trahit alors le nombre de caractères devinés, et le secret se retrouve
 * par tâtonnement.
 */
function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let ecart = 0;
  for (let i = 0; i < a.length; i += 1) ecart |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return ecart === 0;
}

Deno.serve(async (request: Request) => {
  // La clé de service est injectée par la plateforme : rien à configurer.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: attendu } = await supabase.rpc('mep_rappels_secret');
  const presente = request.headers.get('x-rappels-secret') ?? '';

  if (!attendu || !memeSecret(presente, attendu)) {
    return Response.json({ erreur: 'Accès refusé.' }, { status: 401 });
  }

  const { data: cles, error: erreurCles } = await supabase.rpc('mep_vapid_keys').single();
  if (erreurCles || !cles?.private_key) {
    return Response.json(
      { erreur: `Clés VAPID illisibles : ${erreurCles?.message ?? 'coffre-fort vide'}` },
      { status: 500 },
    );
  }

  webpush.setVapidDetails('mailto:teddy.frey1@gmail.com', cles.public_key, cles.private_key);

  const envois: Record<string, unknown>[] = [];

  for (const session of ['morning', 'afternoon'] as const) {
    // `mep_claim_reminder` fait DEUX choses : elle vérifie que l'heure de
    // Paris est venue, et elle réserve l'envoi. Elle ne dit vrai qu'une
    // seule fois par jour et par session — c'est ce qui permet de la
    // réveiller toutes les quinze minutes sans envoyer vingt rappels.
    const { data: aEnvoyer } = await supabase.rpc('mep_claim_reminder', { p_session: session });
    if (!aEnvoyer) continue;

    const { data: abonnements } = await supabase.rpc('mep_pending_reminders', {
      p_session: session,
    });

    const message = MESSAGES[session];
    let succes = 0;
    let revoques = 0;

    for (const abonnement of abonnements ?? []) {
      try {
        await webpush.sendNotification(
          {
            endpoint: abonnement.endpoint,
            keys: { p256dh: abonnement.p256dh, auth: abonnement.auth },
          },
          JSON.stringify({ ...message, url: `${SITE}${message.url}` }),
        );
        succes += 1;

        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', abonnement.subscription_id);
      } catch (erreur) {
        const statut = (erreur as { statusCode?: number }).statusCode;

        // 404 / 410 : l'abonnement est mort — application désinstallée, ou
        // notifications coupées. On le marque, sinon on réessaierait tous
        // les jours pour rien.
        if (statut === 404 || statut === 410) {
          await supabase
            .from('push_subscriptions')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', abonnement.subscription_id);
          revoques += 1;
        }
      }
    }

    envois.push({ session, envoyes: succes, abonnements_revoques: revoques });
  }

  return Response.json({ ok: true, envois });
});
