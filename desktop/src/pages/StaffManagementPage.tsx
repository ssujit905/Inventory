import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { UserPlus, Shield, Mail, Edit2, X, AlertCircle, Key, UserCheck, Store, Eye, EyeOff, Save } from 'lucide-react';
import { format } from 'date-fns';

type Profile = {
    id: string;
    full_name: string | null;
    email?: string | null;
    store_name?: string | null;
    role: 'admin' | 'staff' | 'vendor';
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
    const [newStoreName, setNewStoreName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'staff' | 'vendor'>('staff');
    const [newPermissions, setNewPermissions] = useState<'read_only' | 'read_write'>('read_only');
    const [showPassword, setShowPassword] = useState(false);

    // Edit Modal State
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editStoreName, setEditStoreName] = useState('');
    const [editPermissions, setEditPermissions] = useState<'read_only' | 'read_write'>('read_write');
    const [editNewPassword, setEditNewPassword] = useState('');
    const [showEditPassword, setShowEditPassword] = useState(false);

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('staff_entry_draft');
        const savedFormOpen = localStorage.getItem('staff_entry_form_open');

        if (savedFormOpen === 'true') setIsAddModalOpen(true);
        if (savedDraft) {
            try {
                const d = JSON.parse(savedDraft);
                setNewName(d.newName || '');
                setNewEmail(d.newEmail || '');
                setNewRole(d.newRole || 'staff');
                setNewPermissions(d.newPermissions || 'read_only');
            } catch (e) { console.error('Staff draft restore failed'); }
        }
    }, []);

    useEffect(() => {
        if (isAddModalOpen) {
            const draft = { newName, newEmail, newRole, newPermissions };
            localStorage.setItem('staff_entry_draft', JSON.stringify(draft));
            localStorage.setItem('staff_entry_form_open', 'true');
        } else {
            localStorage.removeItem('staff_entry_form_open');
        }
    }, [newName, newEmail, newPassword, newRole, newPermissions, isAddModalOpen]);

    const clearDraft = () => {
        localStorage.removeItem('staff_entry_draft');
        localStorage.removeItem('staff_entry_form_open');
    };

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
                if (currentUserProfile) {
                    setProfiles([currentUserProfile]);
                    setMessage({
                        type: 'error',
                        text: 'Database connection issue. Showing limited data.'
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

            const { data: authData, error: authError } = await tempClient.auth.signUp({
                email: newEmail,
                password: newPassword,
                options: {
                    data: {
                        full_name: newName,
                        store_name: newRole === 'vendor' ? newStoreName : null,
                        role: newRole,
                        permissions: newPermissions
                    }
                }
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error("Personnel creation failed in authentication layer.");

            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    full_name: newName,
                    email: newEmail,
                    store_name: newRole === 'vendor' ? newStoreName : null,
                    role: newRole,
                    permissions: newPermissions
                });

            if (profileError) {
                console.warn('Profile creation failed, but user was created in auth:', profileError);
            }

            setMessage({
                type: 'success',
                text: `Successfully created ${newRole === 'vendor' ? 'Vendor Partner' : newRole} account for ${newName}!`
            });

            fetchProfiles();
            clearDraft();
            setIsAddModalOpen(false);
            setNewName('');
            setNewStoreName('');
            setNewEmail('');
            setNewPassword('');
            setNewRole('staff');
            setNewPermissions('read_only');

        } catch (error: any) {
            if (error.message?.includes('already registered')) {
                setMessage({
                    type: 'error',
                    text: 'Email already exists.'
                });
            } else {
                setMessage({ type: 'error', text: error.message });
            }
        } finally {
            setActionLoading(false);
        }
    };

    const openEditModal = (p: Profile) => {
        setEditingProfile(p);
        setEditName(p.full_name || '');
        setEditEmail(p.email || '');
        setEditStoreName(p.store_name || '');
        setEditPermissions(p.permissions);
        setEditNewPassword('');
        setShowEditPassword(false);
    };

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProfile) return;
        setActionLoading(true);
        setMessage(null);

        try {
            // Update profile info
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: editName,
                    email: editEmail,
                    store_name: editingProfile.role === 'vendor' ? editStoreName : editingProfile.store_name,
                    permissions: editPermissions,
                })
                .eq('id', editingProfile.id);

            if (profileError) throw profileError;

            // If a new password was provided, update it via a password reset flow
            // Note: Supabase Admin API requires service role key to reset another user's password.
            // Since we're using the anon key, we can only update the profile fields.
            // Password update would require a Supabase Edge Function with service role key.
            if (editNewPassword) {
                setMessage({
                    type: 'success',
                    text: `Profile updated for ${editName}. Note: Password changes require the vendor to use the "Forgot Password" flow, or contact your Supabase admin.`
                });
            } else {
                setMessage({
                    type: 'success',
                    text: `Profile updated successfully for ${editName}.`
                });
            }

            fetchProfiles();
            setEditingProfile(null);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <DashboardLayout role="admin">
            <div className="p-12 space-y-10 max-w-[1600px] mx-auto font-sans">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white dark:bg-gray-900 p-10 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none">
                    <div className="flex items-center gap-6">
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white flex items-center justify-center shadow-lg shadow-primary/30">
                            <UserPlus size={32} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tight font-outfit">Personnel & Vendor Management</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">Manage system administrators, staff access, and vendor partners</p>
                        </div>
                    </div>

                    {!isReadOnly && (
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="px-8 py-5 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/30 hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center gap-3 text-sm tracking-wide"
                        >
                            <UserPlus size={20} />
                            Enlist New Account
                        </button>
                    )}
                </div>

                {message && (
                    <div className={`p-6 rounded-2xl text-sm font-bold flex items-center gap-3 animate-in fade-in duration-200 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                        <AlertCircle size={20} />
                        {message.text}
                    </div>
                )}

                {/* Profiles Table */}
                <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b dark:border-gray-800 text-[10px] font-black uppercase tracking-widest text-gray-400 bg-gray-50/50 dark:bg-gray-800/50">
                                    <th className="px-10 py-6">User / Store Info</th>
                                    <th className="px-10 py-6">Email Address</th>
                                    <th className="px-10 py-6">Rank & Access</th>
                                    <th className="px-10 py-6">Enlisted Date</th>
                                    {!isReadOnly && <th className="px-10 py-6">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-gray-800">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-10 py-24 text-center">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading Personnel Registry...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : profiles.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-10 py-24 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
                                            No accounts detected
                                        </td>
                                    </tr>
                                ) : profiles.map(p => (
                                    <tr key={p.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-all duration-300">
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-5">
                                                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner ${
                                                    p.role === 'vendor' ? 'bg-purple-100 text-purple-700' : 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary'
                                                }`}>
                                                    {p.role === 'vendor' ? <Store size={24} /> : (p.full_name?.[0] || 'U')}
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-black text-gray-900 dark:text-gray-100 text-lg">{p.full_name || 'Anonymous User'}</span>
                                                        {p.store_name && (
                                                            <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-100">
                                                                {p.store_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-xs text-gray-400 font-mono mt-0.5">{p.id.slice(0, 12)}...</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                <Mail size={14} className="text-gray-400 shrink-0" />
                                                {p.email || <span className="text-gray-400 italic text-xs">Not stored</span>}
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-2">
                                                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${
                                                    p.role === 'admin'
                                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                                        : p.role === 'vendor'
                                                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                                                    }`}>
                                                    {p.role === 'vendor' ? <Store size={12} /> : <Shield size={12} />} {p.role === 'vendor' ? 'Vendor' : p.role}
                                                </div>
                                                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${p.permissions === 'read_write'
                                                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                                    : 'bg-orange-50 text-orange-700 border border-orange-100'
                                                    }`}>
                                                    {p.permissions === 'read_write' ? 'Read & Write' : 'Read Only'}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-gray-700 dark:text-gray-300 font-mono">
                                                    {format(new Date(p.created_at), 'dd MMM yyyy')}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Registered</span>
                                            </div>
                                        </td>
                                        {!isReadOnly && (
                                            <td className="px-10 py-8">
                                                <button
                                                    onClick={() => openEditModal(p)}
                                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-primary hover:text-white text-gray-600 dark:text-gray-300 text-xs font-black uppercase tracking-wider transition-all"
                                                >
                                                    <Edit2 size={14} />
                                                    Edit
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Add Staff Modal */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-950/80 backdrop-blur-xl animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-[3rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 max-h-[85vh] flex flex-col">
                            <div className="p-12 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-br from-primary/5 to-transparent">
                                <div>
                                    <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit">Enlist New Account</h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mt-2">Initialize Staff, Admin, or Vendor Account</p>
                                </div>
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="h-14 w-14 flex items-center justify-center rounded-[1.5rem] bg-gray-100 dark:bg-gray-800 hover:bg-rose-100 text-gray-500 hover:text-rose-600 transition-all"
                                >
                                    <X size={28} />
                                </button>
                            </div>

                            <form onSubmit={handleAddStaff} className="p-12 space-y-8 overflow-y-auto custom-scrollbar flex-1">
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
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Assign Rank / Role</label>
                                            <div className="relative">
                                                <Shield className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                                <select
                                                    required
                                                    value={newRole}
                                                    onChange={e => setNewRole(e.target.value as any)}
                                                    className="w-full h-16 pl-14 pr-6 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-black text-gray-900 dark:text-gray-100 transition-all appearance-none"
                                                >
                                                    <option value="staff">Staff Personnel</option>
                                                    <option value="vendor">Vendor Partner</option>
                                                    <option value="admin">System Admin</option>
                                                </select>
                                            </div>
                                        </div>

                                        {newRole === 'vendor' && (
                                            <div className="space-y-2 md:col-span-2 animate-in fade-in duration-200">
                                                <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest ml-1">Vendor Store Name *</label>
                                                <div className="relative">
                                                    <Store className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-purple-400" />
                                                    <input
                                                        required={newRole === 'vendor'}
                                                        type="text"
                                                        value={newStoreName}
                                                        onChange={e => setNewStoreName(e.target.value)}
                                                        className="w-full h-16 pl-14 pr-6 bg-purple-50/50 dark:bg-purple-950/20 border-2 border-purple-200 dark:border-purple-800 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                        placeholder="e.g. Himalayan Fashion Hub"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-2 md:col-span-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Access Level</label>
                                            <div className="relative">
                                                <UserCheck className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                                <select
                                                    required
                                                    value={newPermissions}
                                                    onChange={e => setNewPermissions(e.target.value as any)}
                                                    className="w-full h-16 pl-14 pr-6 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-black text-gray-900 dark:text-gray-100 transition-all appearance-none"
                                                >
                                                    <option value="read_write">Read & Write Access</option>
                                                    <option value="read_only">Read Only Access</option>
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
                                                className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                                            >
                                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
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
                                            Creating Account...
                                        </>
                                    ) : (
                                        <>Issue Official Credentials</>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* Edit Profile Modal */}
                {editingProfile && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-950/80 backdrop-blur-xl animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-[3rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 max-h-[90vh] flex flex-col">
                            <div className="p-10 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-br from-purple-500/5 to-transparent">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 font-outfit">Edit Account</h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.15em] mt-1">
                                        {editingProfile.role === 'vendor' ? 'Vendor Partner' : editingProfile.role} — Update credentials & access
                                    </p>
                                </div>
                                <button
                                    onClick={() => setEditingProfile(null)}
                                    className="h-12 w-12 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-rose-100 text-gray-500 hover:text-rose-600 transition-all"
                                >
                                    <X size={22} />
                                </button>
                            </div>

                            <form onSubmit={handleEditSave} className="p-10 space-y-6 overflow-y-auto flex-1">
                                {/* Name */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                    <div className="relative">
                                        <Edit2 className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <input
                                            required
                                            type="text"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            className="w-full h-14 pl-12 pr-5 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Email */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <input
                                            type="email"
                                            value={editEmail}
                                            onChange={e => setEditEmail(e.target.value)}
                                            className="w-full h-14 pl-12 pr-5 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                            placeholder="email@example.com"
                                        />
                                    </div>
                                </div>

                                {/* Store Name (vendor only) */}
                                {editingProfile.role === 'vendor' && (
                                    <div className="space-y-2 animate-in fade-in">
                                        <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest ml-1">Store Name</label>
                                        <div className="relative">
                                            <Store className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
                                            <input
                                                type="text"
                                                value={editStoreName}
                                                onChange={e => setEditStoreName(e.target.value)}
                                                className="w-full h-14 pl-12 pr-5 bg-purple-50/50 dark:bg-purple-950/20 border-2 border-purple-200 dark:border-purple-800 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                placeholder="Store name"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Permissions */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Access Level</label>
                                    <div className="relative">
                                        <UserCheck className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <select
                                            value={editPermissions}
                                            onChange={e => setEditPermissions(e.target.value as any)}
                                            className="w-full h-14 pl-12 pr-5 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-black text-gray-900 dark:text-gray-100 transition-all appearance-none"
                                        >
                                            <option value="read_write">Read & Write Access</option>
                                            <option value="read_only">Read Only Access</option>
                                        </select>
                                    </div>
                                </div>

                                {/* New Password */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Set New Password <span className="text-gray-300">(leave blank to keep current)</span></label>
                                    <div className="relative">
                                        <Key className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <input
                                            type={showEditPassword ? 'text' : 'password'}
                                            value={editNewPassword}
                                            onChange={e => setEditNewPassword(e.target.value)}
                                            className="w-full h-14 pl-12 pr-14 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                            placeholder="New password (optional)"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowEditPassword(!showEditPassword)}
                                            className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                                        >
                                            {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-amber-600 dark:text-amber-400 ml-1 font-medium">
                                        ⚠️ Password changes require Supabase Admin access. Contact your system administrator to reset passwords.
                                    </p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={actionLoading}
                                    className="w-full h-16 bg-primary text-white font-black text-base rounded-2xl shadow-lg shadow-primary/30 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    {actionLoading ? (
                                        <>
                                            <div className="animate-spin h-5 w-5 border-3 border-white border-t-transparent rounded-full"></div>
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save size={18} />
                                            Save Changes
                                        </>
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
