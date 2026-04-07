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

        const handleFocus = () => {
            // Force reset locks in case a fetch Promise hung infinitely during computer sleep
            inFlightRef.current = false;
            queuedRef.current = false;
            
            // Force an immediate data re-validation when the user returns to the app
            void runRefresh();
        };
        window.addEventListener('focus', handleFocus);

        // Native Electron IPC fallback for strict focus detection
        const ipcWindow = window as any;
        const _handleIpcFocus = () => handleFocus();
        if (ipcWindow.ipcRenderer) {
            ipcWindow.ipcRenderer.on('window-focus', _handleIpcFocus);
        }

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
            if (ipcWindow.ipcRenderer) {
                ipcWindow.ipcRenderer.off('window-focus', _handleIpcFocus);
            }
            supabase.removeChannel(channel);
        };
    }, [channelName, tablesKey, enabled, debounceMs, pollMs]);
}
