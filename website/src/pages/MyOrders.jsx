import { useState, useEffect } from 'react';
import { useLocation, useNavigate, NavLink, Link } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext';
import { useSettings } from '../context/SettingsContext';
import { supabase } from '../lib/supabase';
import { 
    Package, Phone, Lock, ChevronRight, 
    Truck, CheckCircle, Clock, AlertCircle, ShoppingBag, Coins,
    Calendar, MapPin, Info, XCircle, X,
    Star, RotateCcw, Camera, Trash2, CheckCircle2, Loader2,
    ArrowLeft, Share2
} from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

const MyOrders = () => {
    const { customer, login, logout, register, loading: authLoading, refreshCustomer, setupPin } = useCustomer();
    const { settings } = useSettings();
    const { showNotification } = useNotification();
    const location = useLocation();
    const navigate = useNavigate();
    
    const queryTab = new URLSearchParams(location.search).get('tab');
    const querySetupPin = new URLSearchParams(location.search).get('setup-pin');
    const [activeTab, setActiveTab] = useState(queryTab || 'orders');
    const [activeStatus, setActiveStatus] = useState('Processing');
    const [isRegistering, setIsRegistering] = useState(false);
    const [orders, setOrders] = useState([]);
    const [loadingOrders, setLoadingOrders] = useState(false);
    const [branches, setBranches] = useState([]);
    const [ratedOrderIds, setRatedOrderIds] = useState(new Set());
    const [requestedReturnStatuses, setRequestedReturnStatuses] = useState({});
    const [selectedOrder, setSelectedOrder] = useState(null);
    
    // Auth form state
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [regName, setRegName] = useState('');
    const [regPhone, setRegPhone] = useState('');
    const [regPin, setRegPin] = useState('');
    const [error, setError] = useState('');

    // Modals
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancellingOrderId, setCancellingOrderId] = useState(null);
    const [cancelReason, setCancelReason] = useState('');
    const [isCancelling, setIsCancelling] = useState(false);

    const [showRateModal, setShowRateModal] = useState(false);
    const [rateData, setRateData] = useState({ orderId: null, productId: null, productTitle: '' });
    const [rateValue, setRateValue] = useState(5);
    const [rateComment, setRateComment] = useState('');
    const [isRating, setIsRating] = useState(false);

    const [showReturnModal, setShowReturnModal] = useState(false);
    const [selectedReturnOrder, setSelectedReturnOrder] = useState(null);
    const [returnType, setReturnType] = useState('return');
    const [returnMessage, setReturnMessage] = useState('');
    const [returnFiles, setReturnFiles] = useState([]);
    const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
    const [returnSuccess, setReturnSuccess] = useState(false);

    // Change PIN & Settings State
    const [showChangePinModal, setShowChangePinModal] = useState(false);
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [pinLoading, setPinLoading] = useState(false);
    const [pinMsg, setPinMsg] = useState({ text: '', type: '' });

    // Reset PIN State
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetPhone, setResetPhone] = useState('');
    const [resetOrderNo, setResetOrderNo] = useState('');
    const [resetTotal, setResetTotal] = useState('');
    const [resetNewPin, setResetNewPin] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetError, setResetError] = useState('');

    // First-time buyer PIN setup (triggered by ?setup-pin=PHONE URL param)
    const [showSetupPinModal, setShowSetupPinModal] = useState(false);
    const [setupPinPhone, setSetupPinPhone] = useState('');
    const [setupPinName, setSetupPinName] = useState('');
    const [setupPinValue, setSetupPinValue] = useState('');
    const [setupPinConfirm, setSetupPinConfirm] = useState('');
    const [setupPinLoading, setSetupPinLoading] = useState(false);
    const [setupPinError, setSetupPinError] = useState('');

    // Fetch delivery branches for delivery time estimates
    useEffect(() => {
        const fetchBranches = async () => {
            const { data } = await supabase
                .from('website_delivery_branches')
                .select('*')
                .order('city', { ascending: true });
            if (data && data.length > 0) {
                setBranches(data);
            }
        };
        fetchBranches();
    }, []);

    // Listen for header Settings icon click to open the Settings modal
    useEffect(() => {
        const openModal = () => {
            setShowChangePinModal(true);
            setPinMsg({ text: '', type: '' });
            setCurrentPin('');
            setNewPin('');
            setConfirmPin('');
        };
        window.addEventListener('open-change-pin-modal', openModal);
        return () => window.removeEventListener('open-change-pin-modal', openModal);
    }, [customer]);

    // Auto-trigger PIN setup modal when arriving from PaymentSuccess with ?setup-pin=PHONE
    useEffect(() => {
        if (querySetupPin && !customer) {
            setSetupPinPhone(decodeURIComponent(querySetupPin));
            setShowSetupPinModal(true);
        }
    }, [querySetupPin, customer]);


    const handleChangePin = async (e) => {
        e.preventDefault();
        setPinMsg({ text: '', type: '' });
        if (newPin !== confirmPin) {
            setPinMsg({ text: 'New PINs do not match!', type: 'error' });
            return;
        }
        if (newPin.length !== 4) {
            setPinMsg({ text: 'PIN must be exactly 4 digits.', type: 'error' });
            return;
        }
        if (!customer || !customer.phone) {
            setPinMsg({ text: 'Session error. Please login again.', type: 'error' });
            return;
        }

        setPinLoading(true);
        try {
            // Update PIN via RPC
            const { data: success, error: updateError } = await supabase.rpc('customer_change_pin', {
                p_token: sessionStorage.getItem('shopy_customer_session'),
                p_current_pin: String(currentPin),
                p_new_pin: String(newPin)
            });

            if (updateError || !success) throw updateError || new Error('Failed to update');
            
            setPinMsg({ text: 'PIN changed successfully!', type: 'success' });
            setCurrentPin(''); setNewPin(''); setConfirmPin('');
            setTimeout(() => { setShowChangePinModal(false); setPinMsg({ text: '', type: '' }); }, 2000);
        } catch (err) {
            setPinMsg({ text: 'Failed to change PIN. Please try again.', type: 'error' });
        } finally {
            setPinLoading(false);
        }
    };

    // Share Order Function
    const handleShare = async (order) => {
        const text = `Check out my order #${order.order_number} from Shopy Nepal! Status: ${order.status}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Shopy Nepal Order',
                    text: text,
                    url: window.location.href
                });
            } catch (err) { console.error('Share failed:', err); }
        } else {
            navigator.clipboard.writeText(text);
            showNotification('Order info copied to clipboard!', 'success');
        }
    };

    const handleResetPin = async (e) => {
        e.preventDefault();
        setResetError('');
        if (resetNewPin.length !== 4) {
            setResetError('New PIN must be 4 digits');
            return;
        }

        setResetLoading(true);
        try {
            const { data: success, error: resetErr } = await supabase.rpc('reset_customer_pin', {
                p_phone: resetPhone,
                p_order_number: resetOrderNo,
                p_total_amount: parseFloat(resetTotal),
                p_new_pin: resetNewPin
            });

            if (resetErr || !success) {
                throw new Error('Verification failed. Please check your order details.');
            }

            showNotification('PIN reset successfully! You can now login.', 'success');
            setShowResetModal(false);
            setPhone(resetPhone);
            setPin(resetNewPin);
        } catch (err) {
            setResetError(err.message);
        } finally {
            setResetLoading(false);
        }
    };

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        const { data } = await supabase.from('website_delivery_branches').select('city, delivery_time');
        if (data) setBranches(data);
    };

    useEffect(() => {
        if (customer) {
            fetchOrders();
        }
    }, [customer]);

    const fetchOrders = async () => {
        setLoadingOrders(true);
        try {
            const { data: res, error: ordersError } = await supabase.rpc('customer_orders', {
                p_token: sessionStorage.getItem('shopy_customer_session')
            });

            if (ordersError || !res.success) throw ordersError || new Error(res.error);

            // Resolve missing product images so order cards always show a photo
            const ordersWithImages = res.orders || [];
            const missingIds = [...new Set(
                ordersWithImages.flatMap(o => (o.items || [])
                    .filter(i => !i.product_image)
                    .map(i => i.product_id))
            )];
            if (missingIds.length > 0) {
                const { data: imgs } = await supabase
                    .from('website_product_images')
                    .select('product_id, image_url, is_primary')
                    .in('product_id', missingIds);
                if (imgs) {
                    const best = {};
                    imgs.forEach(img => {
                        if (!best[img.product_id] || (img.is_primary && !best[img.product_id].is_primary)) {
                            best[img.product_id] = img;
                        }
                    });
                    ordersWithImages.forEach(o => (o.items || []).forEach(i => {
                        if (!i.product_image && best[i.product_id]) i.product_image = best[i.product_id].image_url;
                    }));
                }
            }

            setOrders(ordersWithImages);

            // Securely fetch returns via RPC
            const { data: retRes, error: retError } = await supabase.rpc('customer_returns', {
                p_token: sessionStorage.getItem('shopy_customer_session')
            });
            
            if (!retError && retRes.success) {
                const statusMap = {};
                retRes.returns.forEach(r => { statusMap[r.order_id] = r.status; });
                setRequestedReturnStatuses(statusMap);
            }

            // Ratings (Selecting order IDs for "Rated" badges can stay public for now if we allow public select on that table)
            const { data: ratingsData } = await supabase
                .from('website_product_ratings')
                .select('order_id')
                .eq('customer_phone', customer.phone);
            
            if (ratingsData) setRatedOrderIds(new Set(ratingsData.map(r => r.order_id).filter(Boolean)));
        } catch (err) {
            console.error('Fetch dashboard error:', err);
        } finally {
            setLoadingOrders(false);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        const res = await login(phone, pin);
        if (!res.success) setError(res.error || 'Login failed');
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        const res = await register(regName, regPhone, regPin);
        if (!res.success) setError(res.error || 'Registration failed');
    };

    const confirmCancelOrder = async () => {
        setIsCancelling(true);
        try {
            const { error: cancelError } = await supabase.rpc('handle_website_order_cancellation', {
                p_order_id: cancellingOrderId,
                p_reason: `CUSTOMER: ${cancelReason}`
            });
            if (cancelError) throw cancelError;
            
            await fetchOrders();
            setShowCancelModal(false);
        } catch (err) {
            console.error('Cancel error:', err);
            showNotification('Could not cancel order. Please contact support.', 'error');
        } finally {
            setIsCancelling(false);
        }
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        setReturnFiles(prev => [...prev, ...files.map(file => ({
            id: Math.random().toString(36).substr(2, 9),
            file: file,
            preview: URL.createObjectURL(file)
        }))]);
    };

    const removeFile = (id) => setReturnFiles(prev => prev.filter(f => f.id !== id));

    const handleSubmitReturn = async () => {
        setIsSubmittingReturn(true);
        try {
            const mediaUrls = [];
            for (const f of returnFiles) {
                const path = `returns/${selectedReturnOrder.id}/${Date.now()}-${f.file.name}`;
                await supabase.storage.from('images').upload(path, f.file);
                const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(path);
                mediaUrls.push({ url: publicUrl, type: 'image' });
            }
            await supabase.from('website_order_returns').insert({
                order_id: selectedReturnOrder.id,
                order_number: selectedReturnOrder.order_number,
                customer_phone: customer.phone,
                type: returnType,
                message: returnMessage,
                media: mediaUrls,
                status: 'pending'
            });
            setRequestedReturnStatuses(prev => ({ ...prev, [selectedReturnOrder.id]: 'pending' }));
            setReturnSuccess(true);
            setTimeout(() => { setShowReturnModal(false); setReturnSuccess(false); setReturnMessage(''); setReturnFiles([]); }, 2500);
        } finally {
            setIsSubmittingReturn(false);
        }
    };

    const confirmRateProduct = async () => {
        setIsRating(true);
        try {
            const { data: success, error: rateError } = await supabase.rpc('customer_submit_rating', {
                p_token: sessionStorage.getItem('shopy_customer_session'),
                p_order_id: rateData.orderId,
                p_product_id: rateData.productId,
                p_rating: rateValue,
                p_comment: rateComment
            });

            if (rateError || !success) throw rateError || new Error('Rating failed');

            // Refresh the local profile to see the new coins balance
            await refreshCustomer();

            setRatedOrderIds(prev => new Set([...prev, rateData.orderId]));
            setShowRateModal(false);
            showNotification("Thanks for your review! 25 Shopy Coins are pending — they'll be added to your wallet after the 2-day return window closes. 🪙", 'success', 6000);
        } catch (err) {
            console.error('Rating error:', err);
            showNotification('Failed to submit rating. Please try again.', 'error');
        } finally {
            setIsRating(false);
        }
    };

    const handleSetupPin = async (e) => {
        e.preventDefault();
        setSetupPinError('');
        if (!setupPinName.trim()) {
            setSetupPinError('Please enter your full name.');
            return;
        }
        if (setupPinValue.length !== 4) {
            setSetupPinError('PIN must be exactly 4 digits.');
            return;
        }
        if (setupPinValue !== setupPinConfirm) {
            setSetupPinError('PINs do not match. Please try again.');
            return;
        }
        setSetupPinLoading(true);
        const res = await setupPin(setupPinPhone, setupPinValue, setupPinName.trim());
        setSetupPinLoading(false);
        if (!res.success) {
            setSetupPinError(res.error || 'Failed to create account. Please try again.');
        } else {
            setShowSetupPinModal(false);
            showNotification('🎉 Account created! Welcome to Shopy Nepal.', 'success', 5000);
        }
    };

    if (!customer) {
        return (
            <>
                {/* ── PIN Setup Modal (first-time buyers) ─────────────────────── */}
                {showSetupPinModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                        <div style={{ background: 'white', borderRadius: '2rem', padding: '2.5rem', width: '100%', maxWidth: '420px', boxShadow: '0 30px 80px rgba(0,0,0,0.2)', position: 'relative', animation: 'slideUp 0.3s ease' }}>
                            {/* Header */}
                            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                                <div style={{ margin: '0 auto 1.25rem', display: 'flex', justifyContent: 'center' }}>
                                    <img
                                        src="/logo.png"
                                        alt="Shopy Nepal"
                                        style={{ height: '64px', width: 'auto', objectFit: 'contain' }}
                                    />
                                </div>
                                <h2 style={{ fontWeight: '900', fontSize: '1.35rem', color: '#111827', margin: '0 0 0.4rem 0' }}>Set Your Account PIN</h2>
                                <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: '1.5' }}>
                                    Choose a 4-digit PIN to access your orders anytime.
                                </p>
                                <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '0.6rem 1rem', marginTop: '0.75rem', display: 'inline-block' }}>
                                    <p style={{ fontSize: '0.8rem', fontWeight: '700', color: '#059669', margin: 0 }}>📱 Phone: {setupPinPhone}</p>
                                </div>
                            </div>

                            <form onSubmit={handleSetupPin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#374151', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Full Name</label>
                                    <input
                                        type="text"
                                        value={setupPinName}
                                        onChange={e => setSetupPinName(e.target.value)}
                                        placeholder="e.g. Ram Bahadur Thapa"
                                        autoFocus
                                        style={{ width: '100%', padding: '0.9rem 1.25rem', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '0.95rem', fontWeight: '600', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                                        onFocus={e => e.target.style.borderColor = '#ef4444'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#374151', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Choose PIN</label>
                                    <input
                                        type="password"
                                        maxLength={4}
                                        value={setupPinValue}
                                        onChange={e => setSetupPinValue(e.target.value.replace(/\D/g, ''))}
                                        placeholder="• • • •"
                                        style={{ width: '100%', padding: '0.9rem 1.25rem', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '1.5rem', fontWeight: '900', letterSpacing: '0.5em', textAlign: 'center', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                                        onFocus={e => e.target.style.borderColor = '#ef4444'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: '800', color: '#374151', marginBottom: '0.4rem', display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirm PIN</label>
                                    <input
                                        type="password"
                                        maxLength={4}
                                        value={setupPinConfirm}
                                        onChange={e => setSetupPinConfirm(e.target.value.replace(/\D/g, ''))}
                                        placeholder="• • • •"
                                        style={{ width: '100%', padding: '0.9rem 1.25rem', borderRadius: '12px', border: '2px solid #e2e8f0', fontSize: '1.5rem', fontWeight: '900', letterSpacing: '0.5em', textAlign: 'center', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
                                        onFocus={e => e.target.style.borderColor = '#ef4444'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                </div>

                                {setupPinError && (
                                    <p style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: '700', textAlign: 'center', background: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #fecaca' }}>{setupPinError}</p>
                                )}

                                <button
                                    type="submit"
                                    disabled={setupPinLoading}
                                    className="btn btn-primary"
                                    style={{ padding: '1rem', borderRadius: '12px', fontWeight: '800', fontSize: '0.95rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                >
                                    {setupPinLoading ? <Loader2 size={18} className="animate-spin" /> : <><CheckCircle2 size={18} /> Create My Account</>}
                                </button>
                            </form>

                            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                                <button
                                    onClick={() => { setShowSetupPinModal(false); }}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.82rem', fontWeight: '700', cursor: 'pointer' }}
                                >
                                    Skip for now — I'll login later
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Normal Login / Register screen ──────────────────────────── */}
                <div className="auth-container" style={{ minHeight: '90vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div style={{ background: 'white', padding: '2.5rem', borderRadius: '2rem', width: '100%', maxWidth: '400px', boxShadow: 'var(--shadow-lg)' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '900', marginBottom: '1.5rem', textAlign: 'center' }}>
                            {isRegistering ? 'Join Shopy Nepal' : 'Welcome Back'}
                        </h2>
                    <form onSubmit={isRegistering ? handleRegister : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {isRegistering && (
                            <input required className="form-input" placeholder="Full Name" value={regName} onChange={e => setRegName(e.target.value)} style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: '#f8fafc', fontWeight: '600' }} />
                        )}
                        <input required type="tel" maxLength={10} className="form-input" placeholder="Phone Number" value={isRegistering ? regPhone : phone} onChange={e => isRegistering ? setRegPhone(e.target.value.replace(/\D/g, '')) : setPhone(e.target.value.replace(/\D/g, ''))} style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: '#f8fafc', fontWeight: '600' }} />
                        
                        <input required type="password" maxLength={4} className="form-input" placeholder="4-Digit PIN" value={isRegistering ? regPin : pin} onChange={e => isRegistering ? setRegPin(e.target.value.replace(/\D/g, '')) : setPin(e.target.value.replace(/\D/g, ''))} style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: '#f8fafc', fontWeight: '900', letterSpacing: '0.2em' }} />
                        
                        {error && <p style={{ color: 'var(--primary-red)', fontSize: '0.8rem', fontWeight: '700', textAlign: 'center' }}>{error}</p>}
                        
                        <button type="submit" disabled={authLoading} className="btn btn-primary" style={{ padding: '1rem', borderRadius: '12px', fontWeight: '800', marginTop: '0.5rem' }}>
                            {authLoading ? <Loader2 className="animate-spin" /> : (isRegistering ? 'Register' : 'Login')}
                        </button>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <button 
                                type="button" 
                                onClick={() => setIsRegistering(!isRegistering)} 
                                style={{ background: 'none', border: 'none', color: 'var(--text-gray)', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' }}
                            >
                                {isRegistering ? 'Already have an account? Login' : 'New here? Create Account'}
                            </button>

                            {!isRegistering && (
                                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                                    <a 
                                        href={`https://wa.me/${(settings.support_phone || settings.store_phone || '9779845877777').replace(/\D/g, '')}?text=${encodeURIComponent(`Hi Shopy Nepal, I forgot my account PIN. My phone number is: ${phone || '(Not provided)'}. Please help me reset it!`)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ 
                                            color: 'var(--primary-red)', 
                                            fontSize: '0.8rem', 
                                            fontWeight: '800', 
                                            textDecoration: 'underline',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Forgot PIN?
                                    </a>
                                </div>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </>
        );
    }

    const getStatusStyle = (status) => {
        const s = status ? status.toLowerCase() : '';
        switch (s) {
            case 'processing':
                return { bg: '#e0f2fe', color: '#0284c7', border: '#bae6fd' }; // Light Blue
            case 'sent':
                return { bg: '#f3e8ff', color: '#9333ea', border: '#e9d5ff' }; // Purple
            case 'delivered':
                return { bg: '#dcfce7', color: '#16a34a', border: '#bbf7d0' }; // Green
            case 'cancelled':
                return { bg: '#fee2e2', color: '#dc2626', border: '#fecaca' }; // Red
            case 'returned':
                return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' }; // Gray
            default:
                return { bg: '#f8fafc', color: 'var(--primary-blue)', border: 'var(--border-color)' };
        }
    };

    const filteredOrders = activeStatus === 'All' ? orders : orders.filter(o => o.status?.toLowerCase() === activeStatus.toLowerCase());
    const statuses = ['Processing', 'Sent', 'Delivered', 'Returned', 'Cancelled'];

    return (
        <div className="section" style={{ background: '#f8fafc', minHeight: '90vh', paddingTop: '1rem', paddingBottom: '3.5rem' }}>
            <style>{`
                @media (max-width: 768px) {
                    .account-header-card, .wallet-card {
                        margin-left: -1.25rem !important;
                        margin-right: -1.25rem !important;
                        border-radius: 0 !important;
                    }
                    .account-header-card {
                        margin-top: -1rem !important; /* Move it slightly up so it's closer to the header */
                    }
                }
            `}</style>
            <div className="container">

                {/* ── Account Header ── */}
                <div className="account-header-card" style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    borderRadius: '1.25rem',
                    padding: '0.85rem 1.25rem',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    color: 'white',
                    boxShadow: '0 4px 20px rgba(239, 68, 68, 0.2)',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    {/* bg glow */}
                    <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', filter: 'blur(20px)', pointerEvents: 'none' }} />

                    {/* Avatar */}
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '50%',
                        background: 'rgba(255,255,255,0.2)',
                        border: '2px solid rgba(255,255,255,0.35)',
                        color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.1rem', fontWeight: '900', flexShrink: 0
                    }}>
                        {(customer.name || 'U')[0].toUpperCase()}
                    </div>

                    {/* Name & Phone */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: '900', fontSize: '0.95rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer.name}</p>
                        <p style={{ fontSize: '0.75rem', margin: '1px 0 0', opacity: 0.65, fontWeight: '500' }}>+977 {customer.phone}</p>
                    </div>

                    {/* Verified badge */}
                    <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '100px', padding: '0.25rem 0.75rem', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.05em', color: 'white' }}>✓ VERIFIED</span>
                    </div>
                </div>

                {/* ── My Wallet Card ── */}
                <div className="wallet-card" style={{
                    background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                    borderRadius: '1.25rem',
                    padding: '0.85rem 1.25rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    color: 'white',
                    boxShadow: '0 4px 20px rgba(15, 23, 42, 0.25)',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    {/* bg glow */}
                    <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', filter: 'blur(20px)', pointerEvents: 'none' }} />

                    {/* Golden Coins icon */}
                    <div style={{
                        width: '44px', height: '44px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #fef08a 0%, #f59e0b 50%, #b45309 100%)',
                        border: '2px solid #fef08a',
                        boxShadow: '0 0 14px rgba(245, 158, 11, 0.6), inset 0 2px 4px rgba(255,255,255,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#451a03', flexShrink: 0
                    }}>
                        <Coins size={22} strokeWidth={2.5} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
                    </div>

                    {/* Label */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: '900', fontSize: '0.95rem', margin: 0 }}>My Wallet</p>
                        <p style={{ fontSize: '0.75rem', margin: '1px 0 0', opacity: 0.55, fontWeight: '500' }}>Shopy Coins</p>
                    </div>

                    {/* Active chip */}
                    <div style={{
                        background: 'rgba(255,255,255,0.12)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '0.75rem',
                        padding: '0.45rem 0.75rem',
                        minWidth: '60px',
                        textAlign: 'center',
                        flexShrink: 0
                    }}>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, fontWeight: '700' }}>Active</p>
                        <p style={{ color: 'white', fontSize: '1.05rem', fontWeight: '900', margin: '1px 0 0' }}>
                            {customer.shopy_coins || 0}
                        </p>
                    </div>

                    {/* Pending chip */}
                    <div style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '0.75rem',
                        padding: '0.45rem 0.75rem',
                        minWidth: '60px',
                        textAlign: 'center',
                        flexShrink: 0
                    }}>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, fontWeight: '700' }}>Pending</p>
                        <p style={{ color: Number(customer.pending_coins) > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)', fontSize: '1.05rem', fontWeight: '900', margin: '1px 0 0' }}>
                            {customer.pending_coins || 0}
                        </p>
                    </div>
                </div>


                <div className="status-tabs-container" style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '1rem', scrollbarWidth: 'none' }}>
                    {statuses.map(s => {
                        const count = s === 'All' ? orders.length : orders.filter(o => o.status?.toLowerCase() === s.toLowerCase()).length;
                        return (
                            <button key={s} onClick={() => setActiveStatus(s)} style={{ 
                                padding: '0.6rem 1.25rem', borderRadius: '100px', border: '1px solid var(--border-color)', 
                                background: activeStatus === s ? 'var(--primary-blue)' : 'white', 
                                color: activeStatus === s ? 'white' : 'var(--text-gray)',
                                fontWeight: '800', fontSize: '0.85rem', whiteSpace: 'nowrap', cursor: 'pointer', transition: 'all 0.2s'
                            }}>
                                {s} {count > 0 ? `(${count})` : ''}
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {loadingOrders ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="skeleton" style={{ height: '180px', width: '100%', borderRadius: '1.5rem' }} />
                            ))}
                        </div>
                    ) : filteredOrders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '5rem', background: 'white', borderRadius: '2rem', border: '1px solid var(--border-color)' }}>
                            <ShoppingBag size={48} color="var(--border-color)" style={{ marginBottom: '1rem' }} />
                            <h3 style={{ fontWeight: '800' }}>No orders found</h3>
                            <button onClick={() => navigate('/shop')} className="btn btn-primary" style={{ marginTop: '1.5rem', padding: '0.75rem 2rem' }}>Start Shopping</button>
                        </div>
                    ) : (
                        filteredOrders.map(order => {
                            const statusStyle = getStatusStyle(order.status);
                            const isEsewa = order.payment_method === 'eSewa' || order.notes?.toLowerCase().includes('esewa');
                            const isPaid = isEsewa || order.notes?.toLowerCase().includes('payment complete');

                            return (
                            <div key={order.id} style={{ background: 'white', borderRadius: '1.5rem', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ padding: '1.25rem', background: '#fafafa', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            <p style={{ fontSize: '0.7rem', fontWeight: '900', color: 'var(--text-gray)', textTransform: 'uppercase', margin: 0 }}>Order #{order.order_number}</p>
                                            {isPaid ? (
                                                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <CheckCircle2 size={11} /> PAID ({order.payment_method || 'eSewa'})
                                                </span>
                                            ) : (
                                                <span style={{ padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center' }}>
                                                    COD
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.85rem', fontWeight: '800', marginTop: '0.25rem' }}>{new Date(order.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ padding: '0.4rem 1rem', borderRadius: '100px', fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase', background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}>
                                            {order.status}
                                        </span>
                                        <p style={{ fontSize: '1rem', fontWeight: '900', marginTop: '0.5rem' }}>Rs. {order.total_amount.toLocaleString()}</p>
                                    </div>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {order.items?.map(item => (
                                            <div key={item.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                {item.product_image && item.product_id ? (
                                                    <Link to={`/product/${item.product_id}`}>
                                                        <img src={item.product_image} alt="" style={{ width: '45px', height: '45px', borderRadius: '8px', objectFit: 'cover' }} />
                                                    </Link>
                                                ) : (
                                                    item.product_image && <img src={item.product_image} alt="" style={{ width: '45px', height: '45px', borderRadius: '8px', objectFit: 'cover' }} />
                                                )}
                                                <div style={{ flex: 1 }}>
                                                    {item.product_id ? (
                                                        <Link to={`/product/${item.product_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                                            <p style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a' }}>{item.product_title}</p>
                                                        </Link>
                                                    ) : (
                                                        <p style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a' }}>{item.product_title}</p>
                                                    )}
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-gray)', fontWeight: '600' }}>Qty: {item.quantity}</p>
                                                        {item.sku && <span style={{ fontSize: '0.65rem', padding: '1px 6px', background: '#f1f5f9', borderRadius: '4px', fontWeight: '700', color: 'var(--primary-blue)' }}>{item.sku}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {['pending', 'processing'].includes(order.status?.toLowerCase()) && (
                                        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-gray)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Truck size={14} className="text-primary-blue" />
                                                Expect delivery in {branches.find(b => b.city === order.city)?.delivery_time || '2-4 Days'}
                                            </span>
                                            {!isPaid ? (
                                                <button 
                                                    onClick={() => { setCancellingOrderId(order.id); setShowCancelModal(true); setCancelReason(''); }}
                                                    className="btn" style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', background: 'white', color: '#ef4444', border: '1px solid #fecaca', fontWeight: '800' }}>
                                                    Cancel Order
                                                </button>
                                            ) : (
                                                <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#059669', background: '#ecfdf5', padding: '0.3rem 0.75rem', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <CheckCircle2 size={12} /> Payment Confirmed
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {order.status?.toLowerCase() === 'delivered' && (
                                        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                                            {/* Rate button on the left */}
                                            {(() => {
                                                const alreadyRated = ratedOrderIds.has(order.id);
                                                const firstItem = order.items?.[0];
                                                return alreadyRated ? (
                                                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <CheckCircle2 size={14} strokeWidth={3} /> Rated
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => { setRateData({ orderId: order.id, productId: firstItem?.product_id, productTitle: firstItem?.product_title }); setShowRateModal(true); setRateValue(5); setRateComment(''); }}
                                                        className="btn" style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', background: '#f8fafc', color: 'var(--primary-blue)', border: '1px solid var(--border-color)', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Star size={13} /> Rate
                                                    </button>
                                                );
                                            })()}
                                            {/* Return button on the right — 2-day window only */}
                                            {(() => {
                                                const daysSinceDelivery = (Date.now() - new Date(order.updated_at).getTime()) / (1000 * 60 * 60 * 24);
                                                const withinWindow = daysSinceDelivery <= 2;
                                                if (requestedReturnStatuses[order.id]) {
                                                    return (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--primary-blue)', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '0.4rem 0.8rem', borderRadius: '100px', border: '1px solid var(--border-color)' }}>
                                                            <Info size={14} /> Return {requestedReturnStatuses[order.id]}
                                                        </span>
                                                    );
                                                }
                                                if (!withinWindow) {
                                                    return (
                                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <XCircle size={13} /> Return window closed
                                                        </span>
                                                    );
                                                }
                                                return (
                                                    <button
                                                        onClick={() => { setSelectedReturnOrder(order); setShowReturnModal(true); setReturnSuccess(false); setReturnMessage(''); setReturnFiles([]); }}
                                                        className="btn" style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', background: 'white', color: '#ef4444', border: '1px solid #fecaca', fontWeight: '800' }}>
                                                        Return / Exchange
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )})
                    )}
                </div>
            </div>

            {/* Cancel Modal */}
            {showCancelModal && (
                <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontWeight: '900', marginBottom: '1rem' }}>Cancel Order?</h2>
                        <textarea placeholder="Reason for cancellation..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} style={{ width: '100%', height: '100px', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1.5rem', outline: 'none' }} />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={() => setShowCancelModal(false)} className="btn" style={{ flex: 1, background: '#f1f5f9' }}>Back</button>
                            <button onClick={confirmCancelOrder} className="btn btn-primary" style={{ flex: 1, background: '#ef4444' }}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rate Modal */}
            {showRateModal && (
                <div className="modal-overlay" onClick={() => setShowRateModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontWeight: '900', marginBottom: '0.5rem' }}>Rate Product</h2>
                        <p style={{ color: 'var(--text-gray)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{rateData.productTitle}</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                            {[1, 2, 3, 4, 5].map(s => <Star key={s} size={32} fill={s <= rateValue ? '#fbbf24' : 'none'} color={s <= rateValue ? '#fbbf24' : '#cbd5e1'} onClick={() => setRateValue(s)} style={{ cursor: 'pointer' }} />)}
                        </div>
                        <textarea placeholder="Tell us more..." value={rateComment} onChange={e => setRateComment(e.target.value)} style={{ width: '100%', height: '100px', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1.5rem', outline: 'none' }} />
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={() => setShowRateModal(false)} className="btn" style={{ flex: 1, background: '#f1f5f9' }}>Cancel</button>
                            <button 
                                onClick={confirmRateProduct} 
                                disabled={isRating}
                                className="btn btn-primary" 
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                {isRating ? <><Loader2 className="animate-spin" size={16} /> Saving...</> : 'Submit'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Return Modal */}
            {showReturnModal && (
                <div className="modal-overlay" onClick={() => setShowReturnModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ padding: 0, overflow: 'hidden' }}>
                        {returnSuccess ? (
                            <div style={{ padding: '3rem 2rem', textAlign: 'center' }}>
                                <CheckCircle2 size={64} color="#10b981" style={{ marginBottom: '1rem' }} />
                                <h2 style={{ fontWeight: '900' }}>Request Submitted</h2>
                                <p style={{ color: 'var(--text-gray)' }}>We'll contact you shortly.</p>
                            </div>
                        ) : (
                            <div style={{ padding: '1.5rem' }}>
                                <h2 style={{ fontWeight: '900', marginBottom: '1.5rem' }}>Exchange / Return</h2>
                                <div style={{ display: 'flex', gap: '0.75rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                                    <button onClick={() => setReturnType('return')} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: returnType === 'return' ? '#ef4444' : 'transparent', color: returnType === 'return' ? 'white' : 'var(--text-gray)', fontWeight: '800' }}>Return</button>
                                    <button onClick={() => setReturnType('exchange')} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: 'none', background: returnType === 'exchange' ? '#3b82f6' : 'transparent', color: returnType === 'exchange' ? 'white' : 'var(--text-gray)', fontWeight: '800' }}>Exchange</button>
                                </div>
                                <textarea placeholder="Reason..." value={returnMessage} onChange={e => setReturnMessage(e.target.value)} style={{ width: '100%', height: '100px', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '1.5rem', outline: 'none' }} />
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                                    {returnFiles.map(f => <img key={f.id} src={f.preview} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />)}
                                    {returnFiles.length < 5 && (
                                        <label style={{ width: '60px', height: '60px', borderRadius: '8px', border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                            <input type="file" multiple accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                                            <Camera size={20} color="var(--text-gray)" />
                                        </label>
                                    )}
                                </div>
                                <button onClick={handleSubmitReturn} disabled={isSubmittingReturn || !returnMessage.trim()} className="btn btn-primary" style={{ width: '100%', padding: '1rem', background: returnType === 'return' ? '#ef4444' : '#3b82f6' }}>
                                    {isSubmittingReturn ? <Loader2 className="animate-spin" /> : 'Submit Request'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Account Settings Modal */}
            {showChangePinModal && (
                <div 
                    className="modal-overlay" 
                    onClick={() => setShowChangePinModal(false)}
                    style={{ zIndex: 10000 }}
                >
                    <div 
                        className="modal-content" 
                        onClick={e => e.stopPropagation()}
                        style={{ margin: 'auto', padding: '1.75rem', maxWidth: '420px', width: '92%', borderRadius: '1.5rem', position: 'relative' }}
                    >
                        {/* Header & Close Button */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                            <h2 style={{ fontWeight: '900', fontSize: '1.2rem', margin: 0, color: '#0f172a' }}>
                                ⚙️ Account Settings
                            </h2>
                            <button 
                                onClick={() => setShowChangePinModal(false)} 
                                style={{ background: '#f1f5f9', borderRadius: '50%', padding: '4px', minHeight: '32px', minWidth: '32px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={20} color="var(--text-gray)" />
                            </button>
                        </div>

                        {/* Change PIN Form */}
                        <form onSubmit={handleChangePin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '0.4rem' }}>Current PIN</label>
                                    <input required type="password" maxLength={4} value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))} placeholder="Current 4-digit PIN" style={{ width: '100%', padding: '0.85rem 1.1rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: '900', letterSpacing: '0.2em', fontSize: '1.1rem' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '0.4rem' }}>New PIN</label>
                                    <input required type="password" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="New 4-digit PIN" style={{ width: '100%', padding: '0.85rem 1.1rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: '900', letterSpacing: '0.2em', fontSize: '1.1rem' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '0.4rem' }}>Confirm New PIN</label>
                                    <input required type="password" maxLength={4} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))} placeholder="Confirm new PIN" style={{ width: '100%', padding: '0.85rem 1.1rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: '900', letterSpacing: '0.2em', fontSize: '1.1rem' }} />
                                    {confirmPin && confirmPin !== newPin && (
                                        <p style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: '700', marginTop: '0.3rem' }}>PINs do not match</p>
                                    )}
                                </div>
                                {pinMsg.text && (
                                    <p style={{ color: pinMsg.type === 'success' ? '#16a34a' : '#ef4444', fontSize: '0.85rem', fontWeight: '800', textAlign: 'center', padding: '0.75rem', background: pinMsg.type === 'success' ? '#dcfce7' : '#fee2e2', borderRadius: '10px' }}>
                                        {pinMsg.type === 'success' ? '✅ ' : '❌ '}{pinMsg.text}
                                    </p>
                                )}
                                <button type="submit" disabled={pinLoading} className="btn btn-primary" style={{ width: '100%', padding: '0.9rem', borderRadius: '12px', fontWeight: '900', fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    {pinLoading ? <Loader2 className="animate-spin" size={20} /> : '🔐 Update PIN'}
                                </button>
                            </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyOrders;
