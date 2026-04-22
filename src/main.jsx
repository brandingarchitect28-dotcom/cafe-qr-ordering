import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './registerSW'

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
