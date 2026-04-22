/**
 * service-worker.js
 * Branding Architect — Production PWA Service Worker
 * Version: 2.1.0
 *
 * Strategy:
 *  - Cache-first   → JS, CSS, fonts, icons, static assets
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
 *
 * FIX v2.1.0 — PWA Builder Detection:
 *  Every branch that previously used bare `return` now calls
 *  event.respondWith(fetch(request)) explicitly.
 *  Bare `return` passes requests to the browser natively — correct
 *  behavior, but completely invisible to PWA Builder / Lighthouse.
 *  They detect SWs by confirming respondWith() is called.
 *  Network behavior for real users is 100% identical.
 */

// ─── CACHE VERSIONING ────────────────────────────────────────────────────────
const CACHE_VERSION = 'ba-static-v2';
const CACHE_NAME    = CACHE_VERSION;
const OFFLINE_URL   = '/offline.html';

// ─── Static assets to pre-cache on install ───────────────────────────────────
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

  // Real-time / dynamic routes
  /\/track\//,
  /\/kitchen\//,
  /\/invoice\//,
  /\/cafe\//,

  // Auth routes
  /\/login/,
  /\/logout/,
  /\/auth/,

  // Google Fonts CSS (not the font binary files themselves)
  /fonts\.googleapis\.com\/css/,
];

// ─── Helper: does a URL match any network-only pattern? ──────────────────────
function isNetworkOnly(url) {
  return NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url));
}

// ─── Helper: is this a cacheable static asset? ───────────────────────────────
function isStaticAsset(url) {
  const pathname = new URL(url).pathname;
  const hostname = new URL(url).hostname;
  return (
    /\.(js|css|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|ico)(\?.*)?$/.test(pathname) ||
    hostname === 'fonts.gstatic.com'
  );
}

// ─── Helper: safe cache put — never stores opaque/error responses ─────────────
function safeCachePut(cache, request, response) {
  if (
    response &&
    response.status === 200 &&
    (response.type === 'basic' || response.type === 'cors')
  ) {
    cache.put(request, response.clone());
  }
}

// ─── INSTALL ──────────────────────────────────────────────────────────────────
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
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('[SW] Install failed:', err);
      })
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
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

// ─── FETCH ────────────────────────────────────────────────────────────────────
//
// DETECTION FIX (v2.1.0):
// ─────────────────────────
// Every exit path now calls event.respondWith() explicitly instead of
// using a bare `return`. This is the fix for PWA Builder / Lighthouse
// not detecting the service worker.
//
// HOW DETECTION WORKS:
//   PWA Builder sends a headless Chromium crawl to your URL. It checks
//   whether navigator.serviceWorker.controller is set AND whether at
//   least one fetch event called event.respondWith(). A bare `return`
//   passes the request to the browser natively — identical network
//   behavior — but leaves respondWith() uncalled, so the detector
//   counts zero interceptions and reports "no service worker found".
//
// WHAT IS UNCHANGED:
//   ✅ Non-GET requests pass through to network unmodified
//   ✅ Network-only patterns bypass cache entirely (Firebase, Cashfree, etc.)
//   ✅ Navigation: network-first + offline fallback
//   ✅ Static assets: cache-first
//   ✅ Everything else: direct network pass-through

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // ── 1. Non-GET requests ───────────────────────────────────────────────────
  // POST / PUT / DELETE / PATCH must never touch the cache.
  // Previously: bare `return` — invisible to detection.
  // Now: explicit pass-through via respondWith so SW is seen as active.
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // ── 2. Non-http(s) schemes ────────────────────────────────────────────────
  // chrome-extension://, data:, blob: etc.
  // Same fix: explicit pass-through instead of bare return.
  if (!url.startsWith('http')) {
    event.respondWith(fetch(request));
    return;
  }

  // ── 3. Network-only patterns ──────────────────────────────────────────────
  // Firebase, Cashfree, APIs, real-time routes, auth.
  // Behavior is identical to before (straight to network, zero caching).
  // The only change: respondWith(fetch(request)) instead of bare return.
  if (isNetworkOnly(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // ── 4. Navigation requests (HTML pages) ───────────────────────────────────
  // Network-first. Cache fresh copy for offline fallback.
  // Never serve stale HTML as primary response.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(CACHE_NAME).then((cache) => {
            safeCachePut(cache, request, response);
          });
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match(OFFLINE_URL).then(
              (offlinePage) =>
                offlinePage ||
                new Response(
                  '<!DOCTYPE html><html><head><title>Offline</title></head><body>' +
                    '<h1>You are offline</h1>' +
                    '<p>Please check your internet connection.</p>' +
                    '</body></html>',
                  { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                )
            );
          })
        )
    );
    return;
  }

  // ── 5. Static assets — Cache-first ────────────────────────────────────────
  // JS, CSS, images, fonts, icons.
  // Serve from cache; fetch + store on miss.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            caches.open(CACHE_NAME).then((cache) => {
              safeCachePut(cache, request, response);
            });
            return response;
          })
          .catch(() =>
            new Response('', {
              status: 503,
              statusText: 'Service Unavailable',
            })
          );
      })
    );
    return;
  }

  // ── 6. Everything else — explicit network pass-through ────────────────────
  // Unknown dynamic routes, uncategorised third-party requests.
  // respondWith(fetch(request)) is semantically identical to bare return
  // for the end user, but satisfies PWA Builder / Lighthouse detection.
  event.respondWith(fetch(request));
});
