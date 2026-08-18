import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Star, User, Loader2, MessageCircle, ChevronRight } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const AllReviews = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [ratings, setRatings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [productRes, ratingsRes] = await Promise.all([
                    supabase
                        .from('website_products')
                        .select('title')
                        .eq('id', id)
                        .maybeSingle(),
                    supabase
                        .from('website_product_ratings')
                        .select('*')
                        .eq('product_id', id)
                        .order('created_at', { ascending: false })
                ]);

                if (productRes.error) throw productRes.error;
                if (ratingsRes.error) throw ratingsRes.error;

                setProduct(productRes.data);
                setRatings(ratingsRes.data || []);
            } catch (err) {
                console.error('Error fetching reviews:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [id]);

    const averageRating = useMemo(() => {
        if (ratings.length === 0) return 0;
        const total = ratings.reduce((acc, curr) => acc + curr.rating, 0);
        return (total / ratings.length).toFixed(1);
    }, [ratings]);

    return (
        <div style={{ backgroundColor: '#f8fafc', minHeight: '100vh', paddingBottom: '80px' }}>
            {/* Sticky Top Bar */}
            <div style={{
                position: 'sticky', top: 0, zIndex: 100,
                backgroundColor: 'white',
                borderBottom: '1px solid #e2e8f0',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
            }}>
                <div
                    onClick={() => navigate(-1)}
                    style={{
                        width: '40px', height: '40px', borderRadius: '50%',
                        backgroundColor: '#f8fafc', color: '#0f172a',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1px solid #e2e8f0', cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent', flexShrink: 0
                    }}
                >
                    <ArrowLeft size={20} color="#0f172a" strokeWidth={2.2} />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {ratings.length} Reviews
                    </div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {product?.title || 'Customer Reviews'}
                    </div>
                </div>
                <Link to={`/product/${id}`} style={{
                    fontSize: '0.8rem', fontWeight: '700', color: 'var(--primary-red)',
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0
                }}>
                    Product <ChevronRight size={14} />
                </Link>
            </div>

            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '16px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <Loader2 className="animate-spin" size={28} color="#64748b" />
                    </div>
                ) : ratings.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: '16px' }}>
                        <MessageCircle size={36} color="#cbd5e1" style={{ marginBottom: '12px' }} />
                        <p style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: '600' }}>No reviews yet. Be the first to buy and rate this product!</p>
                    </div>
                ) : (
                    <>
                        {/* Rating Summary */}
                        <div style={{ display: 'flex', gap: '20px', padding: '20px', background: 'white', borderRadius: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
                            <div style={{ textAlign: 'center', borderRight: '1px solid #e2e8f0', paddingRight: '20px' }}>
                                <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111' }}>{averageRating}</div>
                                <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', margin: '4px 0' }}>
                                    {[1,2,3,4,5].map(s => (
                                        <Star key={s} size={14} fill={s <= Math.round(averageRating) ? "#f59e0b" : "none"} color={s <= Math.round(averageRating) ? "#f59e0b" : "#cbd5e1"} />
                                    ))}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700' }}>{ratings.length} Reviews</div>
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

                        {/* All Reviews */}
                        <div style={{ background: 'white', borderRadius: '16px', padding: '20px' }}>
                            <h3 style={{ fontSize: '0.85rem', fontWeight: '800', color: '#111', margin: '0 0 15px 0', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1.5px solid var(--primary-red)', display: 'inline-block', paddingBottom: '4px' }}>
                                All Reviews
                            </h3>
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
                    </>
                )}
            </div>
        </div>
    );
};

export default AllReviews;
