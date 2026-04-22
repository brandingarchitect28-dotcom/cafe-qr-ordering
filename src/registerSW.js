// Service Worker Registration
// Safe, production-ready — does not affect any existing app logic

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) {

      // Guard: skip if already registered with same script
      navigator.serviceWorker.getRegistration('/').then((existing) => {
        if (existing) {
          console.log('[SW] Already registered. Scope:', existing.scope)

          // Still check for updates on every page load
          existing.update().catch((err) => {
            console.warn('[SW] Update check failed:', err)
          })
          return
        }

        // First-time registration
        navigator.serviceWorker
          .register('/service-worker.js', { scope: '/' })
          .then((registration) => {
            console.log('[SW] Registered successfully. Scope:', registration.scope)

            // Notify app when a new SW version takes control
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              console.log('[SW] New version active. Controller changed.')
            })
          })
          .catch((error) => {
            console.error('[SW] Registration failed:', error)
          })
      }).catch((err) => {
        console.warn('[SW] getRegistration check failed:', err)

        // Fallback: attempt registration anyway
        navigator.serviceWorker
          .register('/service-worker.js', { scope: '/' })
          .then((registration) => {
            console.log('[SW] Registered (fallback). Scope:', registration.scope)
          })
          .catch((error) => {
            console.error('[SW] Registration failed (fallback):', error)
          })
      })

    } else {
      console.warn('[SW] Service workers not supported in this browser.')
    }
  })
}
