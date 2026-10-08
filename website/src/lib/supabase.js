import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Global timeout cap for every network request (prevents hanging requests on slow/flaky connections)
const REQUEST_TIMEOUT_MS = 25000;

function getTimeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return { signal: AbortSignal.timeout(ms), cleanup: undefined };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
        try {
            controller.abort(new DOMException('TimeoutError', 'TimeoutError'));
        } catch {
            controller.abort();
        }
    }, ms);
    return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

function combineSignals(signalA, signalB) {
    if (!signalA) return { signal: signalB, cleanup: undefined };
    if (!signalB) return { signal: signalA, cleanup: undefined };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        try {
            return { signal: AbortSignal.any([signalA, signalB]), cleanup: undefined };
        } catch {
            // fall through to manual combine below
        }
    }
    const controller = new AbortController();
    const onAbort = () => {
        try {
            controller.abort(signalA.aborted ? signalA.reason : signalB.reason);
        } catch {
            controller.abort();
        }
    };
    if (signalA.aborted || signalB.aborted) {
        onAbort();
        return { signal: controller.signal, cleanup: undefined };
    }
    signalA.addEventListener('abort', onAbort, { once: true });
    signalB.addEventListener('abort', onAbort, { once: true });
    return {
        signal: controller.signal,
        cleanup: () => {
            signalA.removeEventListener('abort', onAbort);
            signalB.removeEventListener('abort', onAbort);
        }
    };
}

const fetchWithTimeout = (input, init) => {
    const timeout = getTimeoutSignal(REQUEST_TIMEOUT_MS);
    const combined = combineSignals(init?.signal, timeout.signal);
    const cleanup = () => {
        timeout.cleanup?.();
        combined.cleanup?.();
    };
    return fetch(input, { ...init, signal: combined.signal }).then(
        (res) => {
            cleanup();
            return res;
        },
        (err) => {
            cleanup();
            throw err;
        }
    );
};

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    global: {
        fetch: fetchWithTimeout
    },
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
    }
});

/**
 * Operation-level timeout helper that returns { data, error } cleanly without unhandled rejection.
 */
export async function supabaseWithTimeout(request, timeoutMs = 20000) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject({
                data: null,
                error: { message: 'NETWORK_TIMEOUT', status: 408 }
            });
        }, timeoutMs);
    });

    try {
        return await Promise.race([request, timeoutPromise]);
    } catch (err) {
        return { data: null, error: err?.error || err };
    } finally {
        clearTimeout(timer);
    }
}
