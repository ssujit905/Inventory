import { useEffect, useState } from 'react';
import { 
    CheckCircle2, 
    AlertCircle, 
    Info, 
    X, 
    AlertTriangle 
} from 'lucide-react';

const Notification = ({ message, type, onClose }) => {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        // Auto-close animation start
    }, []);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(onClose, 300);
    };

    const getConfig = () => {
        switch (type) {
            case 'success':
                return {
                    icon: <CheckCircle2 size={20} color="#059669" />,
                    bg: '#ecfdf5',
                    border: '#d1fae5',
                    text: '#065f46',
                    accent: '#10b981'
                };
            case 'error':
                return {
                    icon: <AlertCircle size={20} color="#dc2626" />,
                    bg: '#fef2f2',
                    border: '#fee2e2',
                    text: '#991b1b',
                    accent: '#ef4444'
                };
            case 'warning':
                return {
                    icon: <AlertTriangle size={20} color="#d97706" />,
                    bg: '#fffbeb',
                    border: '#fef3c7',
                    text: '#92400e',
                    accent: '#f59e0b'
                };
            default:
                return {
                    icon: <Info size={20} color="#2563eb" />,
                    bg: '#eff6ff',
                    border: '#dbeafe',
                    text: '#1e40af',
                    accent: '#3b82f6'
                };
        }
    };

    const config = getConfig();

    return (
        <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '1rem 1.25rem',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
            border: `1px solid ${config.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            pointerEvents: 'auto',
            animation: isExiting ? 'notification-out 0.3s forwards' : 'notification-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            position: 'relative',
            overflow: 'hidden',
            width: '100%'
        }}>
            {/* Accent Bar */}
            <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '4px',
                backgroundColor: config.accent
            }} />

            <div style={{
                background: config.bg,
                padding: '8px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {config.icon}
            </div>

            <div style={{ flex: 1 }}>
                <p style={{
                    margin: 0,
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    color: config.text,
                    lineHeight: '1.4'
                }}>
                    {message}
                </p>
            </div>

            <button 
                onClick={handleClose}
                style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    display: 'flex',
                    minHeight: 'auto'
                }}
            >
                <X size={18} />
            </button>

            <style>{`
                @keyframes notification-in {
                    from { transform: translateY(-20px) scale(0.95); opacity: 0; }
                    to { transform: translateY(0) scale(1); opacity: 1; }
                }
                @keyframes notification-out {
                    from { transform: scale(1); opacity: 1; }
                    to { transform: scale(0.95); opacity: 0; }
                }
            `}</style>
        </div>
    );
};

export default Notification;
