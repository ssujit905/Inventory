import { ArrowRight, ShoppingBag, Zap, ShieldCheck, Truck, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProducts } from '../context/ProductContext';
import { useSettings } from '../context/SettingsContext';
import ProductCard from '../components/ProductCard';

const Home = () => {
    const { products, loading } = useProducts();
    const { settings } = useSettings();
    
    // Split products for the staggered discovery masonry on mobile
    const leftColumn = products.filter((_, idx) => idx % 2 === 0);
    const rightColumn = products.filter((_, idx) => idx % 2 !== 0);

    return (
        <div style={{ backgroundColor: '#fff' }}>
            {/* ─── Premium Hero Section ─── */}
            <section className="hero-section glass" style={{
                backgroundColor: 'var(--primary-blue)',
                padding: '2.5rem 0',
                backgroundImage: 'radial-gradient(circle at top right, #1e3a8a, var(--primary-blue))',
                color: 'white',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div className="container" style={{ position: 'relative', zIndex: 2 }}>
                    <div className="hero-content" style={{ textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 16px',
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            borderRadius: '100px',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            marginBottom: '1.5rem',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#fff',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            <Star size={14} fill="#fbbf24" color="#fbbf24" /> {settings.hero_badge || 'Premium Quality'}
                        </div>
                        
                        <h1 className="hero-title" style={{ marginBottom: '1.25rem' }}>
                            {settings.hero_title}
                        </h1>
                        
                        <p className="hero-subtitle" style={{
                            fontSize: '1rem',
                            opacity: '0.9',
                            marginBottom: '2rem',
                            lineHeight: '1.6',
                            fontWeight: '500'
                        }}>
                            {settings.hero_subtitle}
                        </p>
                        
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <Link to="/shop" className="btn btn-primary" style={{ padding: '0.75rem 2rem' }}>
                                Start Shopping <ArrowRight size={18} style={{ marginLeft: '8px' }} />
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Abstract Background Decoration */}
                <div style={{ 
                    position: 'absolute', top: '-10%', right: '-5%', width: '300px', height: '300px', 
                    background: 'rgba(59, 130, 246, 0.2)', borderRadius: '50%', filter: 'blur(80px)' 
                }} />
                <div style={{ 
                    position: 'absolute', bottom: '-20%', left: '-5%', width: '250px', height: '250px', 
                    background: 'rgba(239, 68, 68, 0.15)', borderRadius: '50%', filter: 'blur(60px)' 
                }} />
            </section>

            {/* ─── Trust Indicators ─── */}
            <div className="trust-bar" style={{ 
                backgroundColor: '#fff', 
                borderBottom: '1px solid var(--border-color)',
                padding: '1.25rem 0'
            }}>
                <div className="container" style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '2.5rem',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '40px', height: '40px', background: '#fee2e2', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Truck size={20} color="var(--primary-red)" />
                        </div>
                        <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: '800', margin: 0 }}>FAST DELIVERY</p>
                            <p style={{ fontSize: '0.65rem', color: 'var(--text-gray)', margin: 0 }}>Across Nepal</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '40px', height: '40px', background: '#dcfce7', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShieldCheck size={20} color="#059669" />
                        </div>
                        <div>
                            <p style={{ fontSize: '0.75rem', fontWeight: '800', margin: 0 }}>SECURE PAY</p>
                            <p style={{ fontSize: '0.65rem', color: 'var(--text-gray)', margin: 0 }}>COD Available</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Product Discovery ─── */}
            <section className="section" style={{ padding: '2rem 0 5rem' }}>
                <div className="container" style={{ padding: '0 1rem' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginBottom: '2rem'
                    }}>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem', color: 'var(--primary-blue)' }}>DAILY DISCOVER</h2>
                            <div style={{ width: '40px', height: '4px', background: 'var(--primary-red)', borderRadius: '2px' }} />
                        </div>
                        <Link to="/shop" style={{ 
                            color: 'var(--primary-red)', 
                            fontSize: '0.85rem', 
                            fontWeight: '800', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px'
                        }}>
                            View All <ArrowRight size={16} />
                        </Link>
                    </div>

                    {loading ? (
                        <div className="grid-cols-2" style={{ display: 'grid', gap: '1rem' }}>
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="card" style={{ boxShadow: 'none' }}>
                                    <div style={{ aspectRatio: '1/1', backgroundColor: '#f1f5f9', animation: 'pulse 1.5s infinite' }} />
                                    <div style={{ padding: '1rem' }}>
                                        <div style={{ height: '14px', background: '#f1f5f9', borderRadius: '4px', width: '80%', marginBottom: '8px' }} />
                                        <div style={{ height: '18px', background: '#f1f5f9', borderRadius: '4px', width: '40%' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : products.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '5rem 0' }}>
                            <ShoppingBag size={64} color="#e2e8f0" style={{ marginBottom: '1.5rem' }} />
                            <h3 style={{ color: '#94a3b8' }}>Our shelves are being restocked!</h3>
                            <p style={{ color: '#cbd5e1' }}>Please check back in a few moments.</p>
                        </div>
                    ) : (
                        <div className="discovery-masonry" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '12px',
                            alignItems: 'start'
                        }}>
                            {/* Column 1 - Slightly Offset */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '1.5rem' }}>
                                {leftColumn.map(product => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                            </div>

                            {/* Column 2 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {rightColumn.map(product => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.6; }
                    100% { opacity: 1; }
                }
                
                @media (min-width: 769px) {
                    .hero-section { padding: 7rem 0 !important; }
                    .hero-content { maxWidth: 800px !important; }
                    .hero-title { fontSize: 4.5rem !important; }
                    .hero-subtitle { fontSize: 1.25rem !important; }
                    .discovery-masonry {
                        grid-template-columns: repeat(4, 1fr) !important;
                        gap: 2rem !important;
                    }
                    .discovery-masonry > div {
                        display: contents !important;
                    }
                }

                @media (max-width: 480px) {
                    .hero-title { fontSize: 2.25rem !important; }
                    .trust-bar { padding: 1rem 0 !important; }
                    .trust-bar .container { gap: 1rem !important; justify-content: space-around !important; }
                }
            `}</style>
        </div>
    );
};

export default Home;
