import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Offline indicator for the mobile app. Shop/staff phones frequently lose
 * signal — without this, failed requests look like app bugs. Shows a banner
 * while offline and a brief "restored" confirmation on reconnect (the pages'
 * own realtime focus handlers resync data automatically).
 */
export default function OfflineBanner() {
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );
    const [showRestored, setShowRestored] = useState(false);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;

        const handleOffline = () => {
            setIsOnline(false);
            setShowRestored(false);
        };
        const handleOnline = () => {
            setIsOnline(true);
            setShowRestored(true);
            timer = setTimeout(() => setShowRestored(false), 3500);
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
            if (timer) clearTimeout(timer);
        };
    }, []);

    if (isOnline && !showRestored) return null;

    return (
        <div
            aria-live="polite"
            className={`sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white ${
                isOnline ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
        >
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>
                {isOnline
                    ? 'Connection restored — syncing…'
                    : 'No connection — changes will fail until signal returns'}
            </span>
        </div>
    );
}
