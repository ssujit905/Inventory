import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const Signup = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { signup } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = (e) => {
        e.preventDefault();
        // Email signup is disabled (see AuthContext): customers register with
        // phone + PIN. Never navigate home pretending an account was created.
        const result = signup({ email, name });
        if (result && result.success) {
            navigate('/');
        } else {
            setError((result && result.error) || 'Signup is disabled. Please register with phone + PIN on My Orders.');
        }
    };

    return (
        <div className="section">
            <div className="container">
                <div className="auth-form">
                    <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>Create Account</h2>
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
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                className="form-control"
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="John Doe"
                            />
                        </div>
                        <div className="form-group">
                            <label>Email Address</label>
                            <input
                                type="email"
                                className="form-control"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@example.com"
                            />
                        </div>
                        <div className="form-group">
                            <label>Password</label>
                            <input
                                type="password"
                                className="form-control"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
                            Create Account
                        </button>
                    </form>
                    <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-gray)' }}>
                        Already have an account? <Link to="/login" style={{ color: 'var(--primary-blue)', fontWeight: '600' }}>Login</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Signup;
