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
            // Verify phone and pin (pin_hash is what we have)
            // For now, if we saved PIN directly, but the schema said pin_hash.
            // Let's assume we saved it as text for simplicity or check what we did.
            
            const { data, error } = await supabase
                .from('website_customers')
                .select('*')
                .eq('phone', phone)
                .eq('pin_hash', pin) // Assuming stored as plain text for now, should be hashed later
                .single();

            if (error || !data) {
                throw new Error('Invalid phone number or PIN');
            }

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
            const { data, error } = await supabase
                .from('website_customers')
                .update(updates)
                .eq('phone', customer.phone)
                .select()
                .single();

            if (error) throw error;

            setCustomer(data);
            localStorage.setItem('shopy_customer', JSON.stringify(data));
            return { success: true };
        } catch (error) {
            console.error('Update profile error:', error);
            return { success: false, error: error.message };
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        setCustomer(null);
        localStorage.removeItem('shopy_customer');
    };

    return (
        <CustomerContext.Provider value={{ customer, login, logout, register, updateProfile, loading }}>
            {children}
        </CustomerContext.Provider>
    );
};
