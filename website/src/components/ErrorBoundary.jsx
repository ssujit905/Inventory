import { Component } from 'react';

/**
 * Global React Error Boundary.
 * Catches unhandled render errors anywhere in the component tree and shows
 * a branded recovery screen instead of a white blank page.
 *
 * Usage: wrap <App /> in main.jsx:
 *   <ErrorBoundary><App /></ErrorBoundary>
 */
class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Log to console in dev; in production you'd send to Sentry / LogRocket
        console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo);
    }

    handleReload = () => {
        // Clear potentially corrupt storage that may have caused the crash
        try {
            const cartRaw = localStorage.getItem('shopy-nepal-cart');
            if (cartRaw) {
                JSON.parse(cartRaw);
            }
        } catch {
            localStorage.removeItem('shopy-nepal-cart');
        }
        try {
            const custRaw = sessionStorage.getItem('shopy_customer');
            if (custRaw) {
                JSON.parse(custRaw);
            }
        } catch {
            sessionStorage.removeItem('shopy_customer');
            sessionStorage.removeItem('shopy_customer_session');
        }
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                    padding: '2rem',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                    <div style={{
                        maxWidth: '440px',
                        width: '100%',
                        background: 'white',
                        borderRadius: '1.5rem',
                        padding: '2.5rem',
                        textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
                        border: '1px solid #e2e8f0'
                    }}>
                        {/* Error icon */}
                        <div style={{
                            width: '72px',
                            height: '72px',
                            borderRadius: '50%',
                            background: '#fef2f2',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 1.5rem',
                            fontSize: '2rem'
                        }}>
                            ⚠️
                        </div>

                        <h1 style={{
                            fontSize: '1.5rem',
                            fontWeight: '900',
                            color: '#0f172a',
                            margin: '0 0 0.75rem'
                        }}>
                            Something Went Wrong
                        </h1>

                        <p style={{
                            fontSize: '0.95rem',
                            color: '#64748b',
                            lineHeight: '1.6',
                            margin: '0 0 2rem'
                        }}>
                            We hit an unexpected error. This is usually temporary — please reload the page to try again.
                        </p>

                        <button
                            onClick={this.handleReload}
                            style={{
                                width: '100%',
                                padding: '0.9rem 1.5rem',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.75rem',
                                fontSize: '1rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                marginBottom: '0.75rem'
                            }}
                            onMouseEnter={e => e.target.style.background = '#dc2626'}
                            onMouseLeave={e => e.target.style.background = '#ef4444'}
                        >
                            🔄 Reload Page
                        </button>

                        <button
                            onClick={() => { window.location.href = '/'; }}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1.5rem',
                                background: 'transparent',
                                color: '#64748b',
                                border: '1px solid #e2e8f0',
                                borderRadius: '0.75rem',
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                cursor: 'pointer'
                            }}
                        >
                            Go to Homepage
                        </button>

                        {/* Show error details in dev */}
                        {import.meta.env.DEV && this.state.error && (
                            <details style={{
                                marginTop: '1.5rem',
                                textAlign: 'left',
                                background: '#f8fafc',
                                padding: '1rem',
                                borderRadius: '0.5rem',
                                border: '1px solid #e2e8f0'
                            }}>
                                <summary style={{
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    color: '#94a3b8',
                                    cursor: 'pointer'
                                }}>
                                    Developer Details
                                </summary>
                                <pre style={{
                                    fontSize: '0.75rem',
                                    color: '#ef4444',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    marginTop: '0.5rem',
                                    maxHeight: '200px',
                                    overflow: 'auto'
                                }}>
                                    {this.state.error?.toString()}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
