import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { MapPin, Sparkles } from 'lucide-react';

const ProductCard = ({ product }) => {

    const isSoldOut = product.is_sold_out || product.isSoldOut === true;
    const originalPrice = product.original_price || product.originalPrice;
    
    const discount = originalPrice
        ? Math.round(((originalPrice - product.price) / originalPrice) * 100)
        : 0;

    return (
        <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem', 
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            border: '1px solid transparent',
            borderBottom: isSoldOut ? '3px solid var(--primary-red)' : '3px solid #000'
        }}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                e.currentTarget.style.borderTopColor = 'var(--primary-red)';
                e.currentTarget.style.borderLeftColor = 'var(--primary-red)';
                e.currentTarget.style.borderRightColor = 'var(--primary-red)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                e.currentTarget.style.borderTopColor = 'transparent';
                e.currentTarget.style.borderLeftColor = 'transparent';
                e.currentTarget.style.borderRightColor = 'transparent';
            }}
        >
            <Link to={`/product/${product.id}`} style={{ display: 'block', position: 'relative' }}>
                <img
                    src={product.image}
                    alt={product.title}
                    style={{
                        width: '100%',
                        aspectRatio: '1',
                        objectFit: 'cover',
                        display: 'block',
                        opacity: isSoldOut ? 0.62 : 1,
                        filter: isSoldOut ? 'grayscale(0.65) contrast(0.9)' : 'none'
                    }}
                />

                {isSoldOut && (
                    <div className="sold-out-overlay">
                        <div className="sold-out-card-badge">
                            <span className="sold-out-icon"><Sparkles size={14} strokeWidth={2.4} /></span>
                            <span>
                                <strong>Sold out</strong>
                                <small>Back soon</small>
                            </span>
                        </div>
                    </div>
                )}
            </Link>

            <div style={{ padding: '0.6rem 0.65rem 0.55rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.4rem' }}>
                {/* Title */}
                <Link to={`/product/${product.id}`}>
                    <h3 style={{
                        fontSize: '0.85rem',
                        fontWeight: '400',
                        lineHeight: '1.3',
                        height: '1.3em',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        color: isSoldOut ? 'var(--text-gray)' : 'var(--text-dark)'
                    }}>
                        {product.title}
                    </h3>
                </Link>

                {/* Trust Badges */}
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'nowrap', overflow: 'hidden' }}>
                    {product.show_shopinepal !== false && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: 'var(--primary-red)',
                            border: '1.2px solid var(--primary-red)',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            opacity: isSoldOut ? 0.5 : 1
                        }}>ShopyNepal</span>
                    )}

                    {/* COD Badge */}
                    {(product.is_cod === true || (product.is_cod === undefined && !product.is_prepaid && !product.is_prebook)) && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: '#10b981', 
                            border: '1.2px solid #10b981',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            opacity: isSoldOut ? 0.5 : 1
                        }}>COD</span>
                    )}

                    {product.is_prepaid === true && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: '#3b82f6', 
                            border: '1.2px solid #3b82f6',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            opacity: isSoldOut ? 0.5 : 1
                        }}>Prepaid</span>
                    )}

                    {product.is_prebook === true && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: '#f59e0b', 
                            border: '1.2px solid #f59e0b',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            opacity: isSoldOut ? 0.5 : 1
                        }}>Pre-booking</span>
                    )}
                </div>

                {/* Price */}
                <div style={{ marginTop: '0.1rem' }}>
                    <span style={{
                        fontWeight: '800',
                        fontSize: '1.1rem',
                        color: isSoldOut ? 'var(--text-gray)' : 'var(--primary-red)'
                    }}>
                        Rs. {product.price.toLocaleString()}
                    </span>
                    {originalPrice && (
                        <span style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-gray)',
                            textDecoration: 'line-through',
                            marginLeft: '0.5rem',
                            fontWeight: '500',
                            opacity: isSoldOut ? 0.5 : 1
                        }}>
                            Rs. {originalPrice.toLocaleString()}
                        </span>
                    )}
                </div>

                {/* Ship From Location */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '-0.3rem' }}>
                    <MapPin size={13} color="#64748b" />
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>
                        {product.city || 'Kathmandu'}
                    </span>
                </div>


            </div>
        </div>
    );
};

export default ProductCard;
