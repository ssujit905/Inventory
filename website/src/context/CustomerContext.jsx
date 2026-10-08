/* eslint-disable react-refresh/only-export-components -- colocated provider + hook is the project convention */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase, supabaseWithTimeout } from '../lib/supabase';
import { safeFetch } from '../lib/safeFetch';

const CustomerContext = createContext();

export const useCustomer = () => useContext(CustomerContext);

// SECURITY: the PIN RPCs now throttle server-side (5 fails / 15 min per
// phone, 30 / 15 min per IP). Locked responses carry an ACCOUNT_LOCKED error;
// surface it as a friendly message instead of "invalid PIN".
const LOCKOUT_RE = /ACCOUNT_LOCKED|too many failed attempts/i;
const isAuthLockedOut = (msg) => LOCKOUT_RE.test(String(msg || ''));
const friendlyAuthError = (serverError, fallback) =>
    isAuthLockedOut(serverError)
        ? 'Too many failed attempts. Please try again in 15 minutes.'
        : (serverError || fallback);

export const CustomerProvider = ({ children }) => {
    const [customer, setCustomer] = useState(() => {
        try {
            const saved = sessionStorage.getItem('shopy_customer');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.error('Failed to parse customer from sessionStorage, resetting:', e);
            try { sessionStorage.removeItem('shopy_customer'); } catch { /* storage unavailable — session simply won't persist */ }
            return null;
        }
    });
    const [loading, setLoading] = useState(false);

    const login = async (phone, pin) => {
        setLoading(true);
        try {
            // Fail fast on slow connections. No auto-retry: the PIN RPCs are
            // throttled server-side and a blind retry burns attempts.
            const { data, error } = await supabaseWithTimeout(supabase.rpc('customer_login', {
                p_phone: String(phone).trim(),
                p_pin: String(pin).trim()
            }));

            if (error || !data?.success) {
                console.error('Login failure:', error || 'No data');
                throw new Error(friendlyAuthError(data?.error, 'Invalid phone number or PIN'));
            }

            const customerData = data.customer;
            setCustomer(customerData);
            sessionStorage.setItem('shopy_customer', JSON.stringify(customerData));
            sessionStorage.setItem('shopy_customer_session', data.session_token);
            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const register = async (name, phone, pin) => {
        setLoading(true);
        // Standardize phone to 10 digits
        const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
        
        try {
            // No auto-retry (same throttling rationale as login).
            const { data, error } = await supabaseWithTimeout(supabase.rpc('customer_register', { p_name: name, p_phone: cleanPhone, p_pin: String(pin), p_address: null, p_city: null }));
            if (error || !data?.success) throw new Error(friendlyAuthError(data?.error || error?.message, 'Registration failed'));
            setCustomer(data.customer);
            sessionStorage.setItem('shopy_customer', JSON.stringify(data.customer));
            sessionStorage.setItem('shopy_customer_session', data.session_token);
            return { success: true };
        } catch (error) {
            console.error('Registration error detail:', error);
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const updateProfile = async (updates) => {
        setLoading(true);
        try {
            const { data, error } = await supabaseWithTimeout(supabase.rpc('customer_update_profile', {
                p_token: sessionStorage.getItem('shopy_customer_session'),
                p_name: updates.name || customer?.name || '',
                p_address: updates.address,
                p_city: updates.city
            }));

            if (error || !data) throw error || new Error('Update failed');

            // Refresh the local state
            await refreshCustomer();
            return { success: true };
        } catch (error) {
            console.error('Update profile error:', error);
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const logout = useCallback(() => {
        setCustomer(null);
        try {
            sessionStorage.removeItem('shopy_customer');
            sessionStorage.removeItem('shopy_customer_session');
            localStorage.removeItem('shopy_customer');
        } catch { /* storage unavailable — session simply won't clear */ }
    }, []);

    const refreshCustomer = useCallback(async () => {
        const token = sessionStorage.getItem('shopy_customer_session');
        if (!token) return;
        try {
            // Read-only: safe to retry with backoff on flaky connections.
            const { data, error } = await safeFetch(() =>
                supabase.rpc('customer_session_profile', { p_token: token })
            );
            if (!error && data?.success && data.customer) {
                setCustomer(data.customer);
                try {
                    sessionStorage.setItem('shopy_customer', JSON.stringify(data.customer));
                } catch { /* storage unavailable — profile simply won't cache */ }
            } else if (data && !data.success) {
                console.warn('Customer session expired or invalid:', data.error);
                logout();
            } else if (error) {
                console.error('Refresh customer error:', error);
            }
        } catch (err) {
            console.error('Failed to refresh customer:', err);
        }
    }, [logout]);

    /**
     * First-time buyer PIN setup.
     * Called after eSewa checkout when the user clicks "View My Orders".
     * Creates a new account OR sets the PIN on an existing phone-matched account.
     */
    const setupPin = async (phone, pin, name = null, address = null, city = null) => {
        setLoading(true);
        try {
            // No auto-retry (same throttling rationale as login).
            const { data, error } = await supabaseWithTimeout(supabase.rpc('customer_setup_pin', {
                p_phone: String(phone).trim(),
                p_pin: String(pin).trim(),
                p_name: name || null,
                p_address: address || null,
                p_city: city || null
            }));

            if (error || !data?.success) {
                throw new Error(friendlyAuthError(data?.error || error?.message, 'Failed to set up account'));
            }

            setCustomer(data.customer);
            sessionStorage.setItem('shopy_customer', JSON.stringify(data.customer));
            sessionStorage.setItem('shopy_customer_session', data.session_token);
            return { success: true };
        } catch (err) {
            console.error('setupPin error:', err);
            return { success: false, error: err.message };
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!customer?.phone) return;

        // Pick up balance changes that happened while this account was closed.
        refreshCustomer();

        const channel = supabase
            .channel(`customer_updates_${customer.phone}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'website_customers',
                    filter: `phone=eq.${customer.phone}`
                },
                (payload) => {
                    // Update state directly for instant feedback (coins, name, etc)
                    if (payload.new) {
                        setCustomer(previous => {
                            const nextCustomer = { ...previous, ...payload.new };
                            sessionStorage.setItem('shopy_customer', JSON.stringify(nextCustomer));
                            return nextCustomer;
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [customer?.phone, refreshCustomer]);

    return (
        <CustomerContext.Provider value={{ customer, login, logout, register, updateProfile, loading, refreshCustomer, setupPin }}>
            {children}
        </CustomerContext.Provider>
    );
};
