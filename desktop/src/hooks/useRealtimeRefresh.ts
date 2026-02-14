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

        const handleVisible = () => {
            if (document.visibilityState === 'visible') {
                void runRefresh();
            }
        };
        window.addEventListener('focus', handleVisible);
        document.addEventListener('visibilitychange', handleVisible);

        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            clearInterval(interval);
            window.removeEventListener('focus', handleVisible);
            document.removeEventListener('visibilitychange', handleVisible);
            supabase.removeChannel(channel);
        };
    }, [channelName, tablesKey, enabled, debounceMs, pollMs]);
}
