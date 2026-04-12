import { useParams, Link, useNavigate } from 'react-router-dom';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import {
    ShoppingCart,
    ArrowLeft,
    Truck,
    RotateCcw,
    ShieldCheck,
    MessageCircle,
    Heart,
    Share2,
    MoreVertical,
    ChevronRight,
    ChevronLeft,
    Play,
    X,
    Star,
    User,
    Loader2
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const ProductDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToCart, cart } = useCart();
    const [product, setProduct] = useState(null);
    const [variants, setVariants] = useState([]);
    const [selectedColor, setSelectedColor] = useState(null);
    const [selectedSize, setSelectedSize] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pickerAction, setPickerAction] = useState('buy');
    const [quantity, setQuantity] = useState(1);
    const [touchStart, setTouchStart] = useState(0);
    const [isFavorite, setIsFavorite] = useState(false);
    const [activeImageIndex, setActiveImageIndex] = useState(0);
    const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

    // ── VARIANT LOGIC ──
    const uniqueColors = useMemo(() => 
        Array.from(new Set(variants.map(v => v.color))), 
        [variants]
    );

    const filteredSizes = useMemo(() => 
        variants.filter(v => v.color === selectedColor),
        [variants, selectedColor]
    );

    const currentVariant = variants.find(v => v.color === selectedColor && v.size === selectedSize);
    const activePrice = currentVariant?.price ? Number(currentVariant.price) : (product?.price || 0);

    useEffect(() => {
        const fetchProductData = async () => {
            try {
                // 1. Fetch Product Basic Info with Images
                const { data: p } = await supabase
                    .from('website_products')
                    .select('*, website_product_images(*)')
                    .eq('id', id)
                    .single();
                
                if (!p) return;
                setProduct(p);

                // 2. Fetch Variants with real-time stock
                const { data: v } = await supabase.from('website_variant_stock_view').select('*').eq('parent_product_id', id);
                setVariants(v || []);

                // Auto-select first color if none selected
                if (v && v.length > 0 && !selectedColor) {
                    setSelectedColor(v[0].color);
                }
            } catch (err) {
                console.error("Fetch error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchProductData();
    }, [id]);

    // Ratings state
    const [ratings, setRatings] = useState([]);
    const [loadingRatings, setLoadingRatings] = useState(true);

    useEffect(() => {
        if (id) fetchRatings();
    }, [id]);

    const fetchRatings = async () => {
        try {
            const { data, error } = await supabase
                .from('website_product_ratings')
                .select('*')
                .eq('product_id', id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setRatings(data || []);
        } catch (err) {
            console.error('Error fetching ratings:', err);
        } finally {
            setLoadingRatings(false);
        }
    };

    const images = product?.website_product_images || [];
    const variations = product?.variations || [];
    const averageRating = ratings.length > 0
        ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1)
        : 0;
    
    // Group images to identify unique variations (based on labels, normalized)
    const normalizeLabel = (label) => (label || '').trim().toLowerCase();
    const variationImages = images.filter((img, index, self) => 
        img.label && self.findIndex(t => normalizeLabel(t.label) === normalizeLabel(img.label)) === index
    );
    
    // If no labeled images exist, use the first image as the default variation
    const displayVariations = variationImages.length > 0 ? variationImages : (images.length > 0 ? [images[0]] : []);

    // While product is still loading, show a spinner
    if (loading) {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={40} className="animate-spin" color="var(--primary-red)" />
            </div>
        );
    }

    if (!product) {
        return (
            <div className="container" style={{ padding: '5rem 0', textAlign: 'center' }}>
                <h2>Product not found</h2>
                <Link to="/shop" className="btn btn-primary" style={{ marginTop: '2rem' }}>Back to Shop</Link>
            </div>
        );
    }



    const isSelectionComplete = () => {
        return !!selectedColor && !!selectedSize;
    };

    const handleNext = () => {
        setActiveImageIndex(prev => (prev + 1) % images.length);
    };

    const handlePrev = () => {
        setActiveImageIndex(prev => (prev - 1 + images.length) % images.length);
    };

    const handleTouchStart = (e) => {
        setTouchStart(e.targetTouches[0].clientX);
    };

    const handleTouchEnd = (e) => {
        const touchEnd = e.changedTouches[0].clientX;
        if (touchStart - touchEnd > 50) handleNext(); // Swipe Left
        if (touchStart - touchEnd < -50) handlePrev(); // Swipe Right
    };

    const handleBuyNowTrigger = () => {
        setPickerAction('buy');
        setIsPickerOpen(true);
    };

    const handleAddToCartTrigger = () => {
        setPickerAction('cart');
        setIsPickerOpen(true);
    };

    const handleFinalPurchase = (e) => {
        if (!isSelectionComplete()) return;
        
        if (!currentVariant || currentVariant.current_stock <= 0) {
            alert('Sorry, this specific variation is out of stock!');
            return;
        }

        const cartItem = {
            ...product,
            price: activePrice,
            variant_id: currentVariant.variant_id,
            sku: currentVariant.sku,
            selectedColor,
            selectedSize,
            quantity: quantity,
            image: images[activeImageIndex]?.image_url || product.image
        };
        
        if (pickerAction === 'buy') {
            setIsPickerOpen(false);
            navigate('/checkout', { state: { buyNowItem: cartItem } });
        } else {
            addToCart(cartItem);
            setIsPickerOpen(false);
            animateToCart(e, cartItem.image);
        }
    };

    const cartCount = cart.length;

    const animateToCart = (e, customImage = null) => {
        const cartIcon = document.getElementById('cart-icon');
        const btn = e.currentTarget;

        if (!cartIcon || !btn) return;

        // Create the flying element
        const flyingEl = document.createElement('div');
        flyingEl.style.position = 'fixed';
        flyingEl.style.zIndex = '9999';
        flyingEl.style.width = '50px';
        flyingEl.style.height = '50px';
        flyingEl.style.borderRadius = '50%';
        flyingEl.style.backgroundImage = `url(${customImage || product.image})`;
        flyingEl.style.backgroundSize = 'cover';
        flyingEl.style.backgroundPosition = 'center';
        flyingEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        flyingEl.style.pointerEvents = 'none';
        flyingEl.style.top = '0';
        flyingEl.style.left = '0';

        // Get coordinates
        const btnRect = btn.getBoundingClientRect();
        const cartRect = cartIcon.getBoundingClientRect();

        const startX = btnRect.left + btnRect.width / 2 - 25;
        const startY = btnRect.top + btnRect.height / 2 - 25;
        const endX = cartRect.left + cartRect.width / 2 - 25;
        const endY = cartRect.top + cartRect.height / 2 - 25;

        flyingEl.style.transform = `translate(${startX}px, ${startY}px)`;
        document.body.appendChild(flyingEl);

        // Animate
        const animation = flyingEl.animate([
            { transform: `translate(${startX}px, ${startY}px) scale(1)`, opacity: 1 },
            { transform: `translate(${endX}px, ${endY}px) scale(0.2)`, opacity: 0.5 }
        ], {
            duration: 800,
            easing: 'cubic-bezier(0.42, 0, 0.58, 1)'
        });

        animation.onfinish = () => {
            flyingEl.remove();

            // Subtle "pop" on cart icon
            cartIcon.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.3)' },
                { transform: 'scale(1)' }
            ], { duration: 300 });
        };
    };

    const handleShare = async () => {
        const shareData = {
            title: product.title,
            text: `Check out this ${product.title} on ShopyNepal!`,
            url: window.location.href
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                // User cancelled or error
            }
        } else {
            // Fallback: Copy to clipboard
            try {
                await navigator.clipboard.writeText(window.location.href);
                alert('Link copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
        }
    };

    return (
        <div style={{ backgroundColor: '#fff', minHeight: '100vh', paddingBottom: '80px' }}>
            <div className="product-layout" style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {/* Left Side: Image Content */}
                <div className="image-column">
                    <div style={{ position: 'relative', backgroundColor: 'white' }}>
                        {/* Top Floating Nav */}
                        <div className="mobile-floating-nav" style={{
                            position: 'absolute',
                            top: '12px',
                            left: '12px',
                            right: '12px',
                            zIndex: 100,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingTop: 'env(safe-area-inset-top)'
                        }}>
                            <div
                                onClick={() => navigate(-1)}
                                style={{
                                    width: '44px', height: '44px', borderRadius: '50%',
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)', color: '#0f172a',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                    border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                    cursor: 'pointer',
                                    WebkitTapHighlightColor: 'transparent'
                                }}
                            >
                                <ArrowLeft size={22} color="#0f172a" strokeWidth={2.2} />
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <div 
                                    onClick={handleShare}
                                    style={{
                                        width: '44px', height: '44px', borderRadius: '50%',
                                        backgroundColor: 'rgba(255, 255, 255, 0.95)', color: '#0f172a',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                        border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                        cursor: 'pointer',
                                        WebkitTapHighlightColor: 'transparent'
                                    }}
                                >
                                    <Share2 size={22} color="#0f172a" strokeWidth={2.2} />
                                </div>
                                <Link id="cart-icon" to="/cart" style={{
                                    width: '44px', height: '44px', borderRadius: '50%',
                                    backgroundColor: 'rgba(255, 255, 255, 0.95)', color: '#0f172a',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                    border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                    position: 'relative',
                                    textDecoration: 'none',
                                    WebkitTapHighlightColor: 'transparent'
                                }}>
                                    <ShoppingCart size={22} color="#0f172a" strokeWidth={2.2} />
                                    {cartCount > 0 && (
                                        <span style={{
                                            position: 'absolute', top: '-2px', right: '-2px',
                                            backgroundColor: 'var(--primary-red)', color: 'white',
                                            fontSize: '0.7rem', fontWeight: '900', height: '22px', width: '22px',
                                            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: '2px solid white', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)'
                                        }}>{cartCount}</span>
                                    )}
                                </Link>
                            </div>
                        </div>

                        {/* Main Image Swiper Section */}
                        <div 
                            className="main-image-container swiper-container" 
                            style={{ width: '100%', aspectRatio: '1/1', position: 'relative', cursor: images.length > 1 ? 'grab' : 'default' }}
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                        >
                            <img
                                key={activeImageIndex} // Key ensures smooth re-render logic if needed
                                src={images[activeImageIndex]?.image_url}
                                alt={product.title}
                                onClick={() => setIsFullscreenOpen(true)}
                                style={{ 
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    animation: 'fadeIn 0.3s ease-in-out',
                                    cursor: 'pointer'
                                }}
                            />

                            {/* Desktop Nav Arrows */}
                            {images.length > 1 && (
                                <>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                                        className="image-nav-btn"
                                        style={{ left: '10px' }}
                                    >
                                        <ChevronLeft size={36} strokeWidth={2.5} />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleNext(); }}
                                        className="image-nav-btn"
                                        style={{ right: '10px' }}
                                    >
                                        <ChevronRight size={36} strokeWidth={2.5} />
                                    </button>
                                </>
                            )}

                            {/* Dynamic Photo Counter */}
                            {images.length > 0 && (
                                <div style={{
                                    position: 'absolute', bottom: '15px', right: '15px',
                                    backgroundColor: 'rgba(0,0,0,0.5)', color: 'white',
                                    padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem'
                                }}>
                                    {activeImageIndex + 1} / {images.length}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Side: Product Details */}
                <div className="details-column">
                    {/* Product Variation Thumbnails - Clickable */}
                    <div style={{ backgroundColor: 'white', padding: '15px', marginTop: '1px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p style={{ fontSize: '0.8rem', color: '#666' }}>{images.length} Photos Available</p>
                            {images[activeImageIndex]?.label && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--primary-red)', fontWeight: '800', textTransform: 'uppercase' }}>
                                    {images[activeImageIndex].label}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '5px' }}>
                            {images.map((img, i) => (
                                <div
                                    key={i}
                                    onClick={() => setActiveImageIndex(i)}
                                    style={{
                                        width: '50px',
                                        height: '50px',
                                        border: activeImageIndex === i ? '2px solid var(--primary-red)' : '1px solid #eee',
                                        borderRadius: '4px',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <img src={img.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: activeImageIndex === i ? 1 : 0.7 }} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pricing Section */}
                    <div style={{ backgroundColor: 'white', padding: '1rem', marginTop: '1px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.75rem', color: 'var(--primary-red)', fontWeight: '900' }}>Rs. {activePrice.toLocaleString()}</span>
                                {product.is_sold_out && (
                                    <span style={{
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        padding: '4px 10px',
                                        fontWeight: '900',
                                        fontSize: '0.7rem',
                                        borderRadius: '4px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em'
                                    }}>Sold Out</span>
                                )}
                            </div>
                            <button
                                onClick={() => setIsFavorite(!isFavorite)}
                                style={{ background: 'none', border: 'none', color: isFavorite ? 'var(--primary-red)' : '#ccc' }}
                            >
                                <Heart fill={isFavorite ? 'var(--primary-red)' : 'none'} size={24} />
                            </button>
                        </div>
                    </div>

                    {/* Title - Full Title Shown */}
                    <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', marginTop: '1px' }}>
                        <h1 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.5rem)', fontWeight: '800', lineHeight: '1.3', color: 'var(--text-dark)', margin: 0 }}>
                            {product.title}
                        </h1>
                    </div>

                    {/* Delivery Section */}
                    <div style={{ backgroundColor: 'white', padding: '15px', marginTop: '10px' }}>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '15px' }}>
                            <Truck size={18} color="#2dd4bf" />
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.9rem', color: '#333' }}>
                                        Guaranteed to get by {(() => {
                                            const daysStr = product.delivery_days || '2-3';
                                            const parts = daysStr.split('-').map(p => parseInt(p.trim()));
                                            const date1 = new Date();
                                            date1.setDate(date1.getDate() + (parts[0] || 2));
                                            
                                            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                            
                                            if (parts.length > 1) {
                                                const date2 = new Date();
                                                date2.setDate(date2.getDate() + parts[1]);
                                                
                                                if (date1.getMonth() === date2.getMonth()) {
                                                    return `${date1.getDate()} - ${date2.getDate()} ${months[date1.getMonth()]}`;
                                                } else {
                                                    return `${date1.getDate()} ${months[date1.getMonth()]} - ${date2.getDate()} ${months[date2.getMonth()]}`;
                                                }
                                            } else {
                                                return `${date1.getDate()} ${months[date1.getMonth()]}`;
                                            }
                                        })()}
                                    </span>
                                    <ChevronRight size={16} color="#ccc" />
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', borderTop: '0.5px solid #eee', paddingTop: '15px' }}>
                            <ShieldCheck size={18} color="var(--primary-red)" />
                            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {product.show_shopinepal !== false && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--primary-red)', border: '1px solid var(--primary-red)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>ShopyNepal Official</span>
                                    )}
                                    {product.is_cod !== false && (
                                        <span style={{ fontSize: '0.75rem', color: '#10b981', border: '1px solid #10b981', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>Cash on Delivery</span>
                                    )}
                                    {product.is_prepaid && (
                                        <span style={{ fontSize: '0.75rem', color: '#3b82f6', border: '1px solid #3b82f6', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>Prepaid Payment</span>
                                    )}
                                    {product.is_prebook && (
                                        <span style={{ fontSize: '0.75rem', color: '#f59e0b', border: '1px solid #f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>Pre-booking Avail.</span>
                                    )}
                                </div>
                                <ChevronRight size={16} color="#ccc" />
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            {/* Separate Description Card - Matching Delivery Section Style */}
            <div style={{ backgroundColor: 'white', padding: '15px', marginTop: '10px', maxWidth: '1100px', margin: '10px auto' }}>
                <h3 style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: '800', 
                    color: '#111',
                    marginBottom: '15px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.08em',
                    borderBottom: '1.5px solid var(--primary-red)',
                    display: 'inline-block',
                    paddingBottom: '4px'
                }}>
                    Description
                </h3>
                <div style={{ 
                    fontSize: '0.95rem', 
                    color: '#444', 
                    lineHeight: '1.6', 
                    whiteSpace: 'pre-wrap', 
                    wordBreak: 'break-word'
                }}>
                    {product.description || 'No description provided for this product.'}
                </div>
            </div>

            {/* Ratings & Reviews Section */}
            <div style={{ backgroundColor: 'white', padding: '20px', marginTop: '10px', maxWidth: '1100px', margin: '10px auto', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#111', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Reviews</h3>
                    {ratings.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ display: 'flex', gap: '2px' }}>
                                {[1,2,3,4,5].map(s => (
                                    <Star key={s} size={14} fill={s <= Math.round(averageRating) ? "#f59e0b" : "none"} color={s <= Math.round(averageRating) ? "#f59e0b" : "#cbd5e1"} />
                                ))}
                            </div>
                            <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#111' }}>{averageRating} / 5</span>
                        </div>
                    )}
                </div>

                {loadingRatings ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Loader2 className="animate-spin" size={24} color="#64748b" />
                    </div>
                ) : ratings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: '12px' }}>
                        <MessageCircle size={32} color="#cbd5e1" style={{ marginBottom: '10px' }} />
                        <p style={{ color: '#64748b', fontSize: '0.9rem', fontWeight: '600' }}>No reviews yet. Be the first to buy and rate this product!</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* Rating Summary Bar (Quick visual) */}
                        <div style={{ display: 'flex', gap: '20px', padding: '20px', background: '#f8fafc', borderRadius: '12px', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'center', borderRight: '1px solid #e2e8f0', paddingRight: '20px' }}>
                                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111' }}>{averageRating}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700' }}>Out of 5</div>
                            </div>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                {[5,4,3,2,1].map(star => {
                                    const count = ratings.filter(r => r.rating === star).length;
                                    const percentage = (count / ratings.length) * 100;
                                    return (
                                        <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '0.8rem', color: '#64748b', width: '15px' }}>{star}</span>
                                            <Star size={10} fill="#f59e0b" color="#f59e0b" />
                                            <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${percentage}%`, height: '100%', background: '#f59e0b' }} />
                                            </div>
                                            <span style={{ fontSize: '0.8rem', color: '#94a3b8', width: '20px' }}>{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Individual Reviews */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {ratings.map((rev) => (
                                <div key={rev.id} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '15px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <User size={14} color="#64748b" />
                                            </div>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1e293b' }}>{rev.customer_name || 'Verified Buyer'}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '2px' }}>
                                            {[1,2,3,4,5].map(s => (
                                                <Star key={s} size={10} fill={s <= rev.rating ? "#f59e0b" : "none"} color={s <= rev.rating ? "#f59e0b" : "#cbd5e1"} />
                                            ))}
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: '1.5', margin: '0' }}>{rev.comment || 'Perfect!'}</p>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '8px', display: 'block' }}>{new Date(rev.created_at).toLocaleDateString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky Bottom Bar */}
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, height: '70px',
                backgroundColor: 'white', borderTop: '1px solid var(--border-color)',
                display: 'flex', zIndex: 1000, padding: '8px 12px', gap: '12px',
                paddingBottom: 'calc(8px + var(--safe-bottom))',
                boxShadow: '0 -4px 10px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ width: '44px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                        <MessageCircle size={20} color="var(--primary-blue)" />
                    </div>
                    <button
                        onClick={product.is_sold_out ? null : handleAddToCartTrigger}
                        style={{ 
                            width: '44px', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
                            background: product.is_sold_out ? '#f1f5f9' : '#f8fafc', 
                            borderRadius: '12px', border: '1px solid var(--border-color)', 
                            padding: 0, minWidth: '44px',
                            opacity: product.is_sold_out ? 0.6 : 1,
                            cursor: product.is_sold_out ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <ShoppingCart size={20} color={product.is_sold_out ? "#94a3b8" : "var(--primary-blue)"} />
                    </button>
                </div>
                <button
                    onClick={product.is_sold_out ? null : handleBuyNowTrigger}
                    className="btn btn-primary"
                    style={{
                        flex: 1,
                        fontSize: '1rem',
                        fontWeight: '800',
                        borderRadius: '12px',
                        backgroundColor: product.is_sold_out ? '#94a3b8' : 'var(--primary-red)',
                        border: 'none',
                        cursor: product.is_sold_out ? 'not-allowed' : 'pointer'
                    }}
                >
                    {product.is_sold_out ? 'Sold Out' : 'Buy Now'}
                </button>
            </div>

            {/* Variation & Size Selection Picker - Bottom Sheet */}
            {isPickerOpen && (
                <div className="modal-overlay" onClick={() => setIsPickerOpen(false)}>
                    <div 
                        className="modal-content"
                        onClick={e => e.stopPropagation()}
                        style={{ padding: '1.5rem', position: 'relative' }}
                    >
                        {/* Header: Small Img + Title */}
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                            <div className="card" style={{ width: '80px', height: '80px', borderRadius: '0.75rem', flexShrink: 0 }}>
                                <img src={images[activeImageIndex]?.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                <p style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--primary-red)', margin: 0 }}>Rs. {activePrice.toLocaleString()}</p>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-gray)', marginTop: '2px' }}>
                                    {images[activeImageIndex]?.label ? `Variation: ${images[activeImageIndex].label}` : 'Select Variation'}
                                </p>
                            </div>
                            <button onClick={() => setIsPickerOpen(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: '#f1f5f9', borderRadius: '50%', padding: '4px', minHeight: '32px', minWidth: '32px' }}>
                                <X size={20} color="var(--text-gray)" />
                            </button>
                        </div>

                        {/* Options Selection */}
                        <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingBottom: '80px' }}>
                            
                            {/* COLOR SELECTION */}
                            <div style={{ marginBottom: '25px' }}>
                                <p style={{ fontSize: '0.9rem', fontWeight: '900', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Select Color</p>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {uniqueColors.map((color) => {
                                        const isSelected = selectedColor === color;
                                        const hasStock = variants.some(v => v.color === color && v.current_stock > 0);
                                        return (
                                            <div 
                                                key={color} 
                                                onClick={() => { setSelectedColor(color); setSelectedSize(null); }}
                                                style={{
                                                    padding: '8px 20px',
                                                    borderRadius: '12px',
                                                    border: isSelected ? '2px solid var(--primary-red)' : '1px solid #e2e8f0',
                                                    background: isSelected ? 'rgba(239, 68, 68, 0.05)' : (hasStock ? 'white' : '#f8fafc'),
                                                    cursor: 'pointer',
                                                    fontSize: '0.9rem',
                                                    fontWeight: isSelected ? '900' : '600',
                                                    color: isSelected ? 'var(--primary-red)' : (hasStock ? '#475569' : '#cbd5e1'),
                                                    opacity: hasStock ? 1 : 0.6
                                                }}
                                            >
                                                {color}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SIZE SELECTION (Filtered by Color) */}
                            {selectedColor && (
                                <div style={{ marginBottom: '20px' }}>
                                    <p style={{ fontSize: '0.9rem', fontWeight: '900', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. Select Size</p>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        {filteredSizes.map(v => {
                                            const isSelected = selectedSize === v.size;
                                            const isOOS = v.current_stock <= 0;
                                            return (
                                                <div 
                                                    key={v.variant_id} 
                                                    onClick={() => !isOOS && setSelectedSize(v.size)}
                                                    style={{
                                                        minWidth: '60px', height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        border: isSelected ? '2px solid var(--primary-red)' : '1px solid #e2e8f0',
                                                        borderRadius: '12px', 
                                                        fontSize: '0.9rem', 
                                                        fontWeight: isSelected ? '900' : '600',
                                                        cursor: isOOS ? 'not-allowed' : 'pointer',
                                                        position: 'relative',
                                                        backgroundColor: isSelected ? 'rgba(239, 68, 68, 0.05)' : (isOOS ? '#f8fafc' : 'white'),
                                                        color: isOOS ? '#cbd5e1' : (isSelected ? 'var(--primary-red)' : '#475569'),
                                                        opacity: isOOS ? 0.6 : 1
                                                    }}
                                                >
                                                    {v.size}
                                                    {isOOS && (
                                                        <div style={{ position: 'absolute', width: '100%', height: '1.5px', background: '#cbd5e1', transform: 'rotate(-25deg)' }} />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {currentVariant && (
                                        <p style={{ fontSize: '0.75rem', marginTop: '10px', fontWeight: '800', color: currentVariant.current_stock < 5 ? '#ef4444' : '#10b981' }}>
                                            {currentVariant.current_stock < 5 ? `⚠️ Only ${currentVariant.current_stock} left!` : '✅ In Stock'}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Quantity Control */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', padding: '15px', background: '#f8fafc', borderRadius: '15px' }}>
                                <p style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1e293b' }}>Quantity</p>
                                <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: 'white shadow-sm' }}>
                                    <button onClick={() => setQuantity(q => Math.max(1, q - 1))} style={{ width: '40px', height: '40px', border: 'none', background: 'transparent', fontWeight: 'bold' }}>-</button>
                                    <div style={{ width: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: '900' }}>{quantity}</div>
                                    <button onClick={() => setQuantity(q => q + 1)} style={{ width: '40px', height: '40px', border: 'none', background: 'transparent', fontWeight: 'bold' }}>+</button>
                                </div>
                            </div>
                        </div>

                        {/* Final Buy Button */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '15px', backgroundColor: 'white', borderTop: '0.5px solid #eee' }}>
                            <button 
                                onClick={(e) => handleFinalPurchase(e)}
                                disabled={!isSelectionComplete()}
                                style={{
                                    width: '100%', height: '48px', borderRadius: '10px', border: 'none',
                                    backgroundColor: isSelectionComplete() ? 'var(--primary-red)' : '#ccc',
                                    color: 'white', fontWeight: 'bold', fontSize: '1rem', cursor: isSelectionComplete() ? 'pointer' : 'not-allowed'
                                }}
                            >
                                {isSelectionComplete() 
                                    ? (pickerAction === 'buy' ? 'Proceed to Buy' : 'Add to Cart') 
                                    : 'Please Select All Options'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fullscreen Image Overlay */}
            {isFullscreenOpen && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100000,
                    backgroundColor: 'rgba(0, 0, 0, 0.95)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(10px)'
                }}>
                    <button 
                        onClick={() => setIsFullscreenOpen(false)}
                        style={{
                            position: 'absolute', top: '20px', left: '20px',
                            background: 'rgba(255,255,255,0.1)', border: 'none',
                            color: 'white', padding: '10px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            zIndex: 100001
                        }}
                    >
                        <X size={28} />
                    </button>
                    
                    {/* Main Fullscreen Image */}
                    <img 
                        key={activeImageIndex}
                        src={images[activeImageIndex]?.image_url} 
                        alt={product.title}
                        style={{
                            maxWidth: '100vw', maxHeight: '100vh', 
                            objectFit: 'contain', animation: 'fadeIn 0.3s ease-out'
                        }}
                    />

                    {/* Desktop/Fullscreen Arrow Nav */}
                    {images.length > 1 && (
                        <>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '10px', opacity: 0.8 }}
                            >
                                <ChevronLeft size={48} strokeWidth={2} />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', padding: '10px', opacity: 0.8 }}
                            >
                                <ChevronRight size={48} strokeWidth={2} />
                            </button>
                            <div style={{
                                position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
                                color: 'white', background: 'rgba(0,0,0,0.5)', padding: '5px 15px', borderRadius: '20px',
                                fontSize: '0.85rem', fontWeight: 'bold'
                            }}>
                                {activeImageIndex + 1} / {images.length}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Custom Animations & Swiper Styles */}
            <style jsx="true">{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .image-nav-btn {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 44px;
                    height: 44px;
                    background: transparent;
                    color: #1e293b; /* Dark slate color for the icon */
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    opacity: 0.85;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    z-index: 10;
                    padding: 0;
                    /* Strong white glow so it's visible even on dark product images */
                    filter: drop-shadow(0 0 8px rgba(255,255,255,1)) drop-shadow(0 2px 4px rgba(255,255,255,0.8));
                }

                .image-nav-btn:hover {
                    color: var(--primary-red);
                    transform: translateY(-50%) scale(1.15);
                    opacity: 1;
                }

                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }

                @media (max-width: 991px) {
                    .image-nav-btn {
                        opacity: 1 !important;
                        width: 32px;
                        height: 32px;
                    }
                }

                @media (min-width: 992px) {
                    .product-layout {
                        display: grid !important;
                        grid-template-columns: 450px 1fr !important;
                        gap: 2rem !important;
                        max-width: 1100px !important;
                        margin: 2rem auto !important;
                        padding: 0 1rem !important;
                        align-items: start !important;
                    }
                    .details-column {
                        background-color: transparent !important;
                        margin-top: 0 !important;
                    }
                    .details-column > div {
                        border-radius: 8px !important;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
                        margin-bottom: 1rem !important;
                    }
                    .main-image-container {
                        border-radius: 12px !important;
                        overflow: hidden !important;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
                    }
                    /* Adjust floating nav for desktop inside the layout */
                    .product-layout .image-column {
                        position: sticky !important;
                        top: 20px !important;
                    }
                    .mobile-floating-nav {
                        display: flex !important;
                        top: 15px !important;
                        left: 15px !important;
                        right: 15px !important;
                    }
                }
            `}</style>
        </div>
    );
};

export default ProductDetail;
