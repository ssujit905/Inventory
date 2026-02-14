import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
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

    const fetchProfiles = async () => {
        setLoading(true);
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
            setLoading(false);
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
            const url = (import.meta as any).env.VITE_SUPABASE_URL;
            const key = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

            const tempClient = (await import('@supabase/supabase-js')).createClient(
                url,
                key,
                { auth: { persistSession: false } }
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
                <div className="max-w-7xl mx-auto space-y-6 pb-20">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b dark:border-gray-800 pb-6">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Staff Management</h1>
                        <p className="text-xs sm:text-sm text-gray-500 font-medium mt-2 uppercase tracking-[0.15em] sm:tracking-[0.2em] flex items-center gap-2">
                            <Shield size={16} className="text-primary" /> Authority & Access Control
                        </p>
                    </div>

                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="group relative flex items-center justify-center gap-3 px-5 sm:px-8 py-3 sm:py-4 bg-primary text-white font-black rounded-[2rem] shadow-2xl shadow-primary/30 transition-all hover:scale-[1.02] active:scale-95 overflow-hidden w-full sm:w-auto"
                    >
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <UserPlus size={22} className="relative z-10" />
                        <span className="relative z-10">Add New Personnel</span>
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
                <div className="md:hidden space-y-3">
                    {loading ? (
                        <div className="py-12 text-center">
                            <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hydrating Personnel Registry...</span>
                        </div>
                    ) : profiles.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
                            No personnel accounts detected
                        </div>
                    ) : profiles.map((p) => (
                        <div key={p.id} className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-4 space-y-4 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-black text-lg">
                                    {p.full_name?.[0] || 'U'}
                                </div>
                                <div className="min-w-0">
                                    {editingId === p.id ? (
                                        <input
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            className="w-full bg-gray-100 dark:bg-gray-800 border-2 border-primary/20 rounded-xl px-3 py-2 font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary transition-all"
                                        />
                                    ) : (
                                        <p className="font-black text-gray-900 dark:text-gray-100 text-base truncate">{p.full_name || 'Anonymous User'}</p>
                                    )}
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">{p.id.slice(0, 8)}...</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                {editingId === p.id ? (
                                    <select
                                        value={editRole}
                                        onChange={e => setEditRole(e.target.value as any)}
                                        className="flex-1 bg-gray-100 dark:bg-gray-800 border-2 border-primary/20 rounded-xl px-3 py-2 font-black text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
                                    >
                                        <option value="staff">Staff Member</option>
                                        <option value="admin">Administrator</option>
                                    </select>
                                ) : (
                                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${p.role === 'admin'
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                                        }`}>
                                        <Shield size={12} /> {p.role}
                                    </div>
                                )}
                                <p className="text-[11px] font-bold text-gray-500">{format(new Date(p.created_at), 'dd MMM yyyy')}</p>
                            </div>
                            <div className="flex justify-end gap-2">
                                {editingId === p.id ? (
                                    <>
                                        <button
                                            onClick={() => handleSaveEdit(p.id)}
                                            disabled={actionLoading}
                                            className="h-10 w-10 flex items-center justify-center bg-green-500 text-white rounded-xl"
                                        >
                                            <Check size={18} />
                                        </button>
                                        <button
                                            onClick={() => setEditingId(null)}
                                            className="h-10 w-10 flex items-center justify-center bg-gray-100 text-gray-500 rounded-xl"
                                        >
                                            <X size={18} />
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => handleStartEdit(p)}
                                        className="h-10 w-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl"
                                        title="Edit Permissions"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="hidden md:block bg-white dark:bg-gray-900 rounded-[3rem] border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 dark:bg-gray-800/30 border-b dark:border-gray-800">
                                    <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Personnel</th>
                                    <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Responsibility</th>
                                    <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Joined On</th>
                                    <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-gray-800">
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-10 py-24 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Hydrating Personnel Registry...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : profiles.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-10 py-24 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
                                            No personnel accounts detected
                                        </td>
                                    </tr>
                                ) : profiles.map(p => (
                                    <tr key={p.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-all duration-300">
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-5">
                                                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-black text-xl shadow-inner">
                                                    {p.full_name?.[0] || 'U'}
                                                </div>
                                                <div className="flex flex-col">
                                                    {editingId === p.id ? (
                                                        <input
                                                            value={editName}
                                                            onChange={e => setEditName(e.target.value)}
                                                            className="bg-gray-100 dark:bg-gray-800 border-2 border-primary/20 rounded-xl px-4 py-2 font-bold text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary transition-all"
                                                        />
                                                    ) : (
                                                        <span className="font-black text-gray-900 dark:text-gray-100 text-lg">{p.full_name || 'Anonymous User'}</span>
                                                    )}
                                                    <span className="text-xs text-gray-400 font-bold tracking-tight uppercase flex items-center gap-1.5 mt-0.5">
                                                        <UserCheck size={12} className="text-primary/40" /> {p.id.slice(0, 8)}...
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            {editingId === p.id ? (
                                                <select
                                                    value={editRole}
                                                    onChange={e => setEditRole(e.target.value as any)}
                                                    className="bg-gray-100 dark:bg-gray-800 border-2 border-primary/20 rounded-xl px-4 py-2 font-black text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary"
                                                >
                                                    <option value="staff">Staff Member</option>
                                                    <option value="admin">Administrator</option>
                                                </select>
                                            ) : (
                                                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${p.role === 'admin'
                                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                                                    }`}>
                                                    <Shield size={12} /> {p.role}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-gray-700 dark:text-gray-300 font-mono">
                                                    {format(new Date(p.created_at), 'dd MMM yyyy')}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Registered Account</span>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            {editingId === p.id ? (
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        onClick={() => handleSaveEdit(p.id)}
                                                        disabled={actionLoading}
                                                        className="h-12 w-12 flex items-center justify-center bg-green-500 text-white rounded-2xl hover:scale-110 active:scale-95 transition-all shadow-lg shadow-green-500/30"
                                                    >
                                                        <Check size={24} />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        className="h-12 w-12 flex items-center justify-center bg-gray-100 text-gray-500 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all"
                                                    >
                                                        <X size={24} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button
                                                        onClick={() => handleStartEdit(p)}
                                                        className="h-12 w-12 flex items-center justify-center bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 hover:scale-110 active:scale-95 transition-all"
                                                        title="Edit Permissions"
                                                    >
                                                        <Edit2 size={20} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Add Staff Modal */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-gray-950/80 backdrop-blur-xl animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-[2rem] sm:rounded-[3rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 max-h-[92vh] flex flex-col">
                            <div className="p-5 sm:p-12 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-br from-primary/5 to-transparent">
                                <div>
                                    <h2 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit">Enlist Personnel</h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mt-2">Initialize new secure account</p>
                                </div>
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="h-11 w-11 sm:h-14 sm:w-14 flex items-center justify-center rounded-[1.2rem] sm:rounded-[1.5rem] bg-gray-100 dark:bg-gray-800 hover:bg-rose-100 text-gray-500 hover:text-rose-600 transition-all"
                                >
                                    <X size={28} />
                                </button>
                            </div>

                            <form onSubmit={handleAddStaff} className="p-5 sm:p-12 space-y-6 sm:space-y-8 overflow-y-auto">
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
                                    className="w-full h-14 sm:h-20 bg-primary text-white font-black text-sm sm:text-lg rounded-[1.4rem] sm:rounded-[2rem] shadow-2xl shadow-primary/40 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
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
