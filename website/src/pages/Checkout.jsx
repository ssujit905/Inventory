import { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { Truck, CreditCard, ArrowLeft, Loader2, MapPin, Info, AlertTriangle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCustomer } from '../context/CustomerContext';

const Checkout = () => {
    const { cart, cartTotal, clearCart, clearSelectedItems } = useCart();
    const { customer, login } = useCustomer();
    const navigate = useNavigate();
    const location = useLocation();

    // Determine if this is a "Buy Now" flow or a regular Cart checkout
    const buyNowItem = location.state?.buyNowItem || null;
    const isBuyNow = !!buyNowItem;

    // Use either the single "Buy Now" item or the selected cart items
    const checkoutItems = isBuyNow 
        ? [buyNowItem] 
        : cart.filter(item => item.selected);

    const checkoutSubtotal = isBuyNow
        ? (buyNowItem.price * buyNowItem.quantity)
        : cartTotal;

    const [isOrdered, setIsOrdered] = useState(false);
    const [orderNumber, setOrderNumber] = useState('');
    const [saving, setSaving] = useState(false);
    const [pin, setPin] = useState('');
    const [creatingAccount, setCreatingAccount] = useState(false);
    const [accountCreated, setAccountCreated] = useState(false);
    const [cartReady, setCartReady] = useState(false);
    const [checkoutError, setCheckoutError] = useState(null);

    // Delivery branches from DB
    const [branches, setBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(true);
    const [selectedBranch, setSelectedBranch] = useState(null);

    const [formData, setFormData] = useState({
        fullName: '',
        phone: '',
        phone2: '',
        address: '',
        city: '',
        paymentMethod: 'COD'
    });

    // Load delivery branches and autofill customer data
    useEffect(() => {
        const fetchBranchesAndAutofill = async () => {
            // 1. Fetch cities
            const { data: branchData } = await supabase
                .from('website_delivery_branches')
                .select('*')
                .order('city', { ascending: true });
            
            let loadedBranches = branchData || [];
            setBranches(loadedBranches);

            // 2. Fetch last order to autofill if logged in
            let lastOrderDetails = null;
            if (customer) {
                const { data: lastOrder } = await supabase
                    .from('website_orders')
                    .select('*')
                    .eq('phone', customer.phone)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                
                if (lastOrder) {
                    lastOrderDetails = lastOrder;
                }
            }

            // 3. Set form data
            setFormData(f => ({
                ...f,
                fullName: customer?.name || f.fullName,
                phone: customer?.phone || f.phone,
                phone2: lastOrderDetails?.phone2 || f.phone2,
                address: lastOrderDetails?.address || f.address,
                city: lastOrderDetails?.city || loadedBranches[0]?.city || f.city
            }));

            // Handle branch selection
            const cityToSelect = lastOrderDetails?.city || loadedBranches[0]?.city;
            if (cityToSelect) {
                const branch = loadedBranches.find(b => b.city === cityToSelect);
                if (branch) setSelectedBranch(branch);
            }

            setLoadingBranches(false);
        };
        fetchBranchesAndAutofill();
    }, [customer]);

    // Update selected branch when city changes
    const handleCityChange = (cityName) => {
        const branch = branches.find(b => b.city === cityName) || null;
        setSelectedBranch(branch);
        setFormData(f => ({ ...f, city: cityName }));
    };

    // Fix hydration race — let cart load from localStorage first
    useEffect(() => {
        const timer = setTimeout(() => setCartReady(true), 100);
        return () => clearTimeout(timer);
    }, []);

    // Redirect if cart is empty (and NOT a Buy Now and order not placed)
    useEffect(() => {
        if (cartReady && !isBuyNow && cart.length === 0 && !isOrdered) {
            navigate('/shop');
        }
    }, [cartReady, isBuyNow, cart.length, isOrdered, navigate]);

    // Hold render until hydration is done
    if (!cartReady && !isOrdered) return null;

    const shippingFee = selectedBranch ? Number(selectedBranch.shipping_fee) : 0;
    const grandTotal = checkoutSubtotal + shippingFee;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.phone.length !== 10 || !/^\d+$/.test(formData.phone)) {
            alert('Primary phone must be exactly 10 digits.');
            return;
        }
        if (formData.phone2 && (formData.phone2.length !== 10 || !/^\d+$/.test(formData.phone2))) {
            alert('Secondary phone must be exactly 10 digits.');
            return;
        }

        setSaving(true);
        try {
            // Prepare Items for Atomic RPC
            const orderItems = checkoutItems.map(item => ({
                variant_id: item.variant_id,
                quantity: item.quantity,
                unit_price: item.price,
                product_id: item.id,
                product_title: item.title,
                sku: item.sku
            }));

            // SINGLE ATOMIC CALL
            const { data: result, error: rpcError } = await supabase.rpc('create_atomic_website_order', {
                p_customer_name: formData.fullName,
                p_phone: formData.phone,
                p_phone2: formData.phone2,
                p_address: formData.address,
                p_city: formData.city,
                p_payment_method: formData.paymentMethod,
                p_shipping_fee: shippingFee,
                p_total_amount: grandTotal,
                p_items: orderItems
            });

            setCheckoutError(null);
            if (rpcError) {
                console.error("Atomic Purchase Error:", rpcError.message);
                if (rpcError.message?.includes('STOCK')) {
                    const itemName = rpcError.message.split(': ')[1] || 'An item in your cart';
                    setCheckoutError(`Oops! We just ran out of stock for "${itemName}". Please remove it from your cart or adjust the quantity to continue.`);
                    return; // Stop here, don't clear cart
                }
                throw rpcError;
            }

            if (result && result.order_number) {
                setOrderNumber(result.order_number);
                setIsOrdered(true);
                if (!isBuyNow) clearSelectedItems();
            } else {
                throw new Error("Order creation succeeded but no order number was returned.");
            }
        } catch (err) {
            alert('Order failed: ' + (err.message || 'Please try again'));
        } finally {
            setSaving(false);
        }
    };

    const handleCreateAccount = async () => {
        if (pin.length < 4) return alert('Please enter a 4-digit PIN');
        setCreatingAccount(true);
        try {
            // Check if account already exists
            const { data: existing, error: checkError } = await supabase
                .from('website_customers')
                .select('*')
                .eq('phone', formData.phone)
                .maybeSingle();

            if (checkError) throw checkError;

            if (existing) {
                // Number exists - try to log in
                const success = await login(formData.phone, pin);
                if (success) {
                    setAccountCreated(true);
                    // No need to alert, they are logged in now
                } else {
                    alert('This number is already registered. Please enter the correct PIN to link this order to your account.');
                }
                return;
            }

            // No account found - create new one
            const { error: insertError } = await supabase.from('website_customers').insert({
                phone: formData.phone,
                name: formData.fullName,
                pin_hash: pin,
                address: formData.address,
                city: formData.city
            });
            
            if (insertError) throw insertError;
            
            await login(formData.phone, pin); // Log in the new user
            setAccountCreated(true);
        } catch (err) {
            alert('Could not link account: ' + err.message);
        } finally {
            setCreatingAccount(false);
        }
    };

    return (
        <div className="section">
            <div className="container">
                {isOrdered ? (
                    /* ─── SUCCESS SCREEN ─── */
                    <div style={{ maxWidth: '520px', margin: '2rem auto', textAlign: 'center' }}>
                        <div style={{ background: 'white', padding: '2.5rem', borderRadius: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                            <div style={{ fontSize: '64px', marginBottom: '1.25rem' }}>✅</div>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: '900', marginBottom: '0.5rem' }}>Order Confirmed!</h1>
                            <p style={{ color: '#64748b', lineHeight: '1.7', marginBottom: '0.5rem' }}>
                                Thank you, <strong>{(formData.fullName || 'Customer').split(' ')[0]}</strong>!
                            </p>
                            <p style={{ color: '#64748b', lineHeight: '1.7', marginBottom: '2rem' }}>
                                Order <strong style={{ color: '#1e293b' }}>{orderNumber}</strong> · Delivery to <strong style={{ color: '#1e293b' }}>{formData.city}</strong>.<br />
                                We'll call <strong style={{ color: '#1e293b' }}>{formData.phone}</strong> to confirm.
                            </p>

                            {!accountCreated && !customer ? (
                                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                                    <h3 style={{ fontWeight: '800', fontSize: '1rem', marginBottom: '0.5rem' }}>🔒 Track Your Order</h3>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.25rem', lineHeight: '1.5' }}>
                                        Set a 4-digit PIN to save your profile. 
                                        <strong style={{ color: '#ef4444', display: 'block', marginTop: '0.5rem' }}>
                                            Already have an account? Enter your PIN to link this order instantly.
                                        </strong>
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                                        <input
                                            type="password"
                                            maxLength={4}
                                            placeholder="PIN"
                                            value={pin}
                                            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                                            className="form-control"
                                            style={{ width: '100px', textAlign: 'center', letterSpacing: '4px', fontSize: '1.2rem', fontWeight: '800' }}
                                        />
                                        <button
                                            onClick={handleCreateAccount}
                                            disabled={creatingAccount || pin.length < 4}
                                            className="btn btn-primary"
                                            style={{ flex: 1 }}
                                        >
                                            {creatingAccount ? 'Saving…' : 'Save PIN'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ background: '#ecfdf5', padding: '1.25rem', borderRadius: '1.25rem', color: '#065f46', display: 'flex', gap: '1rem', alignItems: 'center', textAlign: 'left' }}>
                                    <span style={{ fontSize: '1.5rem' }}>✨</span>
                                    <div>
                                        <strong style={{ display: 'block' }}>Order Saved to History!</strong>
                                        <span style={{ fontSize: '0.85rem' }}>You're logged in as {customer?.name || 'Customer'}.</span>
                                    </div>
                                </div>
                            )}

                            <div className="success-actions">
                                <button
                                    onClick={() => navigate('/my-orders')}
                                    disabled={!accountCreated && !customer}
                                    className="btn btn-primary"
                                    title={(!accountCreated && !customer) ? "Please save your PIN first" : ""}
                                    style={{ 
                                        flex: 1, 
                                        padding: '1rem', 
                                        fontWeight: '800',
                                        opacity: (!accountCreated && !customer) ? 0.5 : 1,
                                        cursor: (!accountCreated && !customer) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    Track Your Orders
                                </button>
                                <button
                                    onClick={() => navigate('/')}
                                    className="btn"
                                    style={{ flex: 1, padding: '1rem', background: '#f1f5f9', color: '#475569', fontWeight: '800' }}
                                >
                                    Continue Shopping
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ─── CHECKOUT FORM ─── */
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                            <button
                                onClick={() => navigate(-1)}
                                style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <h2 className="section-title" style={{ margin: 0 }}>Checkout</h2>
                        </div>

                        {checkoutError && (
                            <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '1rem', padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start', boxShadow: '0 4px 15px rgba(239,68,68,0.1)' }}>
                                <div style={{ background: 'white', padding: '0.5rem', borderRadius: '0.75rem', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                                    <AlertTriangle size={24} color="#ef4444" strokeWidth={2.5} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h4 style={{ color: '#991b1b', fontWeight: '900', margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>Item Sold Out</h4>
                                    <p style={{ color: '#b91c1c', margin: 0, fontSize: '0.9rem', lineHeight: '1.5', fontWeight: '500' }}>{checkoutError}</p>
                                </div>
                            </div>
                        )}
                        <form onSubmit={handleSubmit} className="checkout-layout">
                            {/* ── Left: Form Fields ── */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '100px' }}>

                                {/* Shipping Info */}
                                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #e2e8f0' }}>
                                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.05rem', fontWeight: '800' }}>
                                        <Truck size={20} color="#ef4444" /> Delivery Information
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                                <label style={{ fontSize: '0.875rem', fontWeight: '700' }}>Full Name</label>
                                                {customer && <span style={{ fontSize: '0.7rem', color: '#059669', background: '#ecfdf5', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontWeight: '700' }}>Logged In</span>}
                                            </div>
                                            <input required className="form-control" placeholder="Your full name" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} />
                                        </div>

                                        <div className="form-row">
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.4rem' }}>Phone (10 digits)</label>
                                                <input required type="tel" maxLength={10} className="form-control" placeholder="98XXXXXXXX" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.4rem' }}>Alt. Phone <span style={{ color: '#94a3b8', fontWeight: '500' }}>(optional)</span></label>
                                                <input type="tel" maxLength={10} className="form-control" placeholder="98XXXXXXXX" value={formData.phone2} onChange={(e) => setFormData({ ...formData, phone2: e.target.value.replace(/\D/g, '') })} />
                                            </div>
                                        </div>

                                        {/* City Dropdown — loaded from DB */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.4rem' }}>
                                                <MapPin size={14} style={{ display: 'inline', marginRight: '0.4rem' }} />
                                                Destination City
                                            </label>
                                            {loadingBranches ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Loading cities…
                                                </div>
                                            ) : (
                                                <select
                                                    required
                                                    className="form-control"
                                                    value={formData.city}
                                                    onChange={(e) => handleCityChange(e.target.value)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    {branches.map(b => (
                                                        <option key={b.id} value={b.city}>{b.city}</option>
                                                    ))}
                                                </select>
                                            )}

                                            {/* Coverage area info badge */}
                                            {selectedBranch && selectedBranch.coverage_area && (
                                                <div style={{ marginTop: '0.625rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', background: '#f0f9ff', borderRadius: '0.75rem', border: '1px solid #bae6fd' }}>
                                                    <Info size={14} color="#0284c7" style={{ flexShrink: 0 }} />
                                                    <span style={{ fontSize: '0.8rem', color: '#0369a1', fontWeight: '600' }}>
                                                        Coverage: {selectedBranch.coverage_area}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.4rem' }}>Delivery Address</label>
                                            <textarea
                                                required
                                                className="form-control"
                                                style={{ minHeight: '80px', resize: 'vertical' }}
                                                placeholder="House no, Street, Landmark…"
                                                value={formData.address}
                                                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Payment */}
                                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #e2e8f0' }}>
                                    <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.05rem', fontWeight: '800' }}>
                                        <CreditCard size={20} color="#ef4444" /> Payment Method
                                    </h3>
                                    <div style={{ padding: '1rem 1.25rem', border: '2px solid #ef4444', borderRadius: '1rem', background: '#fff1f2', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <input type="radio" checked readOnly style={{ width: '18px', height: '18px', accentColor: '#ef4444' }} />
                                        <div>
                                            <p style={{ fontWeight: '800', fontSize: '1rem', marginBottom: '0.2rem' }}>Cash on Delivery (COD)</p>
                                            <p style={{ fontSize: '0.8rem', color: '#b91c1c' }}>Pay when your parcel arrives at your door</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Right: Order Summary ── */}
                            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '1.25rem', border: '2px solid #e2e8f0', height: 'fit-content', position: 'sticky', top: '100px' }}>
                                <h3 style={{ marginBottom: '1.25rem', fontWeight: '800', fontSize: '1.1rem' }}>Order Summary</h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                    {checkoutItems.map(item => (
                                        <div key={item.cartKey || item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', gap: '0.5rem' }}>
                                            <span style={{ flex: 1, color: '#334155' }}>{item.title} <span style={{ color: '#94a3b8' }}>×{item.quantity}</span></span>
                                            <span style={{ fontWeight: '700', flexShrink: 0 }}>Rs. {(item.price * item.quantity).toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#64748b' }}>
                                        <span>Subtotal</span>
                                        <span>Rs. {checkoutSubtotal.toLocaleString()}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: shippingFee === 0 ? '#10b981' : '#64748b' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <Truck size={13} /> Shipping to {formData.city || '—'}
                                        </span>
                                        <span style={{ fontWeight: '700' }}>
                                            {shippingFee === 0 ? '🎉 Free' : `Rs. ${shippingFee.toLocaleString()}`}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '1.2rem', borderTop: '2px solid #e2e8f0', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                                        <span>Total</span>
                                        <span style={{ color: '#ef4444' }}>Rs. {grandTotal.toLocaleString()}</span>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={saving || grandTotal === 0}
                                    className="btn btn-primary"
                                    style={{ width: '100%', padding: '1rem', fontSize: '1.05rem', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                >
                                    {saving ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</> : 'Confirm Order'}
                                </button>

                                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.75rem' }}>
                                    🔒 {isBuyNow ? 'Secure Checkout' : (customer ? 'Return Customer' : 'Secure Guest Checkout')}
                                </p>
                            </div>
                        </form>

                        {/* Sticky Bottom Bar for Mobile */}
                        <div className="mobile-only" style={{
                            position: 'fixed', bottom: 0, left: 0, right: 0,
                            padding: '1rem 1.25rem', backgroundColor: 'white',
                            borderTop: '1px solid var(--border-color)',
                            boxShadow: '0 -4px 10px rgba(0,0,0,0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: '1rem', zIndex: 1000,
                            paddingBottom: 'calc(1rem + var(--safe-bottom))'
                        }}>
                            <div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-gray)', margin: 0, fontWeight: '600' }}>Final Amount</p>
                                <p style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--primary-red)', margin: 0 }}>Rs. {grandTotal.toLocaleString()}</p>
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={saving || grandTotal === 0}
                                className="btn btn-primary"
                                style={{ flex: 1, padding: '0.875rem', borderRadius: '12px', fontWeight: '800', fontSize: '1rem' }}
                            >
                                {saving ? 'Processing…' : 'Confirm Order'}
                            </button>
                        </div>
                    </>
                )}
            </div>

            <style>{`
                .checkout-layout {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1.5rem;
                }
                .form-row {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1rem;
                }
                @media (min-width: 768px) {
                    .form-row {
                        grid-template-columns: 1fr 1fr;
                    }
                }
                @media (min-width: 992px) {
                    .checkout-layout {
                        grid-template-columns: 1fr 380px;
                        gap: 2.5rem;
                    }
                }
                .success-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    margin-top: 2rem;
                }
                @media (min-width: 640px) {
                    .success-actions {
                        flex-direction: row;
                    }
                }
            `}</style>
        </div>
    );
};

export default Checkout;
