import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const CustomerContext = createContext();

export const useCustomer = () => useContext(CustomerContext);

export const CustomerProvider = ({ children }) => {
    const [customer, setCustomer] = useState(() => {
        const saved = localStorage.getItem('shopy_customer');
        return saved ? JSON.parse(saved) : null;
    });
    const [loading, setLoading] = useState(false);

    const login = async (phone, pin) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_customer_profile', {
                p_phone: String(phone).trim(),
                p_pin: String(pin).trim()
            });

            if (error || !data || data.length === 0) {
                console.error('Login failure:', error || 'No data');
                throw new Error('Invalid phone number or PIN');
            }

            const customerData = data[0];
            setCustomer(customerData);
            localStorage.setItem('shopy_customer', JSON.stringify(customerData));
            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const register = async (name, phone, pin, address, city) => {
        setLoading(true);
        // Standardize phone to 10 digits
        const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
        
        try {
            // Check if phone already exists (using ilike for flexibility)
            const { data: existing } = await supabase
                .from('website_customers')
                .select('phone')
                .ilike('phone', `%${cleanPhone}`)
                .maybeSingle();

            if (existing) {
                throw new Error('This phone number is already registered. Please login instead.');
            }

            // Create new customer
            const { data, error } = await supabase
                .from('website_customers')
                .insert({
                    name,
                    phone: cleanPhone,
                    pin_hash: String(pin),
                    address,
                    city,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') throw new Error('This phone number is already registered.');
                throw error;
            }

            setCustomer(data);
            localStorage.setItem('shopy_customer', JSON.stringify(data));
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
            const { data, error } = await supabase.rpc('update_customer_profile', {
                p_phone: customer.phone,
                p_pin: customer.pin_hash || customer.pin,
                p_name: updates.name,
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
            const saved = localStorage.getItem('shopy_customer');
            if (!saved) return;
            const parsed = JSON.parse(saved);
            
            const { data, error } = await supabase.rpc('get_customer_profile', {
                p_phone: String(customer.phone).trim(),
                p_pin: String(parsed.pin_hash || parsed.pin).trim()
            });

            if (!error && data && data.length > 0) {
                setCustomer(data[0]);
                localStorage.setItem('shopy_customer', JSON.stringify(data[0]));
            } else if (error) {
                console.error('Refresh customer error:', error);
            }
        } catch (err) {
            console.error('Failed to refresh customer:', err);
        }
    };

    const logout = () => {
        setCustomer(null);
        localStorage.removeItem('shopy_customer');
    };

    useEffect(() => {
        if (!customer?.phone) return;

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
                        setCustomer(prev => ({ ...prev, ...payload.new }));
                        localStorage.setItem('shopy_customer', JSON.stringify({ ...customer, ...payload.new }));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [customer?.phone]);

    return (
        <CustomerContext.Provider value={{ customer, login, logout, register, updateProfile, loading, refreshCustomer }}>
            {children}
        </CustomerContext.Provider>
    );
};
