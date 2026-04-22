/**
 * service-worker.js
 * Branding Architect — Safe Minimal PWA Service Worker
 *
 * Strategy:
 *  - Cache-first  → JS, CSS, fonts, icons, static assets
 *  - Network-only → Firebase, Firestore, APIs, auth, payments, real-time routes
 *  - Offline page → shown only when network fails on a navigation request
 *
 * ⚠️  NEVER caches:
 *      - Firestore / Firebase Auth / Firebase Storage
 *      - Cashfree payment SDK calls
 *      - Any /api/* endpoint
 *      - /track/, /kitchen/, /invoice/ (real-time pages)
 */

const CACHE_NAME   = 'ba-static-v1';
const OFFLINE_URL  = '/offline.html';

// ─── Static assets to pre-cache on install ────────────────────────────────────
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

  // Your Render backend API
  /onrender\.com/,
  /\/api\//,

  // Real-time / dynamic routes (navigation)
  /\/track\//,
  /\/kitchen\//,
  /\/invoice\//,
  /\/cafe\//,

  // Auth
  /\/login/,
  /\/logout/,
  /\/auth/,

  // Google Fonts — served fresh (not critical to cache)
  /fonts\.googleapis\.com\/css/,
];

// ─── INSTALL — pre-cache only the safe static shell ──────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll fails silently per-file — use individual adds so one
      // missing file doesn't block the whole install
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Pre-cache skipped:', url, err.message);
          })
        )
      );
    }).then(() => {
      // Activate immediately — don't wait for old tabs to close
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVATE — clean up old caches ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH — the core routing logic ──────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Only handle GET requests — never intercept POST/PUT/DELETE
  if (request.method !== 'GET') return;

  // 2. Only handle http/https — skip chrome-extension etc.
  if (!url.protocol.startsWith('http')) return;

  // 3. Network-only check — if URL matches any blocked pattern, bypass cache
  const isNetworkOnly = NETWORK_ONLY_PATTERNS.some((pattern) =>
    pattern.test(request.url)
  );
  if (isNetworkOnly) {
    // Pure pass-through — no cache read, no cache write
    return;
  }

  // 4. Navigation requests (HTML pages) — Network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache successful responses
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Network failed — serve offline page
          return caches.match(OFFLINE_URL).then(
            (cached) => cached || new Response(
              '<h1>You are offline</h1><p>Please check your connection.</p>',
              { headers: { 'Content-Type': 'text/html' } }
            )
          );
        })
    );
    return;
  }

  // 5. Static assets — Cache-first (JS, CSS, images, fonts, icons)
  const isStaticAsset =
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|woff2?|ttf|ico)$/) ||
    url.hostname === 'fonts.gstatic.com'; // Google Fonts files (not CSS)

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        // Not in cache — fetch and store
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => {
          // Static asset failed and not cached — nothing we can do
          return new Response('', { status: 408 });
        });
      })
    );
    return;
  }

  // 6. Everything else — network only, no caching
  // (covers any pattern not explicitly handled above)
  return;
});
