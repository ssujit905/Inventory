import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, ShoppingBag, Calendar, CreditCard, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNotification } from '../context/NotificationContext';
import { useCustomer } from '../context/CustomerContext';

const PaymentSuccess = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { showNotification } = useNotification();
    const { customer } = useCustomer();
    const [loading, setLoading] = useState(true);
    const [orderInfo, setOrderInfo] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    // Prevent React StrictMode from double-invoking the payment (would create 2 orders)
    const hasRun = useRef(false);

    useEffect(() => {
        if (hasRun.current) return; // StrictMode guard: only run once
        hasRun.current = true;

        const verifyPayment = async () => {
            const dataParam = searchParams.get('data');
            const prnParam = searchParams.get('PRN'); // Fonepay Product Reference Number

            if (!dataParam && !prnParam) {
                setErrorMsg('Invalid payment response. Missing payment details.');
                setLoading(false);
                return;
            }

            try {
                let orderSummary = null;

                if (dataParam) {
                    // ─── ESEWA FLOW ───
                    const decodedString = atob(dataParam);
                    const paymentDetails = JSON.parse(decodedString);
                    const { transaction_uuid, transaction_code, total_amount, status } = paymentDetails;

                    if (status !== 'COMPLETE') {
                        setErrorMsg(`Payment was not completed. Status: ${status}`);
                        setLoading(false);
                        return;
                    }

                    const { data: verification, error: verificationError } = await supabase.functions.invoke('payment-gateway', {
                        body: { action: 'verify-esewa-response', paymentDetails }
                    });
                    const isSignatureValid = !verificationError && verification?.valid === true;

                    if (!isSignatureValid) {
                        console.error('Invalid eSewa payment signature:', { received: paymentDetails.signature });
                        setErrorMsg('Security check failed. The payment signature is invalid.');
                        setLoading(false);
                        return;
                    }

                    const realOrderNumber = transaction_uuid.includes('-')
                        ? transaction_uuid.substring(0, transaction_uuid.lastIndexOf('-'))
                        : transaction_uuid;

                    const rawPending = sessionStorage.getItem('pending_esewa_order');
                    const cacheKey = `last_esewa_success_${realOrderNumber}`;
                    const cachedSummary = sessionStorage.getItem(cacheKey) || sessionStorage.getItem('last_esewa_success');

                    if (rawPending) {
                        const pending = JSON.parse(rawPending);
                        const { data: createRes, error: createError } = await supabase.rpc('create_atomic_website_order', {
                            p_customer_name: pending.customer_name,
                            p_phone: pending.phone,
                            p_phone2: pending.phone2,
                            p_address: pending.address,
                            p_city: pending.city,
                            p_payment_method: 'eSewa',
                            p_shipping_fee: pending.shipping_fee,
                            p_total_amount: pending.total_amount,
                            p_items: pending.items,
                            p_coins_used: pending.coins_used,
                            p_ad_id: pending.ad_id
                        });

                        if (createError) throw new Error('Payment was verified but order could not be created: ' + createError.message);

                        const confirmedOrderNumber = createRes?.order_number || realOrderNumber;
                        const cleanAmount = String(total_amount).replace(/,/g, '');
                        const paymentNote = `eSewa Payment Complete.\nTxn Code: ${transaction_code}\nTotal Paid: Rs. ${cleanAmount}`;

                        await supabase.rpc('confirm_website_payment', {
                            p_order_number: confirmedOrderNumber,
                            p_payment_details: paymentNote,
                            p_status: 'paid'
                        });

                        orderSummary = {
                            orderNumber: confirmedOrderNumber,
                            customerName: pending.customer_name,
                            phone: pending.phone,
                            address: pending.address,
                            city: pending.city,
                            totalAmount: Number(pending.total_amount),
                            txnCode: transaction_code,
                            paymentMethod: 'eSewa'
                        };

                        sessionStorage.setItem(cacheKey, JSON.stringify(orderSummary));
                        sessionStorage.setItem('last_esewa_success', JSON.stringify(orderSummary));
                        sessionStorage.removeItem('pending_esewa_order');
                    } else if (cachedSummary) {
                        orderSummary = JSON.parse(cachedSummary);
                    } else {
                        const cleanAmount = String(total_amount).replace(/,/g, '');
                        orderSummary = {
                            orderNumber: realOrderNumber,
                            customerName: 'Customer',
                            phone: 'N/A',
                            address: 'N/A',
                            city: '',
                            totalAmount: Number(cleanAmount) || 0,
                            txnCode: transaction_code,
                            paymentMethod: 'eSewa'
                        };
                    }
                    showNotification('eSewa Payment verified successfully!', 'success');

                } else {
                    // ─── FONEPAY FLOW ───
                    const fonepayDetails = {
                        PRN: searchParams.get('PRN'),
                        PID: searchParams.get('PID'),
                        BID: searchParams.get('BID'),
                        AMT: searchParams.get('AMT'),
                        UID: searchParams.get('UID'),
                        UTN: searchParams.get('UTN'),
                        P_STAT: searchParams.get('P_STAT'),
                        DV: searchParams.get('DV')
                    };

                    const { PRN, BID, AMT, UTN, P_STAT } = fonepayDetails;

                    if (P_STAT !== 'SUCCESS' && P_STAT !== 'COMPLETED') {
                        setErrorMsg(`Payment was not completed. Status: ${P_STAT}`);
                        setLoading(false);
                        return;
                    }

                    const { data: verification, error: verificationError } = await supabase.functions.invoke('payment-gateway', {
                        body: { action: 'verify-fonepay-response', paymentDetails: fonepayDetails }
                    });
                    const isSignatureValid = !verificationError && verification?.valid === true;

                    if (!isSignatureValid) {
                        console.error('Invalid Fonepay signature:', { received: fonepayDetails.DV });
                        setErrorMsg('Security check failed. The Fonepay signature is invalid.');
                        setLoading(false);
                        return;
                    }

                    const rawPending = sessionStorage.getItem('pending_fonepay_order');
                    const cacheKey = `last_fonepay_success_${PRN}`;
                    const cachedSummary = sessionStorage.getItem(cacheKey) || sessionStorage.getItem('last_fonepay_success');

                    if (rawPending) {
                        const pending = JSON.parse(rawPending);
                        const { data: createRes, error: createError } = await supabase.rpc('create_atomic_website_order', {
                            p_customer_name: pending.customer_name,
                            p_phone: pending.phone,
                            p_phone2: pending.phone2,
                            p_address: pending.address,
                            p_city: pending.city,
                            p_payment_method: 'Bank Transfer',
                            p_shipping_fee: pending.shipping_fee,
                            p_total_amount: pending.total_amount,
                            p_items: pending.items,
                            p_coins_used: pending.coins_used,
                            p_ad_id: pending.ad_id
                        });

                        if (createError) throw new Error('Payment verified but order could not be created: ' + createError.message);

                        const confirmedOrderNumber = createRes?.order_number || PRN;
                        const paymentNote = `Fonepay Payment Complete.\nUTN Ref: ${UTN}\nBill ID: ${BID}\nTotal Paid: Rs. ${AMT}`;

                        await supabase.rpc('confirm_website_payment', {
                            p_order_number: confirmedOrderNumber,
                            p_payment_details: paymentNote,
                            p_status: 'paid'
                        });

                        orderSummary = {
                            orderNumber: confirmedOrderNumber,
                            customerName: pending.customer_name,
                            phone: pending.phone,
                            address: pending.address,
                            city: pending.city,
                            totalAmount: Number(pending.total_amount),
                            txnCode: UTN,
                            paymentMethod: 'Bank Transfer'
                        };

                        sessionStorage.setItem(cacheKey, JSON.stringify(orderSummary));
                        sessionStorage.setItem('last_fonepay_success', JSON.stringify(orderSummary));
                        sessionStorage.removeItem('pending_fonepay_order');
                    } else if (cachedSummary) {
                        orderSummary = JSON.parse(cachedSummary);
                    } else {
                        orderSummary = {
                            orderNumber: PRN,
                            customerName: 'Customer',
                            phone: 'N/A',
                            address: 'N/A',
                            city: '',
                            totalAmount: Number(AMT) || 0,
                            txnCode: UTN,
                            paymentMethod: 'Bank Transfer'
                        };
                    }
                    showNotification('Bank Transfer Payment verified successfully!', 'success');
                }

                setOrderInfo(orderSummary);
            } catch (err) {
                console.error('Payment verification error:', err);
                setErrorMsg(err.message || 'Verification failed. Please contact support.');
            } finally {
                setLoading(false);
            }
        };

        verifyPayment();
    }, [searchParams]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
                <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#60b524', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <h3 style={{ fontWeight: '800', color: '#1e293b' }}>Verifying Payment...</h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Please do not close this window or refresh the page.</p>
            </div>
        );
    }

    if (errorMsg) {
        return (
            <div style={{ maxWidth: '500px', margin: '4rem auto', padding: '2rem', background: 'white', borderRadius: '1.5rem', border: '1px solid #e2e8f0', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                <div style={{ width: '60px', height: '60px', background: '#fef2f2', color: '#ef4444', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                    <Info size={30} />
                </div>
                <h2 style={{ fontWeight: '900', color: '#1e293b', marginBottom: '0.75rem' }}>Payment Status Unconfirmed</h2>
                <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '2rem', lineHeight: '1.6' }}>{errorMsg}</p>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button onClick={() => navigate('/checkout')} className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem' }}>Try Checkout Again</button>
                    <button onClick={() => navigate('/shop')} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>Continue Shopping</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '2.5rem', background: 'white', borderRadius: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 20px 40px rgba(0,0,0,0.04)' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ width: '70px', height: '70px', background: '#ecfdf5', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <CheckCircle size={44} />
                </div>
                <h1 style={{ fontWeight: '900', color: '#111827', fontSize: '1.8rem', margin: '0 0 0.5rem 0' }}>Payment Successful!</h1>
                <p style={{ color: '#10b981', fontWeight: '700', fontSize: '0.95rem' }}>Thank you! Your transaction via {orderInfo.paymentMethod || 'eSewa'} is complete.</p>
            </div>

            <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '1.25rem', border: '1px solid #f1f5f9', marginBottom: '2rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', fontWeight: '800', fontSize: '1rem', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>Transaction Summary</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Order Number</span>
                        <strong style={{ color: '#0f172a' }}>{orderInfo.orderNumber}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>{orderInfo.paymentMethod || 'eSewa'} Reference Code</span>
                        <strong style={{ color: '#0f172a' }}>{orderInfo.txnCode}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Amount Paid</span>
                        <strong style={{ color: '#60b524', fontSize: '1rem' }}>Rs. {orderInfo.totalAmount.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
                        <span style={{ color: '#64748b' }}>Customer Name</span>
                        <span style={{ color: '#0f172a', fontWeight: '600' }}>{orderInfo.customerName}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Contact Phone</span>
                        <span style={{ color: '#0f172a', fontWeight: '600' }}>{orderInfo.phone}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Delivery Address</span>
                        <span style={{ color: '#0f172a', fontWeight: '600', textAlign: 'right' }}>{orderInfo.address}, {orderInfo.city}</span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button 
                    onClick={() => {
                        // If user is already logged in, just go to orders.
                        // If not, pass phone so MyOrders can trigger PIN-setup modal.
                        if (customer) {
                            navigate('/my-orders');
                        } else {
                            const phone = orderInfo?.phone || '';
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
    );
};

export default PaymentSuccess;
