import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { useSettings } from '../context/SettingsContext';

/**
 * Offline & Network Resilience Indicator (Docx Term 12: Offline Support)
 * Alerts shopper when network drops while gracefully showing cached data,
 * and automatically triggers background revalidation when connectivity restores.
 */
export default function NetworkStatus() {
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );
    const [showRestored, setShowRestored] = useState(false);
    const { refetch } = useProducts() || {};
    const { refetchSettings } = useSettings() || {};

    useEffect(() => {
        let timer = null;

        const handleOffline = () => {
            setIsOnline(false);
            setShowRestored(false);
        };

        const handleOnline = () => {
            setIsOnline(true);
            setShowRestored(true);

            // Revalidate cached stores and products in background
            if (refetch) refetch(true);
            if (refetchSettings) refetchSettings(true);

            timer = setTimeout(() => {
                setShowRestored(false);
            }, 3500);
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);

        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
            if (timer) clearTimeout(timer);
        };
    }, [refetch, refetchSettings]);

    if (isOnline && !showRestored) {
        return null;
    }

    return (
        <aside
            aria-live="polite"
            style={{
                position: 'fixed',
                top: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '100px',
                fontSize: '0.825rem',
                fontWeight: '700',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.3s ease',
                backgroundColor: !isOnline ? '#ef4444' : '#10b981',
                color: 'white',
                maxWidth: '90vw'
            }}
        >
            {!isOnline ? (
                <>
                    <WifiOff size={15} />
                    <span>Offline mode — viewing cached catalog</span>
                </>
            ) : (
                <>
                    <Wifi size={15} />
                    <span>Connection restored — live sync active</span>
                </>
            )}
        </aside>
    );
}
