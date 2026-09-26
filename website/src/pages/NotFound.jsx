import { Link } from 'react-router-dom';
import { ShoppingBag, Home, Compass } from 'lucide-react';

const NotFound = () => {
    return (
        <div style={{
            minHeight: '65vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1rem',
            textAlign: 'center'
        }}>
            <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.1)',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.5rem'
            }}>
                <Compass size={42} strokeWidth={1.8} />
            </div>

            <h1 style={{
                fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                fontWeight: 800,
                color: '#0f172a',
                marginBottom: '0.5rem',
                letterSpacing: '-0.02em'
            }}>
                404
            </h1>

            <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '0.75rem'
            }}>
                Page Not Found
            </h2>

            <p style={{
                color: '#64748b',
                maxWidth: '420px',
                lineHeight: 1.6,
                marginBottom: '2rem',
                fontSize: '0.95rem'
            }}>
                Sorry, the page you're looking for doesn't exist, was removed, or is temporarily unavailable.
            </p>

            <div style={{
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
                justifyContent: 'center'
            }}>
                <Link
                    to="/"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '0.5rem',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        fontWeight: 500,
                        fontSize: '0.95rem',
                        textDecoration: 'none',
                        transition: 'opacity 0.2s'
                    }}
                >
                    <Home size={18} />
                    Back to Home
                </Link>

                <Link
                    to="/shop"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '0.5rem',
                        backgroundColor: '#f1f5f9',
                        color: '#0f172a',
                        fontWeight: 500,
                        fontSize: '0.95rem',
                        textDecoration: 'none',
                        border: '1px solid #e2e8f0',
                        transition: 'background-color 0.2s'
                    }}
                >
                    <ShoppingBag size={18} />
                    Browse Products
                </Link>
            </div>
        </div>
    );
};

export default NotFound;
