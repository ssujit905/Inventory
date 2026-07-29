import { AlertTriangle, ArrowLeft, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PaymentFailure = () => {
    const navigate = useNavigate();

    return (
        <div style={{ maxWidth: '500px', margin: '4rem auto', padding: '2.5rem', background: 'white', borderRadius: '2rem', border: '1px solid #e2e8f0', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.04)' }}>
            <div style={{ width: '70px', height: '70px', background: '#fff1f2', color: '#f43f5e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                <AlertTriangle size={40} />
            </div>
            
            <h1 style={{ fontWeight: '900', color: '#111827', fontSize: '1.75rem', marginBottom: '0.5rem' }}>Payment Cancelled / Failed</h1>
            <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '2rem', lineHeight: '1.6' }}>
                Your online payment session via eSewa was not completed successfully. This could be due to a cancellation or a connection timeout. No charges have been made.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button 
                    onClick={() => navigate('/checkout')} 
                    className="btn btn-primary" 
                    style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '700' }}
                >
                    <ArrowLeft size={18} /> Return to Checkout
                </button>
                
                <button 
                    onClick={() => navigate('/shop')} 
                    className="btn btn-secondary" 
                    style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: '700' }}
                >
                    <ShoppingBag size={18} /> Browse Products
                </button>
            </div>
        </div>
    );
};

export default PaymentFailure;
