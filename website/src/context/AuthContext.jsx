import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const savedUser = localStorage.getItem('shopy-nepal-user');
        return savedUser ? JSON.parse(savedUser) : null;
    });

    const login = (email, password) => {
        // Admin credentials check
        if (email === 'admin@shopy.com' && password === 'admin123') {
            const adminUser = {
                email,
                name: 'Admin User',
                role: 'admin',
                joined: 'Feb 2026'
            };
            setUser(adminUser);
            localStorage.setItem('shopy-nepal-user', JSON.stringify(adminUser));
            return { success: true, role: 'admin' };
        }

        // Regular user mock login
        const regularUser = {
            email,
            name: email.split('@')[0],
            role: 'user'
        };
        setUser(regularUser);
        localStorage.setItem('shopy-nepal-user', JSON.stringify(regularUser));
        return { success: true, role: 'user' };
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('shopy-nepal-user');
    };

    const signup = (userData) => {
        const newUser = { ...userData, role: 'user' };
        setUser(newUser);
        localStorage.setItem('shopy-nepal-user', JSON.stringify(newUser));
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, signup }}>
            {children}
        </AuthContext.Provider>
    );
};
