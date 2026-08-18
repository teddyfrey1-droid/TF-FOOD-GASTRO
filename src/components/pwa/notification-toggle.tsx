'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getVapidPublicKey,
  serializeSubscription,
  urlBase64ToUint8Array,
} from '@/lib/pwa/push';
import { removePushSubscription, savePushSubscription } from '@/app/notifications/actions';

type State = 'chargement' | 'indisponible' | 'a-installer' | 'inactif' | 'actif' | 'refuse';

/**
 * Active les rappels de comptage sur cet appareil.
 *
 * Particularité iPhone : les notifications web ne fonctionnent que si
 * l'application a été ajoutée à l'écran d'accueil. On le dit clairement plutôt
 * que d'afficher un bouton qui échouerait sans explication.
 */
export function NotificationToggle() {
  const [state, setState] = useState<State>('chargement');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function detect() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        // Sur iPhone, l'API n'apparaît qu'une fois l'application installée.
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const standalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true;
        setState(isIOS && !standalone ? 'a-installer' : 'indisponible');
        return;
      }

      if (!getVapidPublicKey()) {
        setState('indisponible');
        return;
      }

      if (Notification.permission === 'denied') {
        setState('refuse');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? 'actif' : 'inactif');
    }

    void detect();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'refuse' : 'inactif');
        return;
      }

      const key = getVapidPublicKey();
      if (!key) return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });

      const serialized = serializeSubscription(subscription);
      if (!serialized) return;

      const result = await savePushSubscription({
        ...serialized,
        userAgent: navigator.userAgent,
      });
      setState(result.error ? 'inactif' : 'actif');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('inactif');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'chargement' || state === 'indisponible') return null;

  if (state === 'a-installer') {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-xs">
        Pour recevoir les rappels de comptage, ajoutez d&apos;abord MEP à votre écran d&apos;accueil :
        bouton <strong>Partager</strong> puis <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
      </p>
    );
  }

  if (state === 'refuse') {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-xs">
        Les notifications sont bloquées pour cette application. Réactivez-les dans les réglages de
        votre téléphone pour recevoir les rappels.
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={state === 'actif' ? disable : enable}
      className="h-11 w-full"
    >
      {state === 'actif' ? <BellOff className="size-4" /> : <Bell className="size-4" />}
      {busy
        ? 'Un instant…'
        : state === 'actif'
          ? 'Désactiver les rappels'
          : 'Activer les rappels de comptage'}
    </Button>
  );
}
