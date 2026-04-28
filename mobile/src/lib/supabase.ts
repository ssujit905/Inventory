import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase Environment Variables. Check .env file.')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
    }
})

// For debugging in Electron console
if (typeof window !== 'undefined') {
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
    const timeoutPromise = new Promise<{ data: null; error: any }>((_, reject) => {
        setTimeout(() => reject({ 
            data: null, 
            error: { message: 'NETWORK_TIMEOUT', status: 408 } 
        }), timeoutMs);
    });

    try {
        return await Promise.race([request, timeoutPromise]);
    } catch (err: any) {
        return { data: null, error: err.error || err };
    }
}
