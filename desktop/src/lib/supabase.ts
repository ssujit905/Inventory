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
 * Helper to ensure a Supabase request doesn't hang infinitely (e.g. after PC sleep)
 * Default timeout is 15 seconds.
 */
export async function supabaseWithTimeout<T = any>(
    request: Promise<T> | any,
    timeoutMs: number = 15000
): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out. Please check your internet connection and try again.')), timeoutMs);
    });

    return Promise.race([request, timeoutPromise]) as Promise<T>;
}
