import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const CustomerContext = createContext();

export const useCustomer = () => useContext(CustomerContext);

export const CustomerProvider = ({ children }) => {
    const [customer, setCustomer] = useState(() => {
        const saved = sessionStorage.getItem('shopy_customer');
        return saved ? JSON.parse(saved) : null;
    });
    const [loading, setLoading] = useState(false);

    const login = async (phone, pin) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('customer_login', {
                p_phone: String(phone).trim(),
                p_pin: String(pin).trim()
            });

            if (error || !data?.success) {
                console.error('Login failure:', error || 'No data');
                throw new Error('Invalid phone number or PIN');
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
            const { data, error } = await supabase.rpc('customer_register', { p_name: name, p_phone: cleanPhone, p_pin: String(pin), p_address: null, p_city: null });
            if (error || !data?.success) throw error || new Error(data?.error || 'Registration failed');
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
            const { data, error } = await supabase.rpc('customer_update_profile', {
                p_token: sessionStorage.getItem('shopy_customer_session'),
                p_name: updates.name || customer?.name || '',
                p_address: updates.address,
                p_city: updates.city
            });

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

    const refreshCustomer = async () => {
        if (!customer?.phone) return;
        try {
            // Use the same secure gateway or a similar one. 
            // Since we already HAVE the info in localStorage, we can use a simpler check or just re-login silently
            const { data, error } = await supabase.rpc('customer_session_profile', { p_token: sessionStorage.getItem('shopy_customer_session') });
            if (!error && data?.success) {
                setCustomer(data.customer);
                sessionStorage.setItem('shopy_customer', JSON.stringify(data.customer));
            } else if (error) {
                console.error('Refresh customer error:', error);
            }
        } catch (err) {
            console.error('Failed to refresh customer:', err);
        }
    };

    const logout = () => {
        setCustomer(null);
        sessionStorage.removeItem('shopy_customer');
        sessionStorage.removeItem('shopy_customer_session');
        localStorage.removeItem('shopy_customer');
    };

    /**
     * First-time buyer PIN setup.
     * Called after eSewa checkout when the user clicks "View My Orders".
     * Creates a new account OR sets the PIN on an existing phone-matched account.
     */
    const setupPin = async (phone, pin, name = null, address = null, city = null) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('customer_setup_pin', {
                p_phone: String(phone).trim(),
                p_pin: String(pin).trim(),
                p_name: name || null,
                p_address: address || null,
                p_city: city || null
            });

            if (error || !data?.success) {
                throw new Error(data?.error || error?.message || 'Failed to set up account');
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
                    console.log('Real-time customer update:', payload);
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
    }, [customer?.phone]);

    return (
        <CustomerContext.Provider value={{ customer, login, logout, register, updateProfile, loading, refreshCustomer, setupPin }}>
            {children}
        </CustomerContext.Provider>
    );
};
