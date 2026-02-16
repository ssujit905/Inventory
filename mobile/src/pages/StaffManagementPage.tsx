import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { UserPlus, Shield, Mail, Edit2, Check, X, AlertCircle, Key, UserCheck } from 'lucide-react';
import { format } from 'date-fns';

type Profile = {
    id: string;
    full_name: string | null;
    role: 'admin' | 'staff';
    created_at: string;
};

export default function StaffManagementPage() {
    const { profile: currentUserProfile } = useAuthStore();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Edit States
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editRole, setEditRole] = useState<'admin' | 'staff'>('staff');

    // Message State
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // New Staff Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');
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

    const handleStartEdit = (p: Profile) => {
        setEditingId(p.id);
        setEditName(p.full_name || '');
        setEditRole(p.role);
    };

    const handleSaveEdit = async (id: string) => {
        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: editName, role: editRole })
                .eq('id', id);

            if (error) throw error;

            setProfiles(prev => prev.map(p => p.id === id ? { ...p, full_name: editName, role: editRole } : p));
            setEditingId(null);
            setMessage({ type: 'success', text: 'Personnel updated successfully!' });
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setActionLoading(false);
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
                        role: newRole
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
                    role: newRole
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
            <div className="max-w-7xl mx-auto space-y-8 pb-20">

                {/* Header Section */}
                <div className="flex flex-col gap-4 border-b dark:border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Staff Management</h1>
                        <p className="text-sm text-gray-500 font-medium mt-2 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Shield size={16} className="text-primary" /> Authority & Access Control
                        </p>
                    </div>

                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-all shadow-sm active:scale-95 w-full sm:w-auto"
                    >
                        <UserPlus size={16} strokeWidth={2.5} />
                        Add New Personnel
                    </button>
                </div>

                {message && (
                    <div className={`p-6 rounded-3xl text-sm font-black flex items-center justify-between animate-in slide-in-from-top-4 ${message.type === 'success'
                        ? 'bg-green-100 text-green-700 border border-green-200 shadow-lg shadow-green-500/10'
                        : 'bg-rose-100 text-rose-700 border border-rose-200 shadow-lg shadow-rose-500/10'
                        }`}>
                        <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-xl ${message.type === 'success' ? 'bg-green-500/20' : 'bg-rose-500/20'}`}>
                                <AlertCircle size={20} />
                            </div>
                            {message.text}
                        </div>
                        <button onClick={() => setMessage(null)} className="p-2 hover:bg-black/5 rounded-lg transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                )}

                {/* Personnel List */}
                <div className="space-y-3">
                    {loading ? (
                        <div className="py-24 text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                            <div className="flex flex-col items-center gap-4">
                                <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hydrating Personnel Registry...</span>
                            </div>
                        </div>
                    ) : profiles.length === 0 ? (
                        <div className="py-24 text-center bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 text-gray-400 font-bold uppercase tracking-widest text-sm">
                            No personnel accounts detected
                        </div>
                    ) : profiles.map((p, index) => {
                        const displayIndex = profiles.length - index;
                        return (
                            <div key={p.id} className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black">
                                    {displayIndex}
                                </div>
                                <div className="flex flex-col gap-3 pl-12 pr-4 py-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                {format(new Date(p.created_at), 'MMM dd, yyyy')}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${p.role === 'admin'
                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                    : 'bg-gray-100 text-gray-600 border-gray-200'
                                                    }`}>
                                                    {p.role}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-black text-gray-900 dark:text-gray-100 truncate">{p.full_name || 'Anonymous User'}</div>
                                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1.5">
                                                <UserCheck size={12} className="text-primary/40" /> {p.id.slice(0, 8)}...
                                            </div>
                                        </div>
                                    </div>
                                </div>
                        );
                    })}
                </div>

                {/* Add Staff Modal */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-xl animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-[2.5rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 flex flex-col max-h-[90vh]">
                            <div className="p-8 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-br from-primary/5 to-transparent flex-shrink-0">
                                <div>
                                    <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit">Enlist Personnel</h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mt-2">Initialize new secure account</p>
                                </div>
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="h-14 w-14 flex items-center justify-center rounded-[1.5rem] bg-gray-100 dark:bg-gray-800 hover:bg-rose-100 text-gray-500 hover:text-rose-600 transition-all"
                                >
                                    <X size={28} />
                                </button>
                            </div>

                            <form onSubmit={handleAddStaff} className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 text-sm font-semibold">
                                    New accounts can log in immediately only if Supabase email confirmation is disabled.
                                </div>
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Legal Name</label>
                                            <div className="relative">
                                                <Edit2 className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                                <input
                                                    required
                                                    type="text"
                                                    value={newName}
                                                    onChange={e => setNewName(e.target.value)}
                                                    className="w-full h-16 pl-14 pr-6 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                    placeholder="e.g. Sujit Singh"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assign Rank</label>
                                            <div className="relative">
                                                <Shield className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                                <select
                                                    required
                                                    value={newRole}
                                                    onChange={e => setNewRole(e.target.value as any)}
                                                    className="w-full h-16 pl-14 pr-6 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-black text-gray-900 dark:text-gray-100 transition-all appearance-none"
                                                >
                                                    <option value="staff">Staff Personnel</option>
                                                    <option value="admin">System Admin</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Official Email Address</label>
                                        <div className="relative">
                                            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                            <input
                                                required
                                                type="email"
                                                value={newEmail}
                                                onChange={e => setNewEmail(e.target.value)}
                                                className="w-full h-16 pl-14 pr-6 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                placeholder="personnel@company.com"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Secure Password</label>
                                        <div className="relative">
                                            <Key className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                            <input
                                                required
                                                type={showPassword ? 'text' : 'password'}
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                                className="w-full h-16 pl-14 pr-16 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                placeholder="••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors font-bold text-xs uppercase"
                                            >
                                                {showPassword ? 'Hide' : 'Show'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="w-full h-20 bg-primary text-white font-black text-lg rounded-[2rem] shadow-2xl shadow-primary/40 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {actionLoading ? (
                                        <>
                                            <div className="animate-spin h-6 w-6 border-4 border-white border-t-transparent rounded-full"></div>
                                            Initializing Identity...
                                        </>
                                    ) : (
                                        <>Issue Official Credentials</>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
