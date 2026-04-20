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
                p_phone: phone,
                p_pin: pin
            });

            if (error || !data || data.length === 0) {
                throw new Error('Invalid phone number or PIN');
            }

            const customerData = data[0];
            setCustomer(customerData);
            localStorage.setItem('shopy_customer', JSON.stringify(customerData));
            return { success: true };

            setCustomer(data);
            localStorage.setItem('shopy_customer', JSON.stringify(data));
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
        try {
            // Check if phone already exists
            const { data: existing, error: checkError } = await supabase
                .from('website_customers')
                .select('id')
                .eq('phone', phone)
                .maybeSingle();

            if (existing) {
                throw new Error('This phone number is already registered. Please login instead.');
            }

            // Create new customer
            const { data, error } = await supabase
                .from('website_customers')
                .insert({
                    name,
                    phone,
                    pin_hash: pin, // Store as text for now
                    address,
                    city,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;

            setCustomer(data);
            localStorage.setItem('shopy_customer', JSON.stringify(data));
            return { success: true };
        } catch (error) {
            console.error('Registration error:', error);
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
                p_phone: customer.phone,
                p_pin: parsed.pin_hash || parsed.pin // Depends on how it was saved
            });

            if (!error && data && data.length > 0) {
                setCustomer(data[0]);
                localStorage.setItem('shopy_customer', JSON.stringify(data[0]));
            }
        } catch (err) {
            console.error('Failed to refresh customer:', err);
        }
    };

    const logout = () => {
        setCustomer(null);
        localStorage.removeItem('shopy_customer');
    };

    return (
        <CustomerContext.Provider value={{ customer, login, logout, register, updateProfile, loading, refreshCustomer }}>
            {children}
        </CustomerContext.Provider>
    );
};
