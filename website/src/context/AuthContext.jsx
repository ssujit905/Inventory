import { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// SECURITY: This is a deprecated legacy context. It previously contained a
// hardcoded mock admin credential (admin@shopy.com / admin123) that granted an
// 'admin' role purely client-side via localStorage — anyone could forge it and
// open /admin/dashboard. That backdoor has been removed.
//
// - Customer auth lives in CustomerContext.jsx (phone + PIN via server RPCs).
// - Staff/admin auth lives in the inventory desktop/mobile apps (Supabase Auth
//   + public.is_admin_or_staff() RLS check). There is no admin surface on the
//   public website anymore; /admin/dashboard route was removed in App.jsx.
// The stubs below are kept so unrouted legacy pages (Login/Signup) don't crash,
// but they never authenticate anyone and never persist a role.
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);

    const login = () => {
        return { success: false, error: 'Email login is disabled. Customers sign in with phone + PIN on My Orders.' };
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('shopy-nepal-user');
    };

    const signup = () => {
        return { success: false, error: 'Email signup is disabled. Customers register with phone + PIN on My Orders.' };
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, signup }}>
            {children}
        </AuthContext.Provider>
    );
};
