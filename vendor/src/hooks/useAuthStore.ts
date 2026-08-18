import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { type Profile } from '../types/database'
import type { User } from '@supabase/supabase-js'

interface AuthState {
    user: User | null;
    profile: Profile | null;
    loading: boolean;
    initialized: boolean;
    initialize: () => Promise<void>;
    refreshProfile: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;
let signingIn = false;

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    profile: null,
    loading: true,
    initialized: false,

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
            role: isForceAdmin ? 'admin' : ((user.user_metadata as any)?.role || 'vendor'),
            permissions: isForceAdmin ? 'read_write' : ((user.user_metadata as any)?.permissions || 'read_write'),
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

            // Block main-store staff. Vendor-created staff (role staff with a
            // vendor_id) belong to a vendor account and are allowed in.
            if (currentProfile.role === 'staff' && !currentProfile.vendor_id) {
                await supabase.auth.signOut();
                set({ user: null, profile: null });
                return;
            }

            if (!currentProfile.permissions) {
                currentProfile.permissions = 'read_write';
            }

            set({ profile: currentProfile });
        } catch {
            set({ profile: buildFallbackProfile() });
        }
    },

    initialize: async () => {
        if (get().initialized && !get().loading) return;

        try {
            set({ initialized: true, loading: true });

            setTimeout(() => {
                if (get().loading) set({ loading: false });
            }, 10000);

            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) throw sessionError;

            if (session?.user) {
                set({ user: session.user });
                await get().refreshProfile();
            } else {
                set({ user: null, profile: null });
            }

            set({ loading: false });

            if (!authSubscription) {
                const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
                    if (signingIn && event === 'SIGNED_IN') return;

                    if (event === 'SIGNED_OUT') {
                        set({ user: null, profile: null, loading: false });
                    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                        if (session?.user) {
                            set({ user: session.user });
                            await get().refreshProfile();
                            set({ loading: false });
                        }
                    }
                });
                authSubscription = listener.subscription;
            }
        } catch (error) {
            console.error('Core Auth Error:', error);
            set({ user: null, profile: null, loading: false });
        }
    },

    signIn: async (email, password) => {
        signingIn = true;
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            if (data?.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role, vendor_id')
                    .eq('id', data.user.id)
                    .single();

                // Block main-store staff. Vendor-created staff (vendor_id set)
                // belong to a vendor account and can sign in here.
                if (!profile || (profile.role === 'staff' && !profile.vendor_id)) {
                    await supabase.auth.signOut();
                    throw new Error('This is a Main Store Staff account. Please use the Main Staff Portal to login.');
                }

                set({ user: data.user });
                await get().refreshProfile();
                set({ loading: false });
            }
        } finally {
            signingIn = false;
        }
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
