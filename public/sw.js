// =====================================================================================
//  DominicaHealthLink — service worker
//  Strategy:
//   · navigations (index.html): network-first, cache fallback → the app opens offline
//     and updates propagate as soon as the network is back;
//   · same-origin static assets (hashed js/css, icons): cache-first → instant repeat
//     loads; hashed filenames make stale entries impossible;
//   · Google Fonts: cache-first (css is opaque, cached anyway — standard font pattern);
//   · Firebase Auth/Firestore/Storage API traffic: NEVER intercepted.
//  Bump CACHE_VERSION to drop every old cache on the next activation.
// =====================================================================================
const CACHE_VERSION = 'dhl-cache-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(request, response) {
  const copy = response.clone();
  caches.open(CACHE_VERSION).then((c) => c.put(request, copy)).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const sameOrigin = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.indexOf(url.hostname) >= 0;
  // Anything else cross-origin (firestore.googleapis.com, identitytoolkit, storage, …)
  // goes straight to the network untouched.
  if (!sameOrigin && !isFont) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) cachePut(req, res); return res; })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(self.registration.scope)))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Opaque responses (status 0) are normal for the no-cors font stylesheet.
        if (res.ok || (isFont && res.type === 'opaque')) cachePut(req, res);
        return res;
      });
    })
  );
});
