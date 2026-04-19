import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, ArrowLeft, CheckCircle2, ChevronRight } from 'lucide-react';

const Cart = () => {
    const { cart, removeFromCart, updateQuantity, toggleSelectItem, cartTotal, selectedCount, clearCart } = useCart();
    const navigate = useNavigate();

    if (cart.length === 0) {
        return (
            <div className="section" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="container" style={{ textAlign: 'center', padding: '0 2rem' }}>
                    <div style={{ 
                        width: '120px', height: '120px', background: '#f8fafc', borderRadius: '50%', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)'
                    }}>
                        <ShoppingBag size={50} color="#cbd5e1" strokeWidth={1.5} />
                    </div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: '950', color: '#0f172a', marginBottom: '1rem' }}>Your cart is empty</h2>
                    <p style={{ color: '#64748b', fontSize: '1.1rem', fontWeight: '500', maxWidth: '320px', margin: '0 auto 2.5rem', lineHeight: '1.6' }}>
                        Discovery awaits! Start adding items to your cart to begin your shopping journey.
                    </p>
                    <Link to="/shop" className="btn btn-primary" style={{ padding: '1.15rem 2.5rem', borderRadius: '100px', fontSize: '1.1rem' }}>
                        Start Shopping <ArrowRight size={20} style={{ marginLeft: '8px' }} />
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="cart-page" style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: '120px' }}>
            <div className="container" style={{ padding: '2rem 1rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
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
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: '950', color: '#0f172a' }}>My Cart</h1>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600' }}>{cart.length} {cart.length === 1 ? 'item' : 'items'} in your bag</p>
                    </div>
                </div>

                {/* Select All Bar */}
                <div style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '1rem', background: 'white', borderRadius: '0.5rem',
                    marginBottom: '0.75rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: '500', fontSize: '0.9rem' }}>
                        <input 
                            type="checkbox" 
                            checked={cart.length > 0 && cart.every(item => item.selected)}
                            onChange={() => {
                                const allSelected = cart.every(item => item.selected);
                                cart.forEach(item => {
                                    if (item.selected === allSelected) toggleSelectItem(item.cartKey || item.id);
                                });
                            }}
                            style={{ width: '18px', height: '18px', accentColor: 'var(--primary-red)' }}
                        />
                        Select All ({cart.length})
                    </label>
                </div>

                <div className="cart-grid">
                    {/* Items List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {cart.map((item) => (
                            <div key={item.cartKey || item.id} style={{
                                display: 'flex', alignItems: 'stretch', gap: '0.75rem',
                                padding: '1rem', background: 'white', borderRadius: '0.5rem',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)', position: 'relative',
                                opacity: item.selected ? 1 : 0.6, transition: 'opacity 0.3s'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={item.selected}
                                        onChange={() => toggleSelectItem(item.cartKey || item.id)}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--primary-red)' }}
                                    />
                                </div>
                                <img src={item.image} alt={item.title} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '0.25rem', border: '1px solid #f1f5f9' }} />

                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1, paddingRight: '1rem' }}>
                                            <Link to={`/product/${item.id}`} style={{ textDecoration: 'none', color: '#0f172a' }}>
                                                <h3 style={{ fontSize: '0.85rem', fontWeight: '400', lineHeight: '1.4', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.title}</h3>
                                            </Link>
                                            {(item.selectedSize || item.variationLabel || item.selectedColor) && (
                                                <div style={{ fontSize: '0.7rem', color: '#64748b', background: '#f8fafc', padding: '2px 6px', borderRadius: '2px', display: 'inline-block', marginTop: '4px', border: '1px solid #e2e8f0' }}>
                                                    {item.selectedSize && `Size: ${item.selectedSize} `}
                                                    {item.selectedColor && `Variant: ${item.selectedColor} `}
                                                    {item.variationLabel && `${(item.selectedSize || item.selectedColor) ? '| ' : ''}${item.variationLabel}`}
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => removeFromCart(item.cartKey || item.id)} style={{ background: 'none', border: 'none', color: '#000000', padding: '0', cursor: 'pointer' }}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                        <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-red)' }}>Rs. {item.price.toLocaleString()}</span>
                                        <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '500' }}>x{item.quantity}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Summary Sidebar (Desktop) */}
                    <div className="desktop-summary" style={{ background: 'white', padding: '2rem', borderRadius: '2rem', border: '1px solid #e2e8f0', height: 'fit-content', position: 'sticky', top: '100px' }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: '900', marginBottom: '1.5rem' }}>Order Summary</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', color: '#64748b' }}>
                                <span>Subtotal</span>
                                <span>Rs. {cartTotal.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', color: '#64748b' }}>
                                <span>Shipping Fee</span>
                                <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '0.2rem 0.6rem', borderRadius: '100px' }}>At Checkout</span>
                            </div>
                            <div style={{ borderTop: '2px dashed #e2e8f0', paddingTop: '1.5rem', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontWeight: '950', fontSize: '1.5rem', color: 'var(--primary-red)' }}>
                                <span>Total</span>
                                <span>Rs. {cartTotal.toLocaleString()}</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => selectedCount > 0 && navigate('/checkout')} 
                            disabled={selectedCount === 0}
                            style={{ width: '100%', padding: '1.25rem', borderRadius: '100px', background: selectedCount > 0 ? '#0f172a' : '#cbd5e1', color: 'white', fontWeight: '900', fontSize: '1.1rem', border: 'none' }}
                        >
                            Proceed to Checkout ({selectedCount})
                        </button>
                    </div>
                </div>
            </div>

            {/* Sticky Mobile Bottom Bar */}
            <div className="mobile-only" style={{ 
                position: 'fixed', bottom: 0, left: 0, right: 0, 
                background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(20px)',
                borderTop: '1px solid #e2e8f0', padding: '1.25rem 1.5rem calc(1.25rem + env(safe-area-inset-bottom))',
                zIndex: 1000, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#000' }}>Total</span>
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--primary-red)' }}>Rs. {cartTotal.toLocaleString()}</span>
                </div>
                <button 
                    onClick={() => selectedCount > 0 && navigate('/checkout')}
                    disabled={selectedCount === 0}
                    style={{ 
                        padding: '0.75rem 2rem', borderRadius: '0.25rem', 
                        background: selectedCount > 0 ? 'var(--primary-red)' : '#cbd5e1', 
                        color: 'white', fontWeight: '600', border: 'none',
                        display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem'
                    }}
                >
                    Checkout ({selectedCount})
                </button>
            </div>

            <style>{`
                .cart-grid { display: grid; grid-template-columns: 1fr; gap: 2rem; }
                .desktop-summary { display: none; }
                @media (min-width: 992px) {
                    .cart-grid { grid-template-columns: 1fr 400px; }
                    .desktop-summary { display: block; }
                    .mobile-only { display: none !important; }
                }
            `}</style>
        </div>
    );
};

export default Cart;
