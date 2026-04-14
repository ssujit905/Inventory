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
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2.5rem' }}>
                    <button onClick={() => navigate(-1)} style={{ background: 'white', border: '1px solid #e2e8f0', width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: 'var(--shadow-sm)' }}>
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: '950', color: '#0f172a' }}>My Cart</h1>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: '600' }}>{cart.length} {cart.length === 1 ? 'item' : 'items'} in your bag</p>
                    </div>
                </div>

                {/* Select All Bar */}
                <div style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    padding: '1.25rem 1.5rem', background: 'white', borderRadius: '1.25rem',
                    border: '1px solid #e2e8f0', marginBottom: '1.5rem', boxShadow: 'var(--shadow-sm)'
                }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontWeight: '800', fontSize: '0.95rem' }}>
                        <input 
                            type="checkbox" 
                            checked={cart.every(item => item.selected)}
                            onChange={() => {
                                const allSelected = cart.every(item => item.selected);
                                cart.forEach(item => {
                                    if (item.selected === allSelected) toggleSelectItem(item.cartKey || item.id);
                                });
                            }}
                            style={{ width: '22px', height: '22px', accentColor: 'var(--primary-blue)' }}
                        />
                        Select All
                    </label>
                    <button onClick={clearCart} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: '800', fontSize: '0.85rem' }}>Clear All</button>
                </div>

                <div className="cart-grid">
                    {/* Items List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {cart.map((item) => (
                            <div key={item.cartKey || item.id} style={{
                                display: 'grid', gridTemplateColumns: '100px 1fr', gap: '1.25rem',
                                padding: '1rem', background: 'white', borderRadius: '1.5rem',
                                border: '1px solid #e2e8f0', position: 'relative',
                                opacity: item.selected ? 1 : 0.7, transition: 'all 0.3s'
                            }}>
                                <div style={{ position: 'relative' }}>
                                    <img src={item.image} alt={item.title} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '1rem' }} />
                                    <input 
                                        type="checkbox" 
                                        checked={item.selected}
                                        onChange={() => toggleSelectItem(item.cartKey || item.id)}
                                        style={{ position: 'absolute', top: '-8px', left: '-8px', width: '24px', height: '24px', accentColor: 'var(--primary-blue)', border: '2px solid white', borderRadius: '50%' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingRight: '2rem' }}>
                                    <Link to={`/product/${item.id}`} style={{ textDecoration: 'none', color: '#0f172a' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: '900', lineHeight: '1.3' }}>{item.title}</h3>
                                    </Link>
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>
                                        {item.selectedSize && `Size: ${item.selectedSize}`} {item.variationLabel && `| ${item.variationLabel}`}
                                    </p>
                                    <p style={{ fontSize: '1.1rem', fontWeight: '950', color: 'var(--primary-red)', margin: '0.25rem 0' }}>Rs. {item.price.toLocaleString()}</p>
                                    
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '2px', borderRadius: '100px', border: '1px solid #e2e8f0' }}>
                                            <button onClick={() => updateQuantity(item.cartKey || item.id, item.quantity - 1)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Minus size={14} /></button>
                                            <span style={{ width: '30px', textAlign: 'center', fontWeight: '900', fontSize: '0.9rem' }}>{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.cartKey || item.id, item.quantity + 1)} style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={14} /></button>
                                        </div>
                                        <button onClick={() => removeFromCart(item.cartKey || item.id)} style={{ background: '#fef2f2', border: 'none', padding: '0.6rem', borderRadius: '12px', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Trash2 size={18} />
                                        </button>
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
                    <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Amount</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '950', color: 'var(--primary-red)' }}>Rs. {cartTotal.toLocaleString()}</span>
                </div>
                <button 
                    onClick={() => selectedCount > 0 && navigate('/checkout')}
                    disabled={selectedCount === 0}
                    style={{ 
                        padding: '1rem 1.75rem', borderRadius: '100px', 
                        background: selectedCount > 0 ? '#0f172a' : '#cbd5e1', 
                        color: 'white', fontWeight: '900', border: 'none',
                        boxShadow: '0 10px 20px rgba(15, 23, 42, 0.15)',
                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                    }}
                >
                    Checkout <ChevronRight size={20} />
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
