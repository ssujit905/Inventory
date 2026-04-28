import { useState, useEffect } from 'react';
import { ArrowRight, ShoppingBag, Zap, ShieldCheck, Truck, Star, ChevronRight } from 'lucide-react';
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

    // Flash Sale Timer & Product Logic
    const [timeLeft, setTimeLeft] = useState({ hours: '00', minutes: '00', seconds: '00' });
    const flashSaleConfig = settings.flash_sale_config ? JSON.parse(settings.flash_sale_config) : [];
    const flashSaleEndTime = settings.flash_sale_end; // Should be YYYY-MM-DD HH:MM:SS

    useEffect(() => {
        const calculateTimeLeft = () => {
            if (!flashSaleEndTime) return;
            const now = new Date();
            const end = new Date(flashSaleEndTime.replace(' ', 'T')); // Handle ISO string conversion
            const diff = end - now;
            
            if (diff > 0) {
                const hours = Math.floor(diff / (1000 * 60 * 60)).toString().padStart(2, '0');
                const minutes = Math.floor((diff / 1000 / 60) % 60).toString().padStart(2, '0');
                const seconds = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
                setTimeLeft({ hours, minutes, seconds, total: diff });
            } else {
                setTimeLeft({ hours: '00', minutes: '00', seconds: '00', total: 0 });
            }
        };

        calculateTimeLeft();
        const timer = setInterval(calculateTimeLeft, 1000);
        return () => clearInterval(timer);
    }, [flashSaleEndTime]);

    // Merge flash sale products with full product details
    const isFlashSaleEnabled = settings.flash_sale_enabled === 'true';
    const flashSaleProducts = isFlashSaleEnabled ? flashSaleConfig.map(saleItem => {
        const product = products.find(p => p.id === saleItem.id);
        if (!product) return null;
        const discount = Number(saleItem.discount || 0);
        const salePrice = Math.floor(product.price - (product.price * (discount / 100)));
        return {
            ...product,
            original_price: product.price, // Use current base price as "Original"
            price: salePrice,               // Use calculated sale price
            discount: discount
        };
    }).filter(p => p !== null) : [];

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
        <div style={{ backgroundColor: 'transparent' }}>
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

            {/* ── FLASH SALE SECTION (Shopee Style) ── */}
            {(settings.flash_sale_enabled === 'true' && flashSaleProducts.length > 0) ? (
                <div style={{ backgroundColor: '#fff', borderBottom: '1px solid var(--border-color)', borderTop: '1px solid var(--border-color)', marginTop: '1rem', marginBottom: '1rem' }}>
                    <div>
                        {/* Flash Sale Header (Title Left, Timer Right) */}
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            background: 'linear-gradient(90deg, #ee4d2d 0%, #ff7337 100%)',
                            padding: '0.75rem 1rem',
                            borderRadius: '0',
                            color: 'white'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Zap size={window.innerWidth < 480 ? 20 : 24} fill="white" />
                                <span style={{ 
                                    fontWeight: '900', 
                                    fontSize: window.innerWidth < 480 ? '1rem' : '1.2rem', 
                                    letterSpacing: '0.5px', 
                                    textTransform: 'uppercase' 
                                }}>Flash Sale</span>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {window.innerWidth > 480 && (
                                    <span style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', opacity: 0.9 }}>Ends In</span>
                                )}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    {[
                                        { val: timeLeft.hours, label: 'h' },
                                        { val: timeLeft.minutes, label: 'm' },
                                        { val: timeLeft.seconds, label: 's' }
                                    ].map((t, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                            <div style={{ 
                                                backgroundColor: '#000', 
                                                color: '#fff', 
                                                padding: '4px 6px', 
                                                borderRadius: '4px', 
                                                minWidth: window.innerWidth < 480 ? '24px' : '28px', 
                                                textAlign: 'center',
                                                fontWeight: '900',
                                                fontSize: window.innerWidth < 480 ? '0.8rem' : '0.9rem'
                                            }}>
                                                {String(t.val).padStart(2, '0')}
                                            </div>
                                            {i < 2 && <span style={{ fontWeight: '900', color: 'white' }}>:</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Horizontal Scrollable Flash Sale Product List */}
                        <div style={{ 
                            display: 'flex', 
                            gap: '12px',
                            padding: '12px 1rem',
                            backgroundColor: 'white',
                            borderRadius: '0',
                            overflowX: 'auto',
                            scrollSnapType: 'x mandatory',
                            scrollbarWidth: 'none',
                            WebkitOverflowScrolling: 'touch'
                        }}>
                            <style>{`div::-webkit-scrollbar { display: none; }`}</style>
                            {flashSaleProducts.map(product => {
                               const discount = Number(settings.flash_sale_discount || 0);
                               return (
                                <Link key={product.id} to={`/product/${product.id}`} style={{ 
                                    textDecoration: 'none', 
                                    color: 'inherit', 
                                    position: 'relative',
                                    flex: '0 0 145px', // Fixed width for scroll items
                                    scrollSnapAlign: 'start'
                                }}>
                                    <div style={{ 
                                        backgroundColor: 'white', 
                                        borderRadius: '0.75rem', 
                                        overflow: 'hidden', 
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                        borderBottom: '3px solid #000'
                                    }}>
                                        {/* Discount Badge */}
                                        <div style={{ 
                                            position: 'absolute', 
                                            top: 0, 
                                            right: 0, 
                                            backgroundColor: '#ffd424', 
                                            color: '#ee4d2d',
                                            padding: '4px 6px',
                                            fontSize: '0.7rem',
                                            fontWeight: '800',
                                            zIndex: 10
                                        }}>
                                            {product.discount}% OFF
                                        </div>

                                        <img src={product.image} alt={product.title} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover' }} />
                                        
                                        <div style={{ padding: '8px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#ee4d2d', marginBottom: '2px' }}>
                                                    Rs.{Number(product.price).toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', textDecoration: 'line-through', color: '#999' }}>
                                                    Rs.{Number(product.original_price).toLocaleString()}
                                                </div>
                                            </div>

                                            {/* Shopee-style Sold Progress Bar */}
                                            <div style={{ marginTop: '8px' }}>
                                                <div style={{ 
                                                    height: '12px', 
                                                    backgroundColor: '#ffbdab', 
                                                    borderRadius: '10px', 
                                                    position: 'relative',
                                                    overflow: 'hidden',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}>
                                                    <div style={{ 
                                                        position: 'absolute', 
                                                        left: 0, 
                                                        top: 0, 
                                                        height: '100%', 
                                                        width: '75%', 
                                                        backgroundColor: '#ee4d2d',
                                                        borderRadius: '10px'
                                                    }}></div>
                                                    <span style={{ 
                                                        fontSize: '8px', 
                                                        color: 'white', 
                                                        fontWeight: '900', 
                                                        zIndex: 1,
                                                        textTransform: 'uppercase'
                                                    }}>SALE</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                               )
                            })}
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ padding: '1rem', textAlign: 'center', width: '100%', color: '#94a3b8', fontSize: '0.8rem', backgroundColor: '#fff' }}>Check back later for flash deals!</div>
            )}

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
