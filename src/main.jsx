import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
/*
 * FIX: Removed `import './registerSW'`
 *
 * ROOT CAUSE OF 404 / BLANK SCREEN IN PRODUCTION & TWA:
 * ──────────────────────────────────────────────────────
 * registerSW.js lives in /public (a static file served at the web root).
 * It does NOT live in /src/.
 *
 * When Vite processes `import './registerSW'` at build time, it looks for
 * the file in /src/registerSW.js — it is not there. Vite either:
 *   a) throws a build error and produces a broken bundle, OR
 *   b) silently omits it, leaving the service worker unregistered
 *
 * Either outcome breaks the app in production and inside the TWA WebView.
 *
 * THE FIX: registerSW.js is now loaded via a plain <script src="/registerSW.js">
 * tag in index.html (see index.html FIX 2). That is the correct way to load
 * a /public static file — the browser fetches it directly, independent of
 * the Vite bundle. No import needed here.
 *
 * All service worker logic and functionality is completely preserved.
 */

// Global error boundary fallback — prevents total black screen
// when an uncaught error occurs during render
class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[App crash]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          fontFamily: 'monospace',
          padding: '2rem',
          background: '#050505',
          color: '#ff6b6b',
          minHeight: '100vh',
        }}>
          <h2 style={{ color: '#D4AF37', marginBottom: '1rem' }}>
            ⚠️ Application Error
          </h2>
          <p style={{ color: '#E5E5E5', marginBottom: '1rem' }}>
            Something went wrong. Check the browser console for details.
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', color: '#ff6b6b' }}>
            {this.state.error.toString()}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1.5rem',
              background: '#D4AF37',
              color: '#050505',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
)
