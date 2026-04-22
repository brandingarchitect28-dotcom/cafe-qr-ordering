/**
 * service-worker.js
 * Branding Architect — Production PWA Service Worker
 * Version: 2.0.0
 *
 * Strategy:
 *  - Cache-first  → JS, CSS, fonts, icons, static assets
 *  - Network-first → HTML navigation pages (always fresh)
 *  - Network-only  → Firebase, Firestore, APIs, auth, payments, real-time routes
 *  - Offline page  → shown only when network fails on a navigation request
 *
 * ⚠️  NEVER caches:
 *      - Firestore / Firebase Auth / Firebase Storage
 *      - Cashfree payment SDK calls
 *      - Any /api/* endpoint
 *      - /track/, /kitchen/, /invoice/, /cafe/ (real-time pages)
 *      - /login, /logout, /auth
 */

// ─── CACHE VERSIONING ────────────────────────────────────────────────────────
// Bump this string whenever you deploy new static assets.
// Old cache is automatically purged in the activate handler.
const CACHE_VERSION = 'ba-static-v2';
const CACHE_NAME    = CACHE_VERSION;
const OFFLINE_URL   = '/offline.html';

// ─── Static assets to pre-cache on install ───────────────────────────────────
// Keep this list small — only the true "app shell" that must work offline.
// Missing files are skipped gracefully (Promise.allSettled) so they never
// block the install phase.
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// ─── Patterns that must ALWAYS go to the network — never cached ───────────────
const NETWORK_ONLY_PATTERNS = [
  // Firebase / Firestore / Auth
  /firestore\.googleapis\.com/,
  /firebase\.googleapis\.com/,
  /identitytoolkit\.googleapis\.com/,
  /securetoken\.googleapis\.com/,
  /firebasestorage\.googleapis\.com/,
  /fcm\.googleapis\.com/,

  // Cashfree payment processing
  /cashfree\.com/,
  /sdk\.cashfree\.com/,

  // Render backend API
  /onrender\.com/,
  /\/api\//,

  // Real-time / dynamic routes (navigation)
  /\/track\//,
  /\/kitchen\//,
  /\/invoice\//,
  /\/cafe\//,

  // Auth routes
  /\/login/,
  /\/logout/,
  /\/auth/,

  // Google Fonts CSS (not the font files themselves)
  /fonts\.googleapis\.com\/css/,
];

// ─── Helper: does a URL match any network-only pattern? ───────────────────────
function isNetworkOnly(url) {
  return NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url));
}

// ─── Helper: is this a cacheable static asset? ────────────────────────────────
function isStaticAsset(url) {
  const pathname = new URL(url).pathname;
  const hostname = new URL(url).hostname;
  return (
    /\.(js|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|ico)(\?.*)?$/.test(pathname) ||
    hostname === 'fonts.gstatic.com' // Google Fonts binary files (not the CSS)
  );
}

// ─── Helper: safe cache put — never stores opaque / error responses ───────────
function safeCachePut(cache, request, response) {
  if (
    response &&
    response.status === 200 &&
    (response.type === 'basic' || response.type === 'cors')
  ) {
    cache.put(request, response.clone());
  }
}

// ─── INSTALL ─────────────────────────────────────────────────────────────────
// Pre-cache the app shell. Missing assets are skipped silently so a single
// 404 cannot brick the install phase.
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_VERSION);

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          PRECACHE_URLS.map((url) =>
            cache.add(url).catch((err) => {
              console.warn('[SW] Pre-cache skipped:', url, err.message);
            })
          )
        )
      )
      .then(() => {
        console.log('[SW] Install complete — skipping waiting');
        // Take control immediately without waiting for old tabs to close.
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
// Delete ALL old caches whose name doesn't match CACHE_NAME.
// Then claim all open clients so the new SW controls them right away.
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating version:', CACHE_VERSION);

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log('[SW] Purging old cache:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => {
        console.log('[SW] Activation complete — claiming clients');
        return self.clients.claim();
      })
      .catch((err) => {
        console.error('[SW] Activate error:', err);
      })
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // 1. Only intercept GET — never touch POST / PUT / DELETE / PATCH
  if (request.method !== 'GET') return;

  // 2. Only intercept http / https — skip chrome-extension://, data:, blob:
  if (!url.startsWith('http')) return;

  // 3. Network-only bypass — Firebase, Cashfree, APIs, real-time routes
  //    Pure pass-through: no cache read, no cache write.
  if (isNetworkOnly(url)) return;

  // 4. Navigation requests (HTML pages) — Network-first with offline fallback
  //    Always try to serve fresh HTML. Cache the response for the offline
  //    fallback but NEVER serve stale HTML from cache as primary response.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Store a fresh copy for offline fallback
          caches.open(CACHE_NAME).then((cache) => {
            safeCachePut(cache, request, response);
          });
          return response;
        })
        .catch(() => {
          // Network failed — try the cached version, else serve offline page
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match(OFFLINE_URL).then(
              (offlinePage) =>
                offlinePage ||
                new Response(
                  '<!DOCTYPE html><html><head><title>Offline</title></head><body>' +
                  '<h1>You are offline</h1><p>Please check your internet connection.</p>' +
                  '</body></html>',
                  { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                )
            );
          });
        })
    );
    return;
  }

  // 5. Static assets — Cache-first
  //    JS, CSS, images, fonts, icons. Fetched once, served from cache forever
  //    until CACHE_VERSION is bumped and the old cache is purged.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        // Not in cache — fetch, store, and return
        return fetch(request)
          .then((response) => {
            caches.open(CACHE_NAME).then((cache) => {
              safeCachePut(cache, request, response);
            });
            return response;
          })
          .catch(() =>
            // Static asset failed and not cached — clean 503
            new Response('', {
              status: 503,
              statusText: 'Service Unavailable',
            })
          );
      })
    );
    return;
  }

  // 6. Everything else — pure network pass-through, no caching.
  //    Covers: unknown dynamic routes, third-party scripts not yet categorised.
  //    Intentionally returns without calling event.respondWith() so the browser
  //    handles it normally.
});
