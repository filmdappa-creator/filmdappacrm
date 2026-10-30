import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Filmdappa CRM ErrorBoundary caught an error]:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: '24px',
            background: '#ffffff',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 540,
              width: '100%',
              padding: '36px',
              border: '1.5px solid #111111',
              borderRadius: '16px',
              background: '#ffffff',
              boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '12px',
                  background: '#fee2e2',
                  color: '#dc2626',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 22,
                  flexShrink: 0,
                }}
              >
                !
              </div>
              <div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#666',
                    display: 'block',
                    marginBottom: 2,
                  }}
                >
                  System Recovery
                </span>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111111' }}>
                  An unexpected error occurred
                </h2>
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#555555', lineHeight: 1.6, marginBottom: 18 }}>
              {this.state.error?.message ||
                'A rendering error occurred in this view. You can safely return to the dashboard or reload.'}
            </p>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null })
                  window.location.href = '/'
                }}
                style={{
                  padding: '10px 18px',
                  borderRadius: 9,
                  border: '1px solid #111111',
                  background: '#111111',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Return to Dashboard
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 18px',
                  borderRadius: 9,
                  border: '1px solid #111111',
                  background: '#fff4b8',
                  color: '#111111',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
