/**
 * Service worker de l'application de mise en place.
 *
 * Objectif unique : permettre à un employé de compter dans une chambre froide
 * ou au sous-sol, sans réseau. Ce n'est pas un cache de performance.
 *
 * Stratégies :
 *   • ressources statiques (/_next/static, icônes) → cache d'abord, elles sont
 *     versionnées par leur nom et ne changent jamais sous un même URL ;
 *   • navigations → réseau d'abord, cache en secours, puis page hors ligne ;
 *   • tout le reste (Server Actions, RSC, appels Supabase) → réseau seul.
 *
 * Rien qui ressemble à une écriture n'est mis en cache : les saisies passent
 * par la file IndexedDB de l'application, pas par ici.
 */

const VERSION = 'mep-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGES_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/hors-ligne';

/**
 * Ce fichier ne change pas d'une publication à l'autre : le navigateur ne
 * voit donc aucune raison de le réinstaller, et les pages déjà en cache
 * survivent aux déploiements. C'est l'application qui lui annonce la
 * version qu'elle vient de charger ; dès qu'elle diffère de la dernière
 * connue, tout est jeté.
 */
const BUILD_KEY = 'mep-build';

/** Seules ces pages sont conservées pour un usage hors ligne. */
const OFFLINE_ROUTES = [/^\/$/, /^\/comptage\/[^/]+$/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll([OFFLINE_URL, '/icons/icon-192.png', '/manifest.webmanifest']),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function purgerTout() {
  return caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
}

/**
 * Retient la version publiée dans le cache lui-même : un service worker
 * s'arrête entre deux événements, une variable ne survivrait pas.
 */
async function versionConnue() {
  const cache = await caches.open(BUILD_KEY);
  const reponse = await cache.match('/build');
  return reponse ? reponse.text() : null;
}

async function retenirVersion(build) {
  const cache = await caches.open(BUILD_KEY);
  await cache.put('/build', new Response(build));
}

self.addEventListener('message', (event) => {
  const data = event.data;

  // Purge demandée par l'application (déconnexion).
  if (data === 'mep:clear-cache') {
    event.waitUntil(purgerTout());
    return;
  }

  // L'application annonce la version qu'elle vient de charger.
  if (data && data.type === 'mep:version' && typeof data.build === 'string') {
    event.waitUntil(
      (async () => {
        const connue = await versionConnue();
        if (connue === data.build) return;
        // Nouvelle publication : les pages en cache pointent vers des
        // fichiers qui n'existent plus. On repart de zéro.
        await purgerTout();
        await retenirVersion(data.build);
      })(),
    );
  }
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/splash/')
  );
}

function isCacheableRoute(url) {
  return OFFLINE_ROUTES.some((pattern) => pattern.test(url.pathname));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // On ne touche jamais aux écritures ni aux requêtes d'une autre origine.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Une redirection vers /connexion ne doit jamais être mise en cache :
          // elle enfermerait l'employé sur un écran de connexion hors ligne.
          if (response.ok && isCacheableRoute(url) && !response.redirected) {
            const copy = response.clone();
            caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          return cached ?? caches.match(OFFLINE_URL);
        }),
    );
  }
});

/* ---------------------------------------------------------------------
   Rappels de comptage.

   Sur iPhone, les notifications ne fonctionnent que si l'application a été
   ajoutée à l'écran d'accueil (iOS 16.4+).
   --------------------------------------------------------------------- */

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Mise en place';
  const options = {
    body: payload.body || 'Un comptage est à faire.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    lang: 'fr',
    tag: payload.tag || 'mep-rappel',
    // Un second rappel remplace le premier plutôt que d'empiler les bulles.
    renotify: true,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Si l'application est déjà ouverte, on la ramène au premier plan
      // plutôt que d'ouvrir une seconde fenêtre.
      for (const client of clients) {
        if (client.url.includes(target) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
