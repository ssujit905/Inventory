import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { UserPlus, Shield, Mail, Edit2, X, AlertCircle, Key, UserCheck, Users } from 'lucide-react';
import { format } from 'date-fns';

type Profile = {
    id: string;
    full_name: string | null;
    role: 'admin' | 'staff';
    permissions: 'read_only' | 'read_write';
    created_at: string;
};

export default function StaffManagementPage() {
    const { profile: currentUserProfile } = useAuthStore();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const isReadOnly = currentUserProfile?.permissions === 'read_only';

    // Message State
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // New Staff Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
    const [newPermissions, setNewPermissions] = useState<'read_only' | 'read_write'>('read_only');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        fetchProfiles();
    }, []);

    useRealtimeRefresh(
        () => fetchProfiles(false),
        {
            channelName: 'profiles-updates-v2',
            tables: ['profiles'],
            pollMs: 10000,
            enabled: currentUserProfile?.role === 'admin'
        }
    );

    const fetchProfiles = async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching profiles:', error);
                // If there's a database error, at least show the current user
                if (currentUserProfile) {
                    setProfiles([currentUserProfile]);
                    setMessage({
                        type: 'error',
                        text: 'Database connection issue. Showing limited data. Please check your Supabase configuration.'
                    });
                } else {
                    throw error;
                }
            } else if (data) {
                setProfiles(data as Profile[]);
                setMessage(null);
            }
        } catch (error: any) {
            console.error('Error fetching profiles:', error);
            // Fallback: show at least the current user
            if (currentUserProfile) {
                setProfiles([currentUserProfile]);
            }
            setMessage({
                type: 'error',
                text: 'Failed to load personnel list. Database configuration needed.'
            });
        } finally {
            if (showLoader) setLoading(false);
        }
    };

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionLoading(true);
        setMessage(null);

        try {
            // Logic to create a user without signing out the current admin:
            // We use a temporary client that doesn't persist the session.
            const tempClient = (await import('@supabase/supabase-js')).createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false,
                        storageKey: 'sb-temp-create-user'
                    }
                }
            );

            // 1. Create User in Auth
            const { data: authData, error: authError } = await tempClient.auth.signUp({
                email: newEmail,
                password: newPassword,
                options: {
                    data: {
                        full_name: newName,
                        role: newRole,
                        permissions: newPermissions
                    }
                }
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error("Personnel creation failed in authentication layer.");

            // 2. Insert Profile Entry manually via the admin's session
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: authData.user.id,
                    full_name: newName,
                    role: newRole,
                    permissions: newPermissions
                });

            if (profileError) {
                // If profile fails, user exists in auth. They can still log in and a default profile will be created by the listener.
                console.warn('Profile creation failed, but user was created in auth:', profileError);
            }

            setMessage({
                type: 'success',
                text: `Successfully created ${newRole} account for ${newName}! They can now log in with their credentials.`
            });

            fetchProfiles();
            setIsAddModalOpen(false);

            // Clear Form
            setNewName('');
            setNewEmail('');
            setNewPassword('');
            setNewRole('staff');
            setNewPermissions('read_only');

        } catch (error: any) {
            if (error.message?.includes('already registered')) {
                setMessage({
                    type: 'error',
                    text: 'Email already exists. Update their role in the list below if they are already registered.'
                });
            } else {
                setMessage({ type: 'error', text: error.message });
            }
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <DashboardLayout role={currentUserProfile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Staff Management</h1>
                        <p className="text-gray-400 font-medium text-xs">Manage personnel accounts and system access levels.</p>
                    </div>
                    <button
                        onClick={() => !isReadOnly && setIsAddModalOpen(true)}
                        disabled={isReadOnly}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 w-full sm:w-auto ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'}`}
                    >
                        <UserPlus size={16} strokeWidth={2.5} />
                        {isReadOnly ? 'Read Only Mode' : 'Issue Credentials'}
                    </button>
                </div>

                {message && (
                    <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                        <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                            {message.type === 'success' ? <UserCheck size={14} strokeWidth={3} /> : <AlertCircle size={14} strokeWidth={3} />}
                        </div>
                        {message.text}
                    </div>
                )}

                {/* Personnel Registry Section Header */}
                <div className="flex items-center gap-2 px-1">
                    <Users size={14} strokeWidth={1.5} className="text-gray-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Personnel Registry</h3>
                    <span className="ml-auto text-[10px] font-bold text-gray-300">{profiles.length} Accounts</span>
                </div>

                <div className="space-y-2.5">
                    {loading ? (
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-24 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 animate-pulse" />
                        ))
                    ) : profiles.length === 0 ? (
                        <div className="bg-white dark:bg-gray-900 rounded-xl p-10 border border-gray-100 dark:border-gray-800 text-center">
                            <div className="h-12 w-12 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Users size={20} className="text-gray-400" />
                            </div>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No personnel accounts</p>
                        </div>
                    ) : profiles.map((p, index) => {
                        const displayIndex = profiles.length - index;
                        return (
                            <div key={p.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden active:scale-[0.99] transition-all">
                                {/* Card Header Strip */}
                                <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
                                    <div className="flex items-center gap-2.5">
                                        <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black flex-shrink-0">
                                            {displayIndex}
                                        </span>
                                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                            Member since {format(new Date(p.created_at), 'MMM dd, yyyy')}
                                        </span>
                                    </div>
                                    <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${p.role === 'admin'
                                        ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800'
                                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800'
                                    }`}>
                                        {p.role}
                                    </div>
                                </div>

                                {/* Main Info Section */}
                                <div className="px-3.5 pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="h-11 w-11 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-primary font-black text-lg border border-gray-100 dark:border-gray-700">
                                            {p.full_name?.[0] || 'U'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{p.full_name || 'Anonymous User'}</h3>
                                            <div className="flex items-center gap-1.5 text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                                <Shield size={10} className="text-gray-300" />
                                                ID: {p.id.slice(0, 12)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Detail Strip */}
                                <div className="flex items-center gap-0 border-t border-gray-50 dark:border-gray-800">
                                    <div className="flex-1 px-3.5 py-2.5 border-r border-gray-50 dark:border-gray-800">
                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Access Control</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            <div className={`h-1.5 w-1.5 rounded-full ${p.permissions === 'read_write' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                                            <p className={`text-[10px] font-black uppercase tracking-tight ${p.permissions === 'read_write' ? 'text-blue-600' : 'text-amber-600'}`}>
                                                {p.permissions === 'read_write' ? 'Read & Write' : 'Read Only'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex-1 px-3.5 py-2.5 text-right">
                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Account Status</p>
                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-tight mt-0.5">Active Account</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Add Staff Modal (Standard Style) */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800 max-h-[92svh] flex flex-col">
                            <div className="px-5 py-4 sm:px-8 sm:py-6 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50 flex-shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Add Personnel</h2>
                                    <p className="text-xs text-gray-400 font-medium">Create secure credentials and ranks</p>
                                </div>
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="h-10 w-10 rounded-xl bg-white dark:bg-gray-900 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all shadow-sm border border-gray-100 dark:border-gray-800"
                                >
                                    <X size={20} strokeWidth={1.5} />
                                </button>
                            </div>

                            <form onSubmit={handleAddStaff} className="p-5 sm:p-8 space-y-6 overflow-y-auto">
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-1">Full Name</label>
                                        <div className="relative group">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors">
                                                <Users size={18} />
                                            </div>
                                            <input
                                                required
                                                type="text"
                                                value={newName}
                                                onChange={e => setNewName(e.target.value)}
                                                className="w-full h-14 pl-12 pr-5 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 focus:bg-white dark:focus:bg-gray-900 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                placeholder="e.g. Sujit Singh"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-1">Rank</label>
                                            <select
                                                required
                                                value={newRole}
                                                onChange={e => setNewRole(e.target.value as any)}
                                                className="w-full h-14 px-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 appearance-none"
                                            >
                                                <option value="staff">Staff</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-1">Permissions</label>
                                            <select
                                                required
                                                value={newPermissions}
                                                onChange={e => setNewPermissions(e.target.value as any)}
                                                className="w-full h-14 px-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 appearance-none"
                                            >
                                                <option value="read_only">Read Only</option>
                                                <option value="read_write">Read & Write</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-1">Email Address</label>
                                        <div className="relative group">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors">
                                                <Mail size={18} />
                                            </div>
                                            <input
                                                required
                                                type="email"
                                                value={newEmail}
                                                onChange={e => setNewEmail(e.target.value)}
                                                className="w-full h-14 pl-12 pr-5 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 focus:bg-white dark:focus:bg-gray-900 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                placeholder="personnel@company.com"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-1">Secure Password</label>
                                        <div className="relative group">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors">
                                                <Key size={18} />
                                            </div>
                                            <input
                                                required
                                                type={showPassword ? 'text' : 'password'}
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                className="w-full h-14 pl-12 pr-16 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 focus:bg-white dark:focus:bg-gray-900 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                placeholder="••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-primary uppercase tracking-widest px-2 py-1 bg-primary/10 rounded-lg"
                                            >
                                                {showPassword ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="w-full h-16 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 mt-4"
                                >
                                    {actionLoading ? 'Initializing...' : 'Issue Credentials'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
