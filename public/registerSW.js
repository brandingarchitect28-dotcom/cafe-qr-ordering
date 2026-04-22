/**
 * registerSW.js
 * Branding Architect — Production Service Worker Registration
 * Version: 2.1.0
 *
 * HOW TO LOAD THIS FILE — pick ONE:
 * ──────────────────────────────────
 * Option A — HTML (add before </body> in index.html):
 *   <script src="/registerSW.js"></script>
 *
 *   Do NOT use `defer` or `async` — this script is tiny and must run
 *   synchronously so registration fires as early as possible, giving
 *   PWA Builder's crawler enough time to detect it.
 *
 * Option B — JS framework entry (main.js / index.js):
 *   import '/registerSW.js';
 *
 * ⚠️  This file must be EXECUTED by the browser. Serving it from /public
 *     alone does nothing — the browser must load and run it.
 *
 * FIX v2.1.0:
 *  - Removed `window.load` deferral. Registration now fires as soon as
 *    DOMContentLoaded fires (or immediately if DOM is already ready).
 *    PWA Builder's crawler has a fixed timeout window. Deferring
 *    registration to `load` risks missing that window on slow pages.
 *  - Removed explicit `scope: '/'` from register() call. The browser
 *    infers scope correctly from the script path. Explicit scope can
 *    cause subtle failures in headless/sandboxed crawl environments.
 *  - All existing update detection and lifecycle logic is preserved.
 */

(function () {
  'use strict';

  // Guard: skip in non-browser environments (SSR, Node, test runners)
  if (typeof window === 'undefined') return;

  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers not supported in this browser.');
    return;
  }

  // ─── Configuration ─────────────────────────────────────────────────────────
  const SW_SCRIPT = '/service-worker.js';
  // Note: scope is intentionally omitted — browser infers '/' from script path.
  // Explicit scope: '/' caused registration failures in headless crawl envs.

  // ─── Core registration ──────────────────────────────────────────────────────
  function registerServiceWorker() {
    navigator.serviceWorker
      .register(SW_SCRIPT)
      .then((registration) => {
        console.log('[SW] Registered. Scope:', registration.scope);

        // Check if a new version is already waiting
        if (registration.waiting) {
          console.log('[SW] Update already waiting — new version is ready.');
          // window.dispatchEvent(new CustomEvent('sw:update-ready'));
        }

        // Listen for future updates (new SW downloading)
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          console.log('[SW] New version downloading...');

          newWorker.addEventListener('statechange', () => {
            console.log('[SW] Worker state:', newWorker.state);
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              console.log('[SW] New version ready — waiting to activate.');
              // window.dispatchEvent(new CustomEvent('sw:update-ready'));
            }
          });
        });

        // Silent background update check on every page load
        registration.update().catch((err) => {
          console.warn('[SW] Background update check failed:', err);
        });
      })
      .catch((error) => {
        console.error('[SW] Registration failed:', error);
      });

    // Detect when a new SW takes control (after skipWaiting fires)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[SW] New version active — controller changed.');
      // Uncomment to auto-reload on SW update:
      // window.location.reload();
    });
  }

  // ─── Execution timing ──────────────────────────────────────────────────────
  // FIX: Register at DOMContentLoaded (or immediately if already past it),
  // NOT at window.load. This ensures registration completes within
  // PWA Builder's detection window even on slow pages.
  //
  // SW registration is lightweight (a single HTTP request). It does not
  // block rendering or compete with critical resources.
  if (
    document.readyState === 'complete' ||
    document.readyState === 'interactive'
  ) {
    // DOM is ready — register immediately
    registerServiceWorker();
  } else {
    // Wait for DOM to be interactive (much earlier than window.load)
    document.addEventListener('DOMContentLoaded', registerServiceWorker, {
      once: true,
    });
  }
})();
