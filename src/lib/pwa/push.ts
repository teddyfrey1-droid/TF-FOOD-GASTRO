/**
 * Clé publique VAPID de l'application.
 *
 * Elle est écrite ici EN CLAIR, et c'est correct : le navigateur la
 * transmet de toute façon au service de notifications, elle est publique
 * par construction. Seule sa jumelle privée signe les messages, et celle-là
 * vit au coffre-fort de la base, hors du dépôt.
 *
 * L'inscrire dans le code plutôt que dans une variable d'hébergeur évite
 * la seule chose qui restait à poser à la main pour que les rappels
 * fonctionnent.
 */
const CLE_PUBLIQUE_VAPID =
  'BHAiUD8ckLQ401igy87qYl8yPjaM6btdiZFlsWbdT75iCwAPZk8aKznIL_S8rJQ6_n2cPykpRfFcXUv0wfh2cOg';

/** Clé publique VAPID, exposée au navigateur (elle n'a rien de secret). */
export function getVapidPublicKey(): string | null {
  // La variable d'environnement reste prioritaire : elle permet de faire
  // tourner un second exemplaire de l'application avec ses propres clés.
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || CLE_PUBLIQUE_VAPID;
}

/** Le format attendu par `pushManager.subscribe` est un Uint8Array. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Extrait les clés d'un abonnement au format attendu par la base. */
export function serializeSubscription(subscription: PushSubscription): {
  endpoint: string;
  p256dh: string;
  auth: string;
} | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}
