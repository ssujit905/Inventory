import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');

        const result = login(email, password);

        if (result.success) {
            if (result.role === 'admin') {
                navigate('/admin/dashboard');
            } else {
                navigate('/');
            }
        } else {
            setError('Invalid credentials');
        }
    };

    return (
        <div className="section" style={{ backgroundColor: '#f8fafc', minHeight: '80vh', display: 'flex', alignItems: 'center' }}>
            <div className="container">
                <div className="auth-form" style={{
                    maxWidth: '400px',
                    margin: '0 auto',
                    backgroundColor: 'white',
                    padding: '2.5rem',
                    borderRadius: '1.25rem',
                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)'
                }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--primary-blue)' }}>
                            Welcome Back
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.5rem' }}>Login to your Shopy Nepal account</p>
                    </div>

                    {error && (
                        <div style={{
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            padding: '0.75rem',
                            borderRadius: '0.5rem',
                            marginBottom: '1.5rem',
                            fontSize: '0.875rem',
                            textAlign: 'center'
                        }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit}>
                        <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600' }}>Email Address</label>
                            <input
                                type="email"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                            />
                        </div>
                        <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600' }}>Password</label>
                            <input
                                type="password"
                                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.875rem', borderRadius: '0.5rem', backgroundColor: 'var(--primary-red)', border: 'none', color: 'white', fontWeight: '600', cursor: 'pointer' }}>
                            Sign In
                        </button>
                    </form>

                    <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
                            Don't have an account? <Link to="/signup" style={{ color: 'var(--primary-red)', fontWeight: '700', textDecoration: 'none' }}>Sign Up</Link>
                        </p>
                    </div>

                    <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f0f9ff', borderRadius: '0.75rem', fontSize: '0.8rem' }}>
                        <p style={{ color: '#0369a1', fontWeight: '700', marginBottom: '4px' }}>Admin Demo Login:</p>
                        <p style={{ color: '#0c4a6e' }}>Email: <strong>admin@shopy.com</strong></p>
                        <p style={{ color: '#0c4a6e' }}>Pass: <strong>admin123</strong></p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
