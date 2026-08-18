import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import ProductCard from '../components/ProductCard';
import { storeSlug, isUuid } from '../lib/storeSlug';
import { Store, Star, Package, MessageCircle, ArrowLeft, Search, Calendar, Phone, Share2, Check } from 'lucide-react';

const StorePage = () => {
    const { vendorId: param } = useParams();
    const location = useLocation();
    const backTarget = location.state?.from || '/shop';
    const [vendorId, setVendorId] = useState(null);
    const [vendorProfile, setVendorProfile] = useState(null);
    const [products, setProducts] = useState([]);
    const [vendorRating, setVendorRating] = useState(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!param) return;
        setLoading(true);
        setNotFound(false);
        if (isUuid(param)) {
            setVendorId(param);
        } else {
            resolveSlug(param);
        }
    }, [param]);

    const resolveSlug = async (slug) => {
        try {
            const { data } = await supabase
                .from('vendor_store_profiles')
                .select('id, store_name, full_name');
            const match = (data || []).find(p => storeSlug(p) === slug);
            if (!match) {
                setNotFound(true);
                setLoading(false);
                return;
            }
            setVendorId(match.id);
        } catch (err) {
            setNotFound(true);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (vendorId) fetchStore(vendorId);
    }, [vendorId]);

    const fetchStore = async (id) => {
        setLoading(true);
        setNotFound(false);
        try {
            // 1. Vendor store profile
            const { data: vProfile } = await supabase
                .from('vendor_store_profiles')
                .select('id, full_name, store_name, avatar_url, is_verified, phone, whatsapp, address, city, description, created_at')
                .eq('id', id)
                .maybeSingle();
            if (!vProfile) {
                setNotFound(true);
                return;
            }
            setVendorProfile(vProfile);

            // 2. Store products (active only)
            const { data: wpData } = await supabase
                .from('website_products')
                .select('*, website_product_images(*)')
                .eq('vendor_id', id)
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            const rawProducts = wpData || [];

            // 3. Store rating = average of all ratings on the store's products
            const productIds = rawProducts.map(p => p.id);
            if (productIds.length > 0) {
                const { data: storeRatings } = await supabase
                    .from('website_product_ratings')
                    .select('rating')
                    .in('product_id', productIds);
                const all = storeRatings || [];
                if (all.length > 0) {
                    const avg = all.reduce((s, r) => s + Number(r.rating), 0) / all.length;
                    setVendorRating({ avg, count: all.length });
                }
            }

            // 4. Stock info for sold-out badges
            const { data: stockData } = await supabase
                .from('website_variant_stock_view')
                .select('*');

            const normalized = rawProducts.map(p => {
                const primaryImg = p.website_product_images?.find(i => i.is_primary) || p.website_product_images?.[0];
                const images = (p.website_product_images || [])
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map(img => ({ url: img.image_url, label: img.label || '' }));
                const productVariants = (stockData || []).filter(v => v.parent_product_id === p.id);
                const totalStock = productVariants.reduce((acc, curr) => acc + (Number(curr.current_stock) || 0), 0);
                const isSoldOut = p.is_sold_out || (productVariants.length > 0 && totalStock <= 0);
                return {
                    id: p.id,
                    title: p.title,
                    description: p.description,
                    price: p.price,
                    original_price: p.original_price,
                    category: p.category,
                    image: primaryImg?.image_url || '',
                    images,
                    location: p.city,
                    city: p.city,
                    shippingDays: `${p.delivery_days} Days Delivery`,
                    delivery_days: p.delivery_days,
                    is_featured: p.is_featured,
                    show_shopinepal: p.show_shopinepal,
                    is_cod: p.is_cod,
                    is_prepaid: p.is_prepaid,
                    is_prebook: p.is_prebook,
                    allow_cod: p.allow_cod ?? true,
                    allow_esewa: p.allow_esewa ?? true,
                    allow_fonepay: p.allow_fonepay ?? true,
                    is_sold_out: isSoldOut,
                    total_stock: totalStock,
                    variant_count: productVariants.length,
                    sizes: p.sizes || '',
                    sold: p.sold_count,
                    sold_count: p.sold_count,
                    ad_id: p.ad_id,
                    variations: productVariants
                };
            });
            setProducts(normalized);
        } catch (err) {
            console.error('Error fetching store:', err);
        } finally {
            setLoading(false);
        }
    };

    const storeName = vendorProfile?.store_name || vendorProfile?.full_name || 'Vendor Store';
    const joinedDate = vendorProfile?.created_at ? new Date(vendorProfile.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null;
    const phoneNumber = vendorProfile?.phone || '';
    const whatsappNumber = vendorProfile?.whatsapp || '';

    const copyStoreLink = async () => {
        const url = `${window.location.origin}/store/${storeSlug(vendorProfile)}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    return (
        <div className="shop-page" style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '5rem' }}>
            <div className="container" style={{ paddingTop: '1.5rem', maxWidth: '1100px' }}>
                <Link
                    to={backTarget}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        fontSize: '0.85rem', fontWeight: '700', color: '#64748b',
                        marginBottom: '1rem', textDecoration: 'none'
                    }}
                >
                    <ArrowLeft size={16} /> Back to Shop
                </Link>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
                        <div className="skeleton skeleton-img" style={{ width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto' }} />
                    </div>
                ) : notFound ? (
                    <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
                        <div style={{ width: '80px', height: '80px', background: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                            <Search size={32} color="var(--border-color)" />
                        </div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '800' }}>Store not found</h2>
                        <p style={{ color: 'var(--text-gray)', marginTop: '0.5rem' }}>This store may no longer be available.</p>
                        <Link to="/shop" className="btn btn-primary" style={{ padding: '0.75rem 2rem', marginTop: '1.5rem', display: 'inline-block' }}>
                            Browse Products
                        </Link>
                    </div>
                ) : (
                    <>
                        {/* Store Header - Full Screen Width */}
                        <div style={{
                            backgroundColor: 'white', borderBottom: '1px solid #e2e8f0',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.03)',
                            padding: '24px 16px', marginBottom: '1.5rem',
                            width: '100vw', marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)'
                        }}>
                            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px' }}>
                                {vendorProfile?.avatar_url ? (
                                    <img
                                        src={vendorProfile.avatar_url}
                                        alt={storeName}
                                        style={{
                                            width: '56px', height: '56px', borderRadius: '16px',
                                            objectFit: 'cover', border: '2px solid #f1f5f9',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                                        }}
                                    />
                                ) : (
                                    <div style={{
                                        width: '56px', height: '56px', borderRadius: '16px',
                                        background: 'linear-gradient(135deg, var(--primary-red, #f43f5e), #e11d48)',
                                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: '900', fontSize: '1.4rem', boxShadow: '0 4px 12px rgba(225,29,72,0.25)'
                                    }}>
                                        <Store size={26} />
                                    </div>
                                )}
                                <div style={{ flex: 1 }}>
                                    <h1 style={{ fontSize: '1.3rem', fontWeight: '900', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        {storeName}
                                        {vendorProfile?.is_verified && (
                                            <span
                                                title="Verified Store"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                    background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0',
                                                    borderRadius: '999px', padding: '3px 10px', fontSize: '0.68rem',
                                                    fontWeight: '800', letterSpacing: '0.04em'
                                                }}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                                                    <path d="m9 12 2 2 4-4" />
                                                </svg>
                                                Verified
                                            </span>
                                        )}
                                    </h1>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '3px 0 0 0' }}>
                                        {vendorProfile?.city || vendorProfile?.address ? `${vendorProfile.city || ''} ${vendorProfile.address || ''}` : 'Official Shopy Nepal Partner Store'}
                                    </p>
                                </div>
                            </div>

                            {/* Store Stats */}
                            <div style={{
                                display: 'flex', alignItems: 'stretch',
                                padding: '10px 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9'
                            }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        <Star size={12} fill="#f59e0b" color="#f59e0b" /> Rating
                                    </div>
                                    <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0f172a' }}>
                                        {vendorRating ? vendorRating.avg.toFixed(1) : '0.0'}
                                    </span>
                                </div>
                                <div style={{ width: '1px', background: '#e2e8f0' }} />
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        <Package size={12} color="var(--primary-red, #f43f5e)" /> Products
                                    </div>
                                    <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0f172a' }}>{products.length}</span>
                                </div>
                                <div style={{ width: '1px', background: '#e2e8f0' }} />
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        <MessageCircle size={12} color="#16a34a" /> Response
                                    </div>
                                    <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0f172a' }}>100%</span>
                                </div>
                            </div>

                            {vendorProfile?.description && (
                                <p style={{
                                    fontSize: '0.85rem', color: '#475569', lineHeight: '1.6',
                                    background: '#f8fafc', padding: '12px 16px', borderRadius: '12px',
                                    margin: '14px 0 0 0', borderLeft: '3px solid var(--primary-red, #f43f5e)'
                                }}>
                                    {vendorProfile.description}
                                </p>
                            )}

                            {/* Store Contact Details */}
                            {(joinedDate || phoneNumber || whatsappNumber) && (
                                <div style={{ margin: '14px 0 0 0' }}>
                                    {joinedDate && (
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            background: '#f1f5f9', color: '#475569', borderRadius: '999px',
                                            padding: '6px 14px', fontSize: '0.78rem', fontWeight: '700'
                                        }}>
                                            <Calendar size={13} color="#64748b" /> Joined {joinedDate}
                                        </span>
                                    )}
                                    {(phoneNumber || whatsappNumber) && (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                                            marginTop: '10px'
                                        }}>
                                            {phoneNumber && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    background: '#eff6ff', color: '#2563eb', borderRadius: '999px',
                                                    padding: '6px 14px', fontSize: '0.78rem', fontWeight: '700'
                                                }}>
                                                    <Phone size={13} /> {phoneNumber}
                                                </span>
                                            )}
                                            {whatsappNumber && (
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                    background: '#ecfdf5', color: '#059669', borderRadius: '999px',
                                                    padding: '6px 14px', fontSize: '0.78rem', fontWeight: '700'
                                                }}>
                                                    <MessageCircle size={13} /> {whatsappNumber}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <button
                                        onClick={copyStoreLink}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            background: copied ? '#ecfdf5' : '#f8fafc',
                                            color: copied ? '#059669' : '#334155',
                                            border: `1px solid ${copied ? '#a7f3d0' : '#e2e8f0'}`,
                                            borderRadius: '999px', padding: '6px 14px',
                                            fontSize: '0.78rem', fontWeight: '800', cursor: 'pointer',
                                            marginTop: '10px', transition: 'all 0.2s ease'
                                        }}
                                    >
                                        {copied ? <Check size={14} /> : <Share2 size={14} />}
                                        {copied ? 'Copied!' : 'Copy Store Link'}
                                    </button>
                                </div>
                            )}
                            </div>
                        </div>

                        {/* Store Products */}
                        <h2 style={{ fontSize: '1rem', fontWeight: '900', color: '#0f172a', margin: '0 0 1rem 0' }}>
                            Products from this store
                        </h2>

                        {products.length > 0 ? (
                            <div className="shop-grid">
                                <div className="grid-column" style={{ paddingTop: '20px' }}>
                                    {products.filter((_, idx) => idx % 2 === 0).map(p => <ProductCard key={p.id} product={p} />)}
                                </div>
                                <div className="grid-column">
                                    {products.filter((_, idx) => idx % 2 !== 0).map(p => <ProductCard key={p.id} product={p} />)}
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '4rem 1rem', background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <div style={{ width: '70px', height: '70px', background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                                    <Package size={28} color="var(--border-color)" />
                                </div>
                                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>No products yet</h3>
                                <p style={{ color: 'var(--text-gray)', marginTop: '0.4rem' }}>This store hasn't listed any products yet.</p>
                            </div>
                        )}
                    </>
                )}
            </div>

            <style>{`
                .shop-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                }
                .grid-column {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                @media (min-width: 992px) {
                    .shop-grid {
                        grid-template-columns: repeat(5, 1fr);
                        gap: 12px;
                    }
                    .grid-column { display: contents; }
                    .grid-column:first-child { padding-top: 0 !important; }
                }
            `}</style>
        </div>
    );
};

export default StorePage;
