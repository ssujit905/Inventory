import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { MapPin, Sparkles, Truck } from 'lucide-react';

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
            aspectRatio: '3 / 5.5',
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
            <Link to={`/product/${product.id}`} style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
                <img
                    src={product.image}
                    alt={product.title}
                    style={{
                        width: '100%',
                        height: '100%',
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

            <div style={{ padding: '0.4rem 0.6rem 0.4rem', display: 'flex', flexDirection: 'column', flexShrink: 0, gap: '0.3rem', justifyContent: 'center' }}>
                {/* Title */}
                <Link to={`/product/${product.id}`}>
                    <h3 style={{
                        fontSize: '0.78rem',
                        fontWeight: '400',
                        lineHeight: '1.3',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        color: isSoldOut ? 'var(--text-gray)' : 'var(--text-dark)'
                    }}>
                        {product.title}
                    </h3>
                </Link>

                {/* Price */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{
                        fontWeight: '800',
                        fontSize: '0.68rem',
                        color: isSoldOut ? 'var(--text-gray)' : 'var(--primary-red)',
                        whiteSpace: 'nowrap'
                    }}>
                        Rs.{product.price.toLocaleString()}
                    </span>
                    {originalPrice && (
                        <span style={{
                            fontSize: '0.6rem',
                            color: 'var(--text-gray)',
                            textDecoration: 'line-through',
                            fontWeight: '500',
                            opacity: isSoldOut ? 0.5 : 1
                        }}>
                            Rs.{originalPrice.toLocaleString()}
                        </span>
                    )}
                </div>

                {/* Ship From + Delivery */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                    <MapPin size={11} color="#64748b" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {product.city || 'Kathmandu'}
                    </span>
                    <span style={{ width: '1px', height: '0.8rem', backgroundColor: '#e2e8f0', flexShrink: 0 }} />
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#10b981', flexShrink: 0 }}>
                        <Truck size={11} />
                        <span style={{ fontSize: '0.6rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                            {product.delivery_days
                                ? (String(product.delivery_days).toLowerCase().includes('day')
                                    ? product.delivery_days
                                    : `${product.delivery_days} days`)
                                : '1-2 days'}
                        </span>
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ProductCard;
