import { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { Truck, CreditCard, ChevronLeft, Loader2, MapPin, Info, AlertTriangle, ArrowLeft, CheckCircle, ShoppingBag, ArrowRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCustomer } from '../context/CustomerContext';
import { useNotification } from '../context/NotificationContext';
import { useSettings } from '../context/SettingsContext';

// eSewa HMAC-SHA256 signature generation using Web Crypto API
const generateEsewaSignature = async (totalAmount, transactionUuid, productCode, secretKey) => {
    const inputString = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
    console.log('[eSewa] Signing string:', inputString);
    const encoder = new TextEncoder();
    const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(secretKey),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signatureBuffer = await window.crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(inputString));
    const base64Sig = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));
    console.log('[eSewa] Generated signature:', base64Sig);
    return base64Sig;
};

const Checkout = () => {
    const { cart, cartTotal, clearCart, clearSelectedItems } = useCart();
    const { customer, login, refreshCustomer } = useCustomer();
    const { showNotification } = useNotification();
    const { settings = {} } = useSettings();
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
    const [txnRef, setTxnRef] = useState('');

    // Delivery branches from DB
    const [branches, setBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(true);
    const [selectedBranch, setSelectedBranch] = useState(null);
    const [useCoins, setUseCoins] = useState(false);

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

            // 3. Set form data (prioritize saved customer profile address & city)
            const savedCity = customer?.city || lastOrderDetails?.city || loadedBranches[0]?.city || '';
            const savedAddress = customer?.address || lastOrderDetails?.address || '';

            setFormData(f => ({
                ...f,
                fullName: customer?.name || f.fullName,
                phone: customer?.phone || f.phone,
                phone2: lastOrderDetails?.phone2 || f.phone2,
                address: savedAddress || f.address,
                city: savedCity || f.city
            }));

            // Handle branch selection
            if (savedCity) {
                const branch = loadedBranches.find(b => b.city === savedCity);
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

    // Fix hydration race & Sync live coin balance on mount
    useEffect(() => {
        const timer = setTimeout(() => setCartReady(true), 100);
        refreshCustomer();
        return () => clearTimeout(timer);
    }, []);

    // Redirect if cart is empty (and NOT a Buy Now and order not placed)
    useEffect(() => {
        if (cartReady && !isBuyNow && cart.length === 0 && !isOrdered) {
            navigate('/shop');
        }
    }, [cartReady, isBuyNow, cart.length, isOrdered, navigate]);

    const shippingFee = selectedBranch ? Number(selectedBranch.shipping_fee) : 0;
    
    // Loyalty Points (Coins) Evaluation
    const userCoins = customer?.shopy_coins ? Number(customer.shopy_coins) : 0;
    // Cap at 20% of order total OR 150 coins (whichever is lower)
    const maxCoinDiscount = Math.floor((checkoutSubtotal + shippingFee) * 0.20);
    const hardCap = 150;
    const coinsUsable = Math.min(userCoins, maxCoinDiscount, hardCap);
    const appliedCoinDiscount = (useCoins && coinsUsable > 0) ? coinsUsable : 0;

    const grandTotal = checkoutSubtotal + shippingFee - appliedCoinDiscount;

    // Meta Pixel: Track Purchase Success
    useEffect(() => {
        if (isOrdered && window.fbq) {
            try {
                window.fbq('track', 'Purchase', {
                    value: grandTotal,
                    currency: 'USD',
                    content_ids: checkoutItems.map(item => String(item.variant_id || item.id || '')).filter(Boolean),
                    content_type: 'product',
                    num_items: checkoutItems.reduce((sum, item) => sum + (item.quantity || 1), 0)
                });
            } catch (e) {
                console.warn('[Meta Pixel] Purchase tracking failed:', e);
            }
        }
    }, [isOrdered]);

    // Hold render until hydration is done
    if (!cartReady && !isOrdered) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (formData.phone.length !== 10 || !/^\d+$/.test(formData.phone)) {
            showNotification('Primary phone must be exactly 10 digits.', 'error');
            return;
        }
        if (formData.phone2 && (formData.phone2.length !== 10 || !/^\d+$/.test(formData.phone2))) {
            showNotification('Secondary phone must be exactly 10 digits.', 'error');
            return;
        }
        if (formData.paymentMethod === 'Bank Transfer' && !txnRef.trim()) {
            showNotification('Please enter your transaction reference number for Bank Transfer.', 'error');
            return;
        }

        setSaving(true);
        try {
            // 1. Live stock audit
            const { data: latestStock, error: stockError } = await supabase
                .from('website_variant_stock_view')
                .select('variant_id, current_stock, sku, is_bundle')
                .in('variant_id', checkoutItems.map(i => i.variant_id));

            if (stockError) throw stockError;

            for (const item of checkoutItems) {
                const liveItem = latestStock.find(s => s.variant_id === item.variant_id);
                const currentAvailable = liveItem ? liveItem.current_stock : 0;
                
                if (currentAvailable < item.quantity) {
                    setSaving(false);
                    setCheckoutError(`Wait! The stock for "${item.title}" just changed. Only ${currentAvailable} left. Please adjust your order.`);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    return;
                }
            }

            // 2. Prepare items
            const orderItems = checkoutItems.map(item => ({
                variant_id: item.variant_id,
                quantity: item.quantity,
                unit_price: item.price,
                product_id: item.id,
                product_title: item.title,
                sku: item.sku
            }));

            // ── eSewa Payment Flow (Deferred Order Creation) ───────────────────────────
            if (formData.paymentMethod === 'eSewa') {
                const tempOrderNumber = `SN-${Date.now().toString().slice(-6)}`;
                const transactionUuid = `${tempOrderNumber}-${Date.now()}`;

                const secretKey = settings.esewa_secret_key || '8gBm/:&EnhH.1/q';
                const productCode = settings.esewa_merchant_code || 'EPAYTEST';
                const configuredEnv = settings.esewa_environment || 'test';
                const gatewayUrl = configuredEnv === 'live' 
                    ? 'https://epay.esewa.com.np/api/epay/main/v2/form'
                    : 'https://rc-epay.esewa.com.np/api/epay/main/v2/form';

                const fmt = (n) => Number(n).toFixed(2);
                const totalAmountStr = fmt(grandTotal);
                const amountStr = fmt(grandTotal - shippingFee);
                const deliveryChargeStr = fmt(shippingFee);

                const signature = await generateEsewaSignature(
                    totalAmountStr,
                    transactionUuid,
                    productCode,
                    secretKey
                );

                // Save pending order details in sessionStorage so PaymentSuccess can create the order AFTER payment succeeds
                const pendingOrderData = {
                    customer_name: formData.fullName,
                    phone: formData.phone,
                    phone2: formData.phone2,
                    address: formData.address,
                    city: formData.city,
                    payment_method: 'eSewa',
                    shipping_fee: shippingFee,
                    total_amount: grandTotal,
                    items: orderItems,
                    coins_used: appliedCoinDiscount,
                    ad_id: checkoutItems[0]?.ad_id || null,
                    order_number: tempOrderNumber,
                    transaction_uuid: transactionUuid,
                    is_buy_now: isBuyNow
                };
                sessionStorage.setItem('pending_esewa_order', JSON.stringify(pendingOrderData));

                console.log(`[eSewa] Submitting form to ${configuredEnv} gateway (${gatewayUrl}) with fields:`, {
                    amount: amountStr,
                    total_amount: totalAmountStr,
                    transaction_uuid: transactionUuid,
                    product_code: productCode,
                    product_delivery_charge: deliveryChargeStr,
                    signature
                });

                const form = document.createElement('form');
                form.method = 'POST';
                form.action = gatewayUrl;

                const fields = {
                    amount: amountStr,
                    tax_amount: '0',
                    total_amount: totalAmountStr,
                    transaction_uuid: transactionUuid,
                    product_code: productCode,
                    product_service_charge: '0',
                    product_delivery_charge: deliveryChargeStr,
                    success_url: `${window.location.origin}/payment-success`,
                    failure_url: `${window.location.origin}/payment-failure`,
                    signed_field_names: 'total_amount,transaction_uuid,product_code',
                    signature: signature
                };

                Object.entries(fields).forEach(([key, val]) => {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = val;
                    form.appendChild(input);
                });

                document.body.appendChild(form);
                form.submit();
                return;
            }

            // 3. For Non-eSewa Payments (COD, Bank Transfer): Create order immediately in DB
            const { data: result, error: rpcError } = await supabase.rpc('create_atomic_website_order', {
                p_customer_name: formData.fullName,
                p_phone: formData.phone,
                p_phone2: formData.phone2,
                p_address: formData.address,
                p_city: formData.city,
                p_payment_method: formData.paymentMethod,
                p_shipping_fee: shippingFee,
                p_total_amount: grandTotal,
                p_items: orderItems,
                p_coins_used: appliedCoinDiscount,
                p_ad_id: checkoutItems[0]?.ad_id || null
            });

            setCheckoutError(null);
            if (rpcError) {
                console.error("Atomic Purchase Error:", rpcError.message);
                if (rpcError.message?.includes('COINS')) {
                    refreshCustomer();
                    setCheckoutError("Your coin balance has changed. We've updated your available points.");
                    return;
                }
                if (rpcError.message?.includes('STOCK')) {
                    const itemName = rpcError.message.split(': ')[1] || 'An item in your cart';
                    setCheckoutError(`Oops! We just ran out of stock for "${itemName}". Please remove it from your cart or adjust the quantity to continue.`);
                    return;
                }
                throw rpcError;
            }

            if (result && result.order_number) {
                // Bank Transfer: save transaction reference into order notes
                if (formData.paymentMethod === 'Bank Transfer') {
                    const { error: confirmError } = await supabase.rpc('confirm_website_payment', {
                        p_order_number: result.order_number,
                        p_payment_details: `Mobile Banking / Bank Transfer. Reference ID: ${txnRef}`,
                        p_status: 'unpaid'
                    });
                    if (confirmError) {
                        console.error("Bank Transfer confirmation failed:", confirmError.message);
                    }
                }

                // COD & Bank Transfer: show local success screen
                setOrderNumber(result.order_number);
                setIsOrdered(true);
                showNotification('Order placed successfully!', 'success');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                if (!isBuyNow) clearSelectedItems();
                refreshCustomer();
            } else {
                throw new Error("Order creation succeeded but no order number was returned.");
            }
        } catch (err) {
            showNotification('Order failed: ' + (err.message || 'Please try again'), 'error');
        } finally {
            setSaving(false);
        }
    };


    const handleCreateAccount = async () => {
        if (pin.length < 4) return showNotification('Please enter a 4-digit PIN', 'warning');
        setCreatingAccount(true);
        try {
            const { error: insertError } = await supabase.from('website_customers').insert({
                phone: formData.phone,
                name: formData.fullName,
                pin_hash: pin,
                address: formData.address,
                city: formData.city
            });

            if (insertError) {
                // - PostgreSQL duplicate key: code 23505
                // - Supabase REST HTTP 409 Conflict: status 409
                const isConflict =
                    insertError.code === '23505' ||
                    insertError.status === 409 ||
                    String(insertError.message || '').toLowerCase().match(/duplicate|already exist|conflict|unique/);

                if (isConflict) {
                    const success = await login(formData.phone, pin);
                    if (success) {
                        setAccountCreated(true);
                        showNotification('Welcome back! Order linked to your account.', 'success');
                    } else {
                        showNotification(
                            'This number is already registered. Please enter your correct PIN to link this order.',
                            'error'
                        );
                    }
                    return;
                }
                throw insertError;
            }

            await login(formData.phone, pin);
            setAccountCreated(true);
            showNotification('Account created! Your order is saved.', 'success');
        } catch (err) {
            showNotification('Could not link account: ' + (err.message || 'Please try again'), 'error');
        } finally {
            setCreatingAccount(false);
        }
    };

    return (
        <div className="section">
            <div className="container">
                {isOrdered ? (
                    /* ─── SUCCESS SCREEN ─── */
                    <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '2.5rem', background: 'white', borderRadius: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 20px 40px rgba(0,0,0,0.04)' }}>
                        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                            <div style={{ width: '70px', height: '70px', background: '#ecfdf5', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                <CheckCircle size={44} />
                            </div>
                            <h1 style={{ fontWeight: '900', color: '#111827', fontSize: '1.8rem', margin: '0 0 0.5rem 0' }}>Order Confirmed!</h1>
                            <p style={{ color: '#10b981', fontWeight: '700', fontSize: '0.95rem' }}>
                                Thank you, {(formData.fullName || 'Customer').split(' ')[0]}! Your order has been placed.
                            </p>
                        </div>

                        {formData.paymentMethod === 'Bank Transfer' && (
                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '1rem', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
                                <p style={{ fontWeight: '800', color: '#1d4ed8', marginBottom: '0.25rem', fontSize: '0.9rem' }}>🏦 Bank Transfer Pending Verification</p>
                                <p style={{ fontSize: '0.8rem', color: '#1e40af' }}>Your order is placed. We will verify your transfer (Ref: <strong>{txnRef}</strong>) and confirm within 24 hours.</p>
                            </div>
                        )}

                        <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #f1f5f9', marginBottom: '2rem', textAlign: 'left' }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontWeight: '800', fontSize: '1rem', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Order Details</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.875rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748b' }}>Order Number</span>
                                    <strong style={{ color: '#0f172a' }}>{orderNumber}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748b' }}>Payment Method</span>
                                    <strong style={{ color: '#0f172a' }}>{formData.paymentMethod || 'Cash on Delivery'}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748b' }}>Total Amount</span>
                                    <strong style={{ color: '#059669', fontSize: '1rem' }}>Rs. {grandTotal.toLocaleString()}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
                                    <span style={{ color: '#64748b' }}>Customer Name</span>
                                    <span style={{ color: '#0f172a', fontWeight: '600' }}>{formData.fullName}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748b' }}>Contact Phone</span>
                                    <span style={{ color: '#0f172a', fontWeight: '600' }}>{formData.phone}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#64748b' }}>Delivery Address</span>
                                    <span style={{ color: '#0f172a', fontWeight: '600', textAlign: 'right' }}>{formData.address}, {formData.city}</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button
                                onClick={() => {
                                    if (customer) {
                                        navigate('/my-orders');
                                    } else {
                                        const phone = formData.phone || '';
                                        navigate(`/my-orders?setup-pin=${encodeURIComponent(phone)}`);
                                    }
                                }}
                                className="btn btn-primary"
                                style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '700' }}
                            >
                                <ShoppingBag size={18} /> View My Orders <ArrowRight size={16} />
                            </button>

                            <button
                                onClick={() => navigate('/shop')}
                                className="btn btn-secondary"
                                style={{ width: '100%', padding: '1rem', fontWeight: '700' }}
                            >
                                Continue Shopping
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ─── CHECKOUT FORM ─── */
                    <>
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

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

                                        {/* Shipping Coverage Notice */}
                                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '1rem', padding: '1rem', marginTop: '0.5rem' }}>
                                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                                <AlertTriangle size={20} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    <li style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: '800', lineHeight: '1.4' }}>
                                                        • Please check the destination city and coverage area before ordering the product.
                                                    </li>
                                                    <li style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: '800', lineHeight: '1.4' }}>
                                                        • If your destination is not in the list, we are currently unavailable. Please check this before making the purchase.
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>

                                        {/* City Dropdown */}
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.4rem' }}>
                                                <MapPin size={14} style={{ display: 'inline', marginRight: '0.4rem' }} />
                                                Destination
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

                                            {selectedBranch && (
                                                <div style={{ marginTop: '0.625rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {selectedBranch.coverage_area && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', background: '#f0f9ff', borderRadius: '0.75rem', border: '1px solid #bae6fd' }}>
                                                            <Info size={14} color="#0284c7" style={{ flexShrink: 0 }} />
                                                            <span style={{ fontSize: '0.8rem', color: '#0369a1', fontWeight: '600' }}>
                                                                Coverage: {selectedBranch.coverage_area}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {selectedBranch.delivery_time && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', background: '#f8fafc', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                                                            <Truck size={14} color="#3b82f6" style={{ flexShrink: 0 }} />
                                                            <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600' }}>
                                                                Est. Delivery: {selectedBranch.delivery_time}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '700', marginBottom: '0.4rem' }}>Your Address</label>
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

                                {/* Payment Method */}
                                <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #e2e8f0' }}>
                                    <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.05rem', fontWeight: '800' }}>
                                        <CreditCard size={20} color="#ef4444" /> Payment Method
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                                        {/* COD */}
                                        <label style={{
                                            padding: '1rem 1.25rem',
                                            border: formData.paymentMethod === 'COD' ? '2px solid #ef4444' : '1px solid #e2e8f0',
                                            borderRadius: '1rem',
                                            background: formData.paymentMethod === 'COD' ? '#fff1f2' : 'white',
                                            display: 'flex', alignItems: 'center', gap: '1rem',
                                            cursor: 'pointer', transition: 'all 0.2s ease'
                                        }}>
                                            <input type="radio" name="paymentMethod" value="COD"
                                                checked={formData.paymentMethod === 'COD'}
                                                onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                                style={{ width: '18px', height: '18px', accentColor: '#ef4444', cursor: 'pointer' }} />
                                            <div>
                                                <p style={{ fontWeight: '800', fontSize: '1rem', margin: 0, color: '#1e293b' }}>Cash on Delivery (COD)</p>
                                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>Pay with cash when your parcel is delivered</p>
                                            </div>
                                        </label>

                                        {/* eSewa */}
                                        <label style={{
                                            padding: '1rem 1.25rem',
                                            border: formData.paymentMethod === 'eSewa' ? '2px solid #60b524' : '1px solid #e2e8f0',
                                            borderRadius: '1rem',
                                            background: formData.paymentMethod === 'eSewa' ? '#f4fbf0' : 'white',
                                            display: 'flex', flexDirection: 'column', gap: '0.75rem',
                                            cursor: 'pointer', transition: 'all 0.2s ease'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <input type="radio" name="paymentMethod" value="eSewa"
                                                    checked={formData.paymentMethod === 'eSewa'}
                                                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                                    style={{ width: '18px', height: '18px', accentColor: '#60b524', cursor: 'pointer' }} />
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', justifyContent: 'space-between' }}>
                                                    <div>
                                                        <p style={{ fontWeight: '800', fontSize: '1rem', margin: 0, color: '#1e293b' }}>eSewa (Online Payment)</p>
                                                        <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>Pay instantly via secure eSewa gateway</p>
                                                    </div>
                                                    <img src="https://cdn.esewa.com.np/ui/images/esewa_logo.png" alt="eSewa"
                                                        style={{ height: '22px', objectFit: 'contain', flexShrink: 0 }}
                                                        onError={(e) => { e.target.style.display = 'none'; }} />
                                                </div>
                                            </div>
                                        </label>

                                        {/* Bank Transfer */}
                                        <label style={{
                                            padding: '1rem 1.25rem',
                                            border: formData.paymentMethod === 'Bank Transfer' ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                            borderRadius: '1rem',
                                            background: formData.paymentMethod === 'Bank Transfer' ? '#eff6ff' : 'white',
                                            display: 'flex', flexDirection: 'column', gap: '0.75rem',
                                            cursor: 'pointer', transition: 'all 0.2s ease'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <input type="radio" name="paymentMethod" value="Bank Transfer"
                                                    checked={formData.paymentMethod === 'Bank Transfer'}
                                                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                                                    style={{ width: '18px', height: '18px', accentColor: '#2563eb', cursor: 'pointer' }} />
                                                <div>
                                                    <p style={{ fontWeight: '800', fontSize: '1rem', margin: 0, color: '#1e293b' }}>Mobile Banking / Bank Transfer</p>
                                                    <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0 0' }}>Transfer to our bank account and provide reference ID</p>
                                                </div>
                                            </div>

                                            {formData.paymentMethod === 'Bank Transfer' && (
                                                <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', border: '1px solid #bfdbfe', borderRadius: '0.75rem', padding: '1rem', cursor: 'default' }}>
                                                    <p style={{ fontWeight: '800', fontSize: '0.85rem', color: '#1e3a8a', marginBottom: '0.75rem' }}>Our Bank Details:</p>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.82rem', color: '#334155', marginBottom: '1rem' }}>
                                                        <div><strong>Bank Name:</strong> Global IME Bank</div>
                                                        <div><strong>Account Holder:</strong> Shopy Nepal Pvt. Ltd.</div>
                                                        <div><strong>Account Number:</strong> 0123456789012345</div>
                                                        <div><strong>Branch:</strong> Kathmandu</div>
                                                    </div>
                                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.4rem' }}>
                                                        Transaction Reference / Voucher Number *
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. TXN-9238471"
                                                        value={txnRef}
                                                        onChange={(e) => setTxnRef(e.target.value)}
                                                        className="form-control"
                                                        style={{ fontSize: '0.85rem' }}
                                                    />
                                                    <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.35rem' }}>
                                                        Transfer <strong>Rs. {grandTotal.toLocaleString()}</strong> to the above account, then enter the reference number.
                                                    </p>
                                                </div>
                                            )}
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* ── Right: Order Summary ── */}
                            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '1.25rem', border: '2px solid #e2e8f0', height: 'fit-content', position: 'sticky', top: '100px' }}>
                                <h3 style={{ marginBottom: '1.25rem', fontWeight: '800', fontSize: '1.1rem' }}>Order Summary</h3>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                    {checkoutItems.map(item => (
                                        <div key={item.cartKey || item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', gap: '0.5rem' }}>
                                            <span style={{ flex: 1, color: '#334155' }}>
                                                {item.title.length > 40 ? item.title.substring(0, 40) + '...' : item.title} 
                                                <span style={{ color: '#94a3b8' }}> ×{item.quantity}</span>
                                            </span>
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
                                    {appliedCoinDiscount > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#10b981', fontWeight: '800' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>🪙 Shopy Coins</span>
                                            <span>- Rs. {appliedCoinDiscount.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '900', fontSize: '1.2rem', borderTop: '2px solid #e2e8f0', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
                                        <span>Total</span>
                                        <span style={{ color: 'var(--primary-red)' }}>Rs. {grandTotal.toLocaleString()}</span>
                                    </div>
                                </div>

                                {customer && userCoins > 0 && (
                                    <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', borderRadius: '1rem', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.1)' }}>
                                        <div>
                                            <h4 style={{ margin: 0, color: '#d97706', fontWeight: '800', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '4px' }}>🪙 Use Shopy Coins</h4>
                                            <p style={{ margin: 0, color: '#b45309', fontSize: '0.75rem', fontWeight: '600' }}>Balance: {userCoins} · Max usage: {coinsUsable}</p>
                                        </div>
                                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.4rem', background: 'white', padding: '0.4rem 0.8rem', borderRadius: '100px', border: '1px solid #fde68a' }}>
                                            <input type="checkbox" checked={useCoins} onChange={(e) => setUseCoins(e.target.checked)} style={{ width: '1.1rem', height: '1.1rem', accentColor: '#d97706', cursor: 'pointer' }} />
                                            <span style={{ fontWeight: '800', color: '#d97706', fontSize: '0.85rem' }}>Apply</span>
                                        </label>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={saving || grandTotal === 0}
                                    className="btn btn-primary"
                                    style={{ width: '100%', padding: '1rem', fontSize: '1.05rem', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                >
                                    {saving ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</> : (
                                        formData.paymentMethod === 'eSewa' ? '🔒 Pay with eSewa →' : 'Confirm Order'
                                    )}
                                </button>

                                <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.75rem' }}>
                                    🔒 {isBuyNow ? 'Secure Checkout' : (customer ? 'Return Customer' : 'Secure Guest Checkout')}
                                </p>
                            </div>
                        </form>
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
