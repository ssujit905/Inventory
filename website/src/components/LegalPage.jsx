import { Link } from 'react-router-dom';

const LegalPage = ({ title, updated, intro, sections }) => (
    <div style={{ background: '#f8fafc', minHeight: '100vh', padding: '0 0 5rem' }}>
        <div style={{
            background: '#0f172a', color: 'white',
            padding: 'clamp(3rem, 10vw, 5rem) 1rem 4rem',
            textAlign: 'center', marginBottom: '-3rem'
        }}>
            <div className="container">
                <h1 style={{ fontSize: 'clamp(1.75rem, 6vw, 2.75rem)', fontWeight: 950, letterSpacing: '-0.02em' }}>{title}</h1>
                <p style={{ color: '#94a3b8', marginTop: '0.75rem', fontWeight: 500 }}>Last updated: {updated}</p>
            </div>
        </div>
        <div className="container" style={{ maxWidth: '800px' }}>
            <div style={{
                background: 'white', borderRadius: '1.5rem', border: '1px solid #e2e8f0',
                padding: 'clamp(1.5rem, 4vw, 2.5rem)', boxShadow: '0 20px 40px rgba(0,0,0,0.03)'
            }}>
                <p style={{ color: '#475569', lineHeight: 1.7, marginBottom: '2rem' }}>{intro}</p>
                {sections.map((s) => (
                    <section key={s.h} style={{ marginBottom: '1.75rem' }}>
                        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.5rem' }}>{s.h}</h2>
                        <p style={{ color: '#475569', lineHeight: 1.7, fontSize: '0.95rem', whiteSpace: 'pre-line' }}>{s.p}</p>
                    </section>
                ))}
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
                    <Link to="/contact" style={{ color: 'var(--primary-red)', fontWeight: 800, fontSize: '0.9rem' }}>Contact support →</Link>
                    <Link to="/" style={{ color: '#64748b', fontWeight: 700, fontSize: '0.9rem' }}>Back to home</Link>
                </div>
            </div>
        </div>
    </div>
);

export default LegalPage;
