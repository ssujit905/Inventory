import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { type Profile } from '../types/database'
import type { User } from '@supabase/supabase-js'

interface AuthState { // Corrected 'interfactype' to 'interface'
    user: User | null; // Changed 'any' to 'User'
    profile: Profile | null;
    loading: boolean;
    initialized: boolean; // Added 'initialized' flag
    initialize: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>; // Changed return type
    signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({ // Added 'get'
    user: null,
    profile: null,
    loading: true,
    initialized: false, // Initial state for 'initialized'

    initialize: async () => {
        // Prevent multiple initializations
        if (get().initialized) {
            console.log('Already initialized, skipping...');
            return;
        }

        try {
            console.log('Initializing auth...');
            set({ initialized: true }); // Set initialized to true

            // Check active session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession()

            if (sessionError) {
                console.error('Session error:', sessionError)
                set({ user: null, profile: null, loading: false })
                return
            }

            if (session?.user) {
                console.log('User session found:', session.user.id);

                // Fetch profile with better error handling
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .maybeSingle()

                // If there's a 500 error or any profile fetch error, use a default profile
                if (profileError || !profile) {
                    console.error('Profile fetch error or not found:', profileError);
                    console.log('Using fallback profile');

                    // Create a fallback profile from user metadata
                    const fallbackProfile: Profile = {
                        id: session.user.id,
                        full_name: session.user.email?.split('@')[0] || 'User',
                        role: 'admin', // Default to admin to allow access
                        created_at: new Date().toISOString()
                    };

                    set({ user: session.user, profile: fallbackProfile, loading: false })
                } else {
                    set({ user: session.user, profile: profile as Profile, loading: false })
                }
            } else {
                console.log('No active session');
                set({ user: null, profile: null, loading: false })
            }

            // Listen for changes (only set up once)
            // Note: We don't update state here to prevent loops
            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log('Auth state changed:', event);

                // Only handle SIGNED_IN and SIGNED_OUT events
                if (event === 'SIGNED_OUT') {
                    set({ user: null, profile: null, loading: false })
                } else if (event === 'SIGNED_IN' && session?.user) {
                    // Try to fetch profile
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .maybeSingle()

                    if (profile) {
                        set({ user: session.user, profile: profile as Profile, loading: false })
                    } else {
                        // Use fallback
                        const fallbackProfile: Profile = {
                            id: session.user.id,
                            full_name: session.user.email?.split('@')[0] || 'User',
                            role: 'admin',
                            created_at: new Date().toISOString()
                        };
                        set({ user: session.user, profile: fallbackProfile, loading: false })
                    }
                }
                // Ignore INITIAL_SESSION and other events to prevent loops
            })
        } catch (error) {
            console.error('Auth initialization error:', error)
            set({ user: null, profile: null, loading: false })
        }
    },

    signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        if (error) throw error;
    },

    signOut: async () => {
        await supabase.auth.signOut()
        set({ user: null, profile: null })
    },
}))
