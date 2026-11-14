/* Bladr service worker: gør appen tilgængelig offline og giver besked om nye versioner. */
const VERSION = '2026.11.14-1716';
const CACHE = 'bladr-' + VERSION;
const ASSETS = [
  './', 'index.html', 'pwa.js', 'manifest.webmanifest',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/pdf-lib.min.js', 'vendor/xlsx.full.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png',
  'vendor/fonts/ibm-plex-sans-latin-400-normal.woff2', 'vendor/fonts/ibm-plex-sans-latin-500-normal.woff2',
  'vendor/fonts/ibm-plex-sans-latin-600-normal.woff2', 'vendor/fonts/ibm-plex-mono-latin-400-normal.woff2',
  'vendor/fonts/ibm-plex-mono-latin-500-normal.woff2', 'vendor/fonts/caveat-latin-500-normal.woff2',
  'vendor/fonts/dancing-script-latin-500-normal.woff2', 'vendor/fonts/great-vibes-latin-400-normal.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bladr-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(CACHE)
        .then((c) => c.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? c.match('./') : null)))
        .then((hit) => hit || fetch(req))
    );
    return;
  }
  /* Alt andet (andre adresser) håndteres ikke: den installerede udgave henter intet udefra. */
});
