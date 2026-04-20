import { useState, useEffect } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext';
import { supabase } from '../lib/supabase';
import { 
    Package, Phone, Lock, ChevronRight, 
    Truck, CheckCircle, Clock, AlertCircle, ShoppingBag,
    Calendar, MapPin, Info, XCircle, X,
    Star, RotateCcw, Camera, Trash2, CheckCircle2, Loader2,
    ArrowLeft, Share2
} from 'lucide-react';

const MyOrders = () => {
    const { customer, login, logout, register, updateProfile, loading: authLoading, refreshCustomer } = useCustomer();
    const location = useLocation();
    const navigate = useNavigate();
    
    const queryTab = new URLSearchParams(location.search).get('tab');
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
    const [regAddress, setRegAddress] = useState('');
    const [regCity, setRegCity] = useState('');
    const [error, setError] = useState('');

    // Profile Edit State
    const [editName, setEditName] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [editCity, setEditCity] = useState('');
    const [updateMsg, setUpdateMsg] = useState({ text: '', type: '' });

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

    // Change PIN State
    const [showChangePinModal, setShowChangePinModal] = useState(false);
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [pinLoading, setPinLoading] = useState(false);
    const [pinMsg, setPinMsg] = useState({ text: '', type: '' });

    // Listen for header Settings icon click to open the Change PIN modal
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
    }, []);


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
            const { data: success, error: updateError } = await supabase.rpc('change_customer_pin', {
                p_phone: String(customer.phone),
                p_old_pin: String(currentPin),
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
            alert('Order info copied to clipboard!');
        }
    };

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        const { data } = await supabase.from('website_delivery_branches').select('city');
        if (data) setBranches(data);
    };

    useEffect(() => {
        if (customer) {
            setEditName(customer.name || '');
            setEditAddress(customer.address || '');
            setEditCity(customer.city || '');
            fetchOrders();
        }
    }, [customer]);

    const fetchOrders = async () => {
        setLoadingOrders(true);
        try {
            const { data: res, error: ordersError } = await supabase.rpc('get_customer_orders', {
                p_phone: customer.phone,
                p_pin: customer.pin_hash || customer.pin
            });

            if (ordersError || !res.success) throw ordersError || new Error(res.error);
            setOrders(res.orders || []);

            // Securely fetch returns via RPC
            const { data: retRes, error: retError } = await supabase.rpc('get_customer_returns', {
                p_phone: customer.phone,
                p_pin: customer.pin_hash || customer.pin
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
        const res = await register(regName, regPhone, regPin, regAddress, regCity);
        if (!res.success) setError(res.error || 'Registration failed');
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        const res = await updateProfile({ name: editName, address: editAddress, city: editCity });
        if (res.success) {
            setUpdateMsg({ text: 'Profile updated!', type: 'success' });
            setTimeout(() => setUpdateMsg({ text: '', type: '' }), 3000);
        }
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
            alert('Could not cancel order. Please contact support.');
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
            const { data: success, error: rateError } = await supabase.rpc('submit_product_rating', {
                p_phone: customer.phone,
                p_pin: customer.pin_hash || customer.pin,
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
            alert("Thanks for your review! You've just earned 25 Shopy Coins! 🪙");
        } catch (err) {
            console.error('Rating error:', err);
            alert('Failed to submit rating. Please try again.');
        } finally {
            setIsRating(false);
        }
    };

    if (!customer) {
        return (
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
                        
                        {isRegistering && (
                            <>
                                <select required className="form-input" value={regCity} onChange={e => setRegCity(e.target.value)} style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: '#f8fafc', fontWeight: '600' }}>
                                    <option value="">Select City</option>
                                    {branches.map(b => <option key={b.city} value={b.city}>{b.city}</option>)}
                                </select>
                                <input required className="form-input" placeholder="Area / Address" value={regAddress} onChange={e => setRegAddress(e.target.value)} style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: '#f8fafc', fontWeight: '600' }} />
                            </>
                        )}
                        
                        <input required type="password" maxLength={4} className="form-input" placeholder="4-Digit PIN" value={isRegistering ? regPin : pin} onChange={e => isRegistering ? setRegPin(e.target.value.replace(/\D/g, '')) : setPin(e.target.value.replace(/\D/g, ''))} style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: '#f8fafc', fontWeight: '900', letterSpacing: '0.2em' }} />
                        
                        {error && <p style={{ color: 'var(--primary-red)', fontSize: '0.8rem', fontWeight: '700', textAlign: 'center' }}>{error}</p>}
                        
                        <button type="submit" disabled={authLoading} className="btn btn-primary" style={{ padding: '1rem', borderRadius: '12px', fontWeight: '800', marginTop: '0.5rem' }}>
                            {authLoading ? <Loader2 className="animate-spin" /> : (isRegistering ? 'Register' : 'Login')}
                        </button>
                        
                        <button type="button" onClick={() => setIsRegistering(!isRegistering)} style={{ background: 'none', border: 'none', color: 'var(--text-gray)', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' }}>
                            {isRegistering ? 'Already have an account? Login' : 'New here? Create Account'}
                        </button>
                    </form>
                </div>
            </div>
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
        <div className="section" style={{ background: '#f8fafc', minHeight: '90vh' }}>
            <style>{`
                @media (max-width: 768px) {
                    .account-header-card {
                        margin-left: -1.25rem !important;
                        margin-right: -1.25rem !important;
                        border-radius: 0 !important;
                        margin-top: -1rem !important; /* Move it slightly up so it's closer to the header */
                    }
                }
            `}</style>
            <div className="container">
                {/* ── Account Header ── */}
                <div className="account-header-card" style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    borderRadius: '1.25rem',
                    padding: '1.5rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    color: 'white',
                    boxShadow: '0 4px 20px rgba(239, 68, 68, 0.2)'
                }}>
                    {/* Avatar */}
                    <div style={{
                        width: '56px', height: '56px', borderRadius: '50%',
                        background: '#ffffff',
                        color: 'var(--primary-red)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.4rem', fontWeight: '900', flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                        {(customer.name || 'U')[0].toUpperCase()}
                    </div>

                    {/* Name & Phone */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: '900', fontSize: '1.05rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer.name}</p>
                        <p style={{ fontSize: '0.8rem', margin: '2px 0 0', opacity: 0.7, fontWeight: '500' }}>+977 {customer.phone}</p>
                    </div>

                    {/* Coins */}
                    <div style={{
                        background: 'var(--primary-blue)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '0.75rem',
                        padding: '0.6rem 1rem',
                        textAlign: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.3)'
                    }}>
                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, fontWeight: '700' }}>Coins</p>
                        <p style={{ color: 'white', fontSize: '1.2rem', fontWeight: '900', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            🪙 {customer.shopy_coins || 0}
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
                            return (
                            <div key={order.id} style={{ background: 'white', borderRadius: '1.5rem', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ padding: '1.25rem', background: '#fafafa', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ fontSize: '0.7rem', fontWeight: '900', color: 'var(--text-gray)', textTransform: 'uppercase' }}>Order #{order.order_number}</p>
                                        <p style={{ fontSize: '0.85rem', fontWeight: '800' }}>{new Date(order.created_at).toLocaleDateString()}</p>
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
                                                {item.product_image && <img src={item.product_image} alt="" style={{ width: '45px', height: '45px', borderRadius: '8px', objectFit: 'cover' }} />}
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a' }}>{item.product_title}</p>
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
                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-gray)' }}>Expect delivery in 2-3 days</span>
                                            <button 
                                                onClick={() => { setCancellingOrderId(order.id); setShowCancelModal(true); setCancelReason(''); }}
                                                className="btn" style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', background: 'white', color: '#ef4444', border: '1px solid #fecaca', fontWeight: '800' }}>
                                                Cancel Order
                                            </button>
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

            {/* Change PIN Modal */}
            {showChangePinModal && (
                <div 
                    className="modal-overlay" 
                    onClick={() => setShowChangePinModal(false)}
                    style={{ zIndex: 10000 }}
                >
                    <div 
                        className="modal-content" 
                        onClick={e => e.stopPropagation()}
                        style={{ margin: 'auto', padding: '2rem', maxWidth: '380px', width: '90%', borderRadius: '1.5rem', position: 'relative' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontWeight: '900', fontSize: '1.2rem', margin: 0 }}>🔒 Change PIN</h2>
                            <button 
                                onClick={() => setShowChangePinModal(false)} 
                                style={{ background: '#f1f5f9', borderRadius: '50%', padding: '4px', minHeight: '32px', minWidth: '32px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <X size={20} color="var(--text-gray)" />
                            </button>
                        </div>
                        <form onSubmit={handleChangePin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '0.4rem' }}>Current PIN</label>
                                <input required type="password" maxLength={4} value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, ''))} placeholder="Current 4-digit PIN" style={{ width: '100%', padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: '900', letterSpacing: '0.2em', fontSize: '1.1rem' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '0.4rem' }}>New PIN</label>
                                <input required type="password" maxLength={4} value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))} placeholder="New 4-digit PIN" style={{ width: '100%', padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: '900', letterSpacing: '0.2em', fontSize: '1.1rem' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '0.4rem' }}>Confirm New PIN</label>
                                <input required type="password" maxLength={4} value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))} placeholder="Confirm new PIN" style={{ width: '100%', padding: '0.9rem 1.1rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', background: '#f8fafc', fontWeight: '900', letterSpacing: '0.2em', fontSize: '1.1rem' }} />
                                {confirmPin && confirmPin !== newPin && (
                                    <p style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: '700', marginTop: '0.3rem' }}>PINs do not match</p>
                                )}
                            </div>
                            {pinMsg.text && (
                                <p style={{ color: pinMsg.type === 'success' ? '#16a34a' : '#ef4444', fontSize: '0.85rem', fontWeight: '800', textAlign: 'center', padding: '0.75rem', background: pinMsg.type === 'success' ? '#dcfce7' : '#fee2e2', borderRadius: '10px' }}>
                                    {pinMsg.type === 'success' ? '✅ ' : '❌ '}{pinMsg.text}
                                </p>
                            )}
                            <button type="submit" disabled={pinLoading} className="btn btn-primary" style={{ width: '100%', padding: '1rem', borderRadius: '12px', fontWeight: '900', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
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
