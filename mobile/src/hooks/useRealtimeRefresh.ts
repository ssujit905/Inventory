import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

type UseRealtimeRefreshOptions = {
    channelName: string;
    tables: string[];
    enabled?: boolean;
    debounceMs?: number;
    pollMs?: number;
};

export function useRealtimeRefresh(
    refreshFn: () => Promise<void> | void,
    {
        channelName,
        tables,
        enabled = true,
        debounceMs = 250,
        pollMs = 15000
    }: UseRealtimeRefreshOptions
) {
    const refreshRef = useRef(refreshFn);
    const inFlightRef = useRef(false);
    const queuedRef = useRef(false);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const tablesKey = tables.join('|');

    useEffect(() => {
        refreshRef.current = refreshFn;
    }, [refreshFn]);

    useEffect(() => {
        if (!enabled || tables.length === 0) return;

        const runRefresh = async () => {
            if (inFlightRef.current) {
                queuedRef.current = true;
                return;
            }

            inFlightRef.current = true;
            try {
                await refreshRef.current();
            } finally {
                inFlightRef.current = false;
                if (queuedRef.current) {
                    queuedRef.current = false;
                    void runRefresh();
                }
            }
        };

        const queueDebouncedRefresh = () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
                void runRefresh();
            }, debounceMs);
        };

        const channel = supabase.channel(channelName);
        tables.forEach((table) => {
            channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
                queueDebouncedRefresh();
            });
        });
        channel.subscribe();

        const interval = setInterval(() => {
            void runRefresh();
        }, pollMs);

        const mounted = { current: true };

        const handleFocus = async () => {
            // Force reset locks in case a fetch Promise hung infinitely during computer sleep
            inFlightRef.current = false;
            queuedRef.current = false;
            
            try {
                // Re-verify session to wake up the Supabase client
                await supabase.auth.getSession();
                // Force an immediate data re-validation when the user returns to the app
                if (mounted.current) void runRefresh();
            } catch (e) {
                // Silent catch for expected aborts
            }
        };
        window.addEventListener('focus', handleFocus);
        window.addEventListener('visibilitychange', () => {
             if (document.visibilityState === 'visible') handleFocus();
        });

        // Native Electron IPC fallback for strict focus detection
        const ipcWindow = window as any;
        const _handleIpcFocus = () => {
             if (mounted.current) handleFocus();
        };
        if (ipcWindow.ipcRenderer) {
            ipcWindow.ipcRenderer.on('window-focus', _handleIpcFocus);
        }

        return () => {
            mounted.current = false;
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
            if (ipcWindow.ipcRenderer) {
                ipcWindow.ipcRenderer.off('window-focus', _handleIpcFocus);
            }
            setTimeout(() => {
                // Only attempt removal if the channel is actually active to avoid browser-level WebSocket errors
                // during fast-refresh cycles.
                if (channel && (channel as any).state !== 'joining') {
                    supabase.removeChannel(channel).catch(() => {});
                }
            }, 100);
        };
    }, [channelName, tablesKey, enabled, debounceMs, pollMs]);
}
