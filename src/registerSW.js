/**
 * registerSW.js
 *
 * Paste this file into: src/registerSW.js
 * Then import it ONCE at the bottom of src/main.jsx
 *
 * Usage in main.jsx:
 *   import './registerSW';     ← add this as the LAST import
 */

export function registerServiceWorker() {
  // Only run in production + in browsers that support SW
  if (
    import.meta.env.PROD &&
    'serviceWorker' in navigator
  ) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js', {
          // 'classic' scope — covers the whole app from root
          scope: '/',
        })
        .then((registration) => {
          console.log('[SW] Registered. Scope:', registration.scope);

          // Check for updates every time app loads
          registration.update();
        })
        .catch((error) => {
          // Registration failed — app still works, just no SW
          console.warn('[SW] Registration failed:', error);
        });
    });
  }
}

// Auto-invoke when imported
registerServiceWorker();
