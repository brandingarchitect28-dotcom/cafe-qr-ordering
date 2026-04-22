/**
 * registerSW.js
 * Branding Architect — Safe, Production-Ready Service Worker Registration
 * Version: 2.0.0
 *
 * HOW TO LOAD THIS FILE:
 * ─────────────────────
 * Option A — Plain HTML (add before </body> in index.html):
 *   <script src="/registerSW.js" defer></script>
 *
 * Option B — Framework entry (main.js / index.js / App root):
 *   import '/registerSW.js';
 *
 * Option C — Vite / CRA / Next.js inline in index.html template:
 *   <script src="/registerSW.js" defer></script>
 *
 * ⚠️  This file must be loaded by your HTML. Placing it in /public alone
 *     is NOT enough — the browser must execute it for the SW to register.
 */

(function () {
  'use strict';

  // Guard: only run in a real browser context (not SSR / Node / test runners)
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW] Service workers not supported in this browser.');
    return;
  }

  // ─── Configuration ─────────────────────────────────────────────────────────
  const SW_SCRIPT = '/service-worker.js';
  const SW_SCOPE  = '/';

  // ─── Core registration function ────────────────────────────────────────────
  function registerServiceWorker() {
    navigator.serviceWorker
      .register(SW_SCRIPT, { scope: SW_SCOPE })
      .then((registration) => {
        console.log('[SW] Registered successfully. Scope:', registration.scope);

        // ── Check for waiting / pending update on every page load ────────────
        if (registration.waiting) {
          console.log('[SW] Update waiting — a new version is ready.');
          // Optionally: notify your UI here (e.g. dispatch a custom event)
          // window.dispatchEvent(new CustomEvent('sw:update-ready'));
        }

        // ── Listen for future updates ─────────────────────────────────────────
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          console.log('[SW] New version downloading...');

          newWorker.addEventListener('statechange', () => {
            console.log('[SW] State changed:', newWorker.state);
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] New version installed and waiting. Reload to activate.');
              // Optionally notify your app UI here
              // window.dispatchEvent(new CustomEvent('sw:update-ready'));
            }
          });
        });

        // ── Check for updates on every page load (silent background check) ───
        registration.update().catch((err) => {
          console.warn('[SW] Background update check failed:', err);
        });
      })
      .catch((error) => {
        // Log clearly so DevTools shows the real reason for failure
        console.error('[SW] Registration failed:', error);
      });

    // ── React when a new SW takes control (after skipWaiting) ────────────────
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      console.log('[SW] New version active — controller changed.');
      // Uncomment the next line if you want an automatic reload on SW update:
      // window.location.reload();
    });
  }

  // ─── Execution: wait for the page to fully load before registering ─────────
  // Using 'load' event ensures the SW registration never competes with
  // critical page resources and never delays Time-To-Interactive.
  if (document.readyState === 'complete') {
    // Page already loaded (e.g. script is deferred and runs late)
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true });
  }
})();
