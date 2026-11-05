// Service Worker: macht die App installierbar, startet sie ohne Netz und zeigt Mitteilungen.
// Strategie „erst Netz, dann Zwischenspeicher“: Neue Versionen kommen sofort an.

// Auf dieser Domain liegt auch Wir zwei. Darum nur Caches mit dem Präfix „tb-“ anfassen.
const SPEICHER = 'tb-v5';
const GRUNDGERUEST = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/dashboard.js',
  './js/konfig.js',
  './js/vendor/supabase-2.45.4.js',
  './icons/icon.svg',
  './icons/icon-192.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(SPEICHER)
      .then((c) => c.addAll(GRUNDGERUEST.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n.startsWith('tb-') && n !== SPEICHER).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('push', (ev) => {
  let daten = {};
  try { daten = ev.data?.json() ?? {}; } catch { daten = { text: ev.data?.text() }; }
  ev.waitUntil(self.registration.showNotification(daten.titel || 'Trading Bot', {
    body: daten.text || 'Es gibt etwas Neues.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: daten.art || 'lauf',
    renotify: true,
    data: { ziel: daten.ziel || './#bot' },
  }));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const ziel = new URL(ev.notification.data?.ziel || './#bot', self.registration.scope).href;
  ev.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of fenster) {
      if ('focus' in f) {
        await f.focus();
        f.postMessage({ ziel });
        return;
      }
    }
    await self.clients.openWindow(ziel);
  })());
});

self.addEventListener('fetch', (ev) => {
  const anfrage = ev.request;
  // Nur eigene Dateien; Supabase läuft ungestört am Service Worker vorbei.
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== self.location.origin) return;
  ev.respondWith(
    fetch(anfrage.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(SPEICHER).then((c) => c.put(anfrage, kopie));
        }
        return antwort;
      })
      .catch(async () => {
        const speicher = await caches.open(SPEICHER);
        const treffer = await speicher.match(anfrage);
        if (treffer) return treffer;
        if (anfrage.mode === 'navigate') return (await speicher.match('./index.html')) ?? Response.error();
        return Response.error();
      }),
  );
});
