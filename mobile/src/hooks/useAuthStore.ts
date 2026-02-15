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
    refreshProfile: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>; // Changed return type
    signOut: () => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({ // Added 'get'
    user: null,
    profile: null,
    loading: true,
    initialized: false, // Initial state for 'initialized'

    refreshProfile: async () => {
        const user = get().user;
        if (!user) {
            set({ profile: null });
            return;
        }

        const adminEmails = ['ssujit905@gmail.com'];
        const isForceAdmin = user.email ? adminEmails.includes(user.email) : false;

        const buildFallbackProfile = (): Profile => ({
            id: user.id,
            full_name: (user.user_metadata as any)?.full_name || user.email?.split('@')[0] || 'User',
            role: isForceAdmin || (user.user_metadata as any)?.role === 'admin' ? 'admin' : 'staff',
            created_at: new Date().toISOString()
        });

        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .maybeSingle();

            if (profileError || !profile) {
                set({ profile: buildFallbackProfile() });
                return;
            }

            const currentProfile = profile as Profile;

            if (isForceAdmin && currentProfile.role !== 'admin') {
                await supabase
                    .from('profiles')
                    .update({ role: 'admin' })
                    .eq('id', user.id);
                set({ profile: { ...currentProfile, role: 'admin' } });
                return;
            }

            set({ profile: currentProfile });
        } catch {
            set({ profile: buildFallbackProfile() });
        }
    },

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

                set({ user: session.user });
                await get().refreshProfile();
                set({ loading: false });
            } else {
                console.log('No active session');
                set({ user: null, profile: null, loading: false })
            }

            // Keep exactly one auth listener to avoid duplicate refresh loops in dev/HMR.
            if (authSubscription) {
                authSubscription.unsubscribe();
                authSubscription = null;
            }

            const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
                console.log('Auth state changed:', event);

                // Only handle SIGNED_IN and SIGNED_OUT events
                if (event === 'SIGNED_OUT') {
                    set({ user: null, profile: null, loading: false })
                } else if (event === 'SIGNED_IN' && session?.user) {
                    set({ user: session.user });
                    await get().refreshProfile();
                    set({ loading: false });
                }
                // Ignore INITIAL_SESSION and other events to prevent loops
            })
            authSubscription = listener.subscription;
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
        try {
            set({ user: null, profile: null });
            await supabase.auth.signOut();
        } catch (error) {
            console.error('Sign out error:', error);
        }
    },
}))
