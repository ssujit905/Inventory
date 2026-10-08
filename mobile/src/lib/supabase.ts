import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase Environment Variables. Check .env file.')
}

// Hard cap on EVERY request (including auth token refresh). Prevents the
// "infinite spinner" bug where a request in flight during sleep/app-switch
// hangs forever and even deadlocks the Supabase auth lock.
// 25s matches the desktop + website clients.
const REQUEST_TIMEOUT_MS = 25000

function getTimeoutSignal(ms: number): { signal: AbortSignal; cleanup?: () => void } {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        return { signal: AbortSignal.timeout(ms) }
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
        try {
            controller.abort(new DOMException('TimeoutError', 'TimeoutError'))
        } catch {
            controller.abort()
        }
    }, ms)
    return { signal: controller.signal, cleanup: () => clearTimeout(timer) }
}

function combineSignals(a?: AbortSignal | null, b?: AbortSignal | null): { signal: AbortSignal; cleanup?: () => void } {
    if (!a) return { signal: b as AbortSignal }
    if (!b) return { signal: a }
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        try {
            return { signal: AbortSignal.any([a, b]) }
        } catch {
            // fall through to manual combine below
        }
    }
    const controller = new AbortController()
    const onAbort = () => {
        try {
            controller.abort(a.aborted ? a.reason : b.reason)
        } catch {
            controller.abort()
        }
    }
    if (a.aborted || b.aborted) {
        onAbort()
        return { signal: controller.signal }
    }
    a.addEventListener('abort', onAbort, { once: true })
    b.addEventListener('abort', onAbort, { once: true })
    return {
        signal: controller.signal,
        cleanup: () => {
            a.removeEventListener('abort', onAbort)
            b.removeEventListener('abort', onAbort)
        },
    }
}

const fetchWithTimeout: typeof fetch = (input, init) => {
    const timeout = getTimeoutSignal(REQUEST_TIMEOUT_MS)
    const combined = combineSignals(init?.signal as AbortSignal | null | undefined, timeout.signal)
    const cleanup = () => {
        timeout.cleanup?.()
        combined.cleanup?.()
    }
    return fetch(input, { ...init, signal: combined.signal }).then(
        (res) => {
            cleanup()
            return res
        },
        (err) => {
            cleanup()
            throw err
        }
    )
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    global: {
        fetch: fetchWithTimeout
    },
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
    }
})

// For debugging in WebView console (development only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
    (window as any).supabase = supabase;
}

/**
 * 🎯 RESOLVED TIMEOUT HELPER
 * Returns { data, error } instead of throwing, to prevent Uncaught (in promise) AbortErrors.
 */
export async function supabaseWithTimeout<T = any>(
    request: Promise<{ data: T | null; error: any }> | any,
    timeoutMs: number = 30000
): Promise<{ data: T | null; error: any }> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<{ data: null; error: any }>((_, reject) => {
        timer = setTimeout(() => reject({
            data: null,
            error: { message: 'NETWORK_TIMEOUT', status: 408 }
        }), timeoutMs);
    });

    try {
        return await Promise.race([request, timeoutPromise]);
    } catch (err: any) {
        return { data: null, error: err.error || err };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Re-establishes a healthy Supabase session + network connection after the app
 * has been in the background. When returning from another app/tab the access
 * token is usually expired AND the keep-alive connection is stale, so the
 * first request triggers a token refresh over a dead connection and hangs.
 * Calling this on resume (and before submitting) forces that refresh to happen
 * right away and, if the connection is stale, opens a fresh one.
 */
export async function warmUpSupabase(timeoutMs = 8000) {
    const t0 = Date.now();
    const sessionRes = await supabaseWithTimeout(supabase.auth.getSession(), timeoutMs);
    const sessionMs = Date.now() - t0;
    const expired = sessionRes.data?.session
        ? Date.now() >= sessionRes.data.session.expires_at * 1000
        : null;
    console.log('[warmup] getSession', sessionMs + 'ms',
        expired === null ? '(no session)' : expired ? '(token EXPIRED)' : '(token valid)',
        sessionRes.error?.message ? 'error: ' + sessionRes.error.message : '');

    const ping = async () => {
        const t1 = Date.now();
        const res = await supabaseWithTimeout(
            supabase.from('products').select('id').limit(1),
            timeoutMs
        );
        const ms = Date.now() - t1;
        console.log('[warmup] ping', ms + 'ms', res.error?.message ? 'error: ' + res.error.message : 'ok');
        return res.error;
    };

    let pingError = await ping();
    if (pingError) {
        // Stale connection — give the socket pool a moment to reset, then retry.
        await new Promise(r => setTimeout(r, 1200));
        pingError = await ping();
    }
    return { sessionMs, expired, pingRecovered: !!pingError };
}
