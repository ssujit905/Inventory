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
            role: isForceAdmin || (user.user_metadata as any)?.role === 'admin' ? 'admin' : 'staff',
            permissions: isForceAdmin || (user.user_metadata as any)?.role === 'admin' ? 'read_write' : 'read_only',
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

            if (!currentProfile.permissions) {
                currentProfile.permissions = currentProfile.role === 'admin' ? 'read_write' : 'read_only';
            }

            if (isForceAdmin && (currentProfile.role !== 'admin' || currentProfile.permissions !== 'read_write')) {
                await supabase
                    .from('profiles')
                    .update({ role: 'admin', permissions: 'read_write' })
                    .eq('id', user.id);
                set({ profile: { ...currentProfile, role: 'admin', permissions: 'read_write' } });
                return;
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
                    .select('role')
                    .eq('id', data.user.id)
                    .single();

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
