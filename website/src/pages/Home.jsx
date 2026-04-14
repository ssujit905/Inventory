import { useState, useEffect } from 'react';
import { ArrowRight, ShoppingBag, Zap, ShieldCheck, Truck, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProducts } from '../context/ProductContext';
import { useSettings } from '../context/SettingsContext';
import ProductCard from '../components/ProductCard';

const Home = () => {
    const { products, loading } = useProducts();
    const { settings } = useSettings();
    const [currentIndex, setCurrentIndex] = useState(1);
    const [isTransitioning, setIsTransitioning] = useState(true);

    const slides = [
        { id: 'clone-last', image: settings.hero_slider_3_image || '/Users/sujitsingh/.gemini/antigravity/brain/4595983a-798b-47e0-874b-3e3e1097cc5f/hero_banner_discount_1776096397147.png' },
        { id: 1, image: settings.hero_slider_1_image || '/Users/sujitsingh/.gemini/antigravity/brain/4595983a-798b-47e0-874b-3e3e1097cc5f/hero_banner_info_1776096290574.png' },
        { id: 2, image: settings.hero_slider_2_image || '/Users/sujitsingh/.gemini/antigravity/brain/4595983a-798b-47e0-874b-3e3e1097cc5f/hero_banner_sale_1776096347242.png' },
        { id: 3, image: settings.hero_slider_3_image || '/Users/sujitsingh/.gemini/antigravity/brain/4595983a-798b-47e0-874b-3e3e1097cc5f/hero_banner_discount_1776096397147.png' },
        { id: 'clone-first', image: settings.hero_slider_1_image || '/Users/sujitsingh/.gemini/antigravity/brain/4595983a-798b-47e0-874b-3e3e1097cc5f/hero_banner_info_1776096290574.png' }
    ];

    // Auto-rotate slider
    useEffect(() => {
        const timer = setInterval(() => {
            handleNext();
        }, 5000);
        return () => clearInterval(timer);
    }, [currentIndex]);

    const handleNext = () => {
        setIsTransitioning(true);
        setCurrentIndex(prev => prev + 1);
    };

    const handleTransitionEnd = () => {
        if (currentIndex >= slides.length - 1) {
            setIsTransitioning(false);
            setCurrentIndex(1);
        } else if (currentIndex <= 0) {
            setIsTransitioning(false);
            setCurrentIndex(slides.length - 2);
        }
    };

    const goToSlide = (slideIndex) => {
        setIsTransitioning(true);
        setCurrentIndex(slideIndex + 1);
    };
    
    // Split products for the staggered discovery masonry on mobile
    const leftColumn = products.filter((_, idx) => idx % 2 === 0);
    const rightColumn = products.filter((_, idx) => idx % 2 !== 0);

    return (
        <div style={{ backgroundColor: '#fff' }}>
            {/* ─── Premium Hero Section ─── */}
            {/* ─── Premium Hero Slider Section ─── */}
            <section className="hero-slider" style={{
                position: 'relative',
                overflow: 'hidden',
                padding: '1rem 0',
                background: '#f8fafc'
            }}>
                <div className="container" style={{ padding: '0 0.5rem' }}>
                    <div style={{ position: 'relative', height: 'auto' }}>
                        {/* Slider Content */}
                        <div style={{ 
                            borderRadius: '1.25rem',
                            overflow: 'hidden',
                            position: 'relative',
                            aspectRatio: window.innerWidth > 768 ? '2.8/1' : '16/9',
                            maxHeight: '550px',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
                        }}>
                            <div 
                                onTransitionEnd={handleTransitionEnd}
                                style={{
                                    display: 'flex',
                                    transition: isTransitioning ? 'transform 0.8s cubic-bezier(0.65, 0, 0.35, 1)' : 'none',
                                    transform: `translateX(-${currentIndex * 100}%)`,
                                    height: '100%',
                                    width: '100%'
                                }}
                            >
                                {slides.map((slide, idx) => (
                                    <div 
                                        key={`${slide.id}-${idx}`}
                                        style={{
                                            flex: '0 0 100%',
                                            height: '100%',
                                            width: '100%'
                                        }}
                                    >
                                        <img 
                                            src={slide.image} 
                                            alt="Hero Banner" 
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Navigation Dots - 7px Precision */}
                        <div style={{
                            display: 'flex', 
                            justifyContent: 'center', 
                            gap: '10px',
                            marginTop: '1rem'
                        }}>
                            {[0, 1, 2].map(i => {
                                const activeDot = (currentIndex === 0 ? 2 : (currentIndex === 4 ? 0 : currentIndex - 1));
                                return (
                                    <button
                                        key={i}
                                        onClick={() => goToSlide(i)}
                                        style={{
                                            width: activeDot === i ? '24px' : '7px',
                                            height: '7px',
                                            padding: 0,
                                            margin: 0,
                                            minWidth: 0,
                                            minHeight: 0,
                                            borderRadius: '10px',
                                            background: activeDot === i ? 'var(--primary-red)' : '#cbd5e1',
                                            border: 'none',
                                            outline: 'none',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            cursor: 'pointer',
                                            display: 'block'
                                        }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── Trust Indicators ─── */}

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
                                <div key={i} className="card" style={{ border: 'none', boxShadow: 'none' }}>
                                    <div className="skeleton skeleton-img" />
                                    <div style={{ padding: '1rem' }}>
                                        <div className="skeleton skeleton-text" style={{ width: '80%' }} />
                                        <div className="skeleton skeleton-text" style={{ width: '40%' }} />
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
                @keyframes float {
                    0% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(30px, -50px) scale(1.1); }
                    66% { transform: translate(-20px, 20px) scale(0.9); }
                    100% { transform: translate(0, 0) scale(1); }
                }

                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.6; }
                    100% { opacity: 1; }
                }
                
                @media (min-width: 769px) {
                    .hero-section { padding: 7rem 0 !important; }
                    .hero-grid { grid-template-columns: minmax(300px, 600px) 1fr !important; }
                    .hero-visual { display: flex !important; }
                    .discovery-masonry {
                        grid-template-columns: repeat(4, 1fr) !important;
                        gap: 2rem !important;
                    }
                    .discovery-masonry > div {
                        display: contents !important;
                    }
                }

                @media (max-width: 768px) {
                    .hero-grid { grid-template-columns: 1fr !important; }
                    .glass-card { padding: 1.5rem !important; margin: 0 1rem; }
                    .hero-section { 
                        background-position: center !important;
                        text-align: center !important;
                    }
                    .glass-card { text-align: center !important; }
                    .glass-card div { justify-content: center !important; }
                }

                @media (max-width: 480px) {
                    .hero-title { fontSize: 2.5rem !important; }
                    .trust-bar { padding: 1rem 0 !important; }
                    .trust-bar .container { gap: 1rem !important; justify-content: space-around !important; }
                }
            `}</style>
        </div>
    );
};

export default Home;
