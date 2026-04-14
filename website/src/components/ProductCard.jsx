import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { MapPin, Truck } from 'lucide-react';

const ProductCard = ({ product }) => {

    const discount = product.originalPrice
        ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
        : 0;

    return (
        <div style={{
            backgroundColor: 'white',
            borderRadius: '0.25rem', // Sharper corners for a commercial look
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'all 0.2s ease',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            position: 'relative',
            border: '1px solid transparent'
        }}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                e.currentTarget.style.borderColor = 'var(--primary-red)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                e.currentTarget.style.borderColor = 'transparent';
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
                        opacity: product.is_sold_out ? 0.6 : 1
                    }}
                />

                {product.is_sold_out && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: 'rgba(255,255,255,0.3)',
                        zIndex: 2
                    }}>
                        <span style={{
                            backgroundColor: '#ef4444',
                            color: 'white',
                            padding: '4px 10px',
                            fontWeight: '900',
                            fontSize: '0.7rem',
                            borderRadius: '2px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}>Sold Out</span>
                    </div>
                )}
            </Link>

            <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.5rem' }}>
                {/* Title */}
                <Link to={`/product/${product.id}`}>
                    <h3 style={{
                        fontSize: '0.9rem',
                        fontWeight: '400',
                        lineHeight: '1.4',
                        height: '2.8em',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        color: 'var(--text-dark)'
                    }}>
                        {product.title}
                    </h3>
                </Link>

                {/* Trust Badges */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {product.show_shopinepal !== false && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: 'var(--primary-red)',
                            border: '1.2px solid var(--primary-red)',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em'
                        }}>ShopyNepal</span>
                    )}

                    {/* COD Badge - only show if explicitly true, or as default if others aren't set */}
                    {(product.is_cod === true || (product.is_cod === undefined && !product.is_prepaid && !product.is_prebook)) && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: '#10b981', // Emerald Green
                            border: '1.2px solid #10b981',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em'
                        }}>COD</span>
                    )}

                    {product.is_prepaid === true && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: '#3b82f6', // Bright Blue
                            border: '1.2px solid #3b82f6',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em'
                        }}>Prepaid</span>
                    )}

                    {product.is_prebook === true && (
                        <span style={{
                            fontSize: '0.65rem',
                            color: '#f59e0b', // Amber/Orange
                            border: '1.2px solid #f59e0b',
                            padding: '1px 6px',
                            borderRadius: '3px',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em'
                        }}>Pre-booking</span>
                    )}
                </div>

                {/* Price - Only show price as requested */}
                <div style={{ marginTop: '0.25rem' }}>
                    <span style={{
                        fontWeight: '800',
                        fontSize: '1.1rem',
                        color: 'var(--primary-red)'
                    }}>
                        Rs. {product.price.toLocaleString()}
                    </span>
                    {product.original_price && (
                        <span style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-gray)',
                            textDecoration: 'line-through',
                            marginLeft: '0.5rem',
                            fontWeight: '500'
                        }}>
                            Rs. {product.original_price.toLocaleString()}
                        </span>
                    )}
                </div>

                {/* Ship From Location */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
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
