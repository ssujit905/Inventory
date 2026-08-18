import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { supabase, supabaseWithTimeout } from '../lib/supabase';
import { useAuthStore } from '../hooks/useAuthStore';
import { format } from 'date-fns';
import {
    Users, UserPlus, Trash2, Edit3, X, Mail, Key, ShieldCheck,
    UserCheck, Loader2, AlertTriangle, Check, Eye, EyeOff
} from 'lucide-react';

type StaffProfile = {
    id: string;
    full_name: string | null;
    email?: string | null;
    role: 'admin' | 'staff' | 'vendor';
    permissions: 'read_only' | 'read_write';
    vendor_id?: string | null;
    created_at: string;
    is_owner?: boolean;
};

export default function StaffManagementPage() {
    const { profile } = useAuthStore();
    const isOwner = profile?.role === 'vendor';
    const isReadOnly = profile?.permissions === 'read_only';

    const [staff, setStaff] = useState<StaffProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Add modal state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPermissions, setNewPermissions] = useState<'read_only' | 'read_write'>('read_only');
    const [showPassword, setShowPassword] = useState(false);

    // Edit modal state
    const [editingProfile, setEditingProfile] = useState<StaffProfile | null>(null);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editPermissions, setEditPermissions] = useState<'read_only' | 'read_write'>('read_write');

    // Delete confirmation
    const [confirmDelete, setConfirmDelete] = useState<StaffProfile | null>(null);

    useEffect(() => {
        fetchStaff();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchStaff = async (showLoader = true) => {
        if (!profile) return;
        if (showLoader) setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('vendor_id', profile.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const ownCard: StaffProfile = {
                id: profile.id,
                full_name: profile.full_name || 'Store Owner',
                email: profile.email,
                role: profile.role,
                permissions: profile.permissions,
                created_at: profile.created_at,
                is_owner: true
            };
            setStaff([ownCard, ...((data || []) as StaffProfile[])]);
            setToast(null);
        } catch (err: any) {
            setToast({ msg: err.message || 'Failed to load staff list.', type: 'error' });
        } finally {
            if (showLoader) setLoading(false);
        }
    };

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;
        setActionLoading(true);
        setToast(null);

        try {
            const tempClient = (await import('@supabase/supabase-js')).createClient(
                import.meta.env.VITE_SUPABASE_URL,
                import.meta.env.VITE_SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false,
                        storageKey: 'sb-temp-create-vendor-staff'
                    }
                }
            );

            const { data: authData, error: authError } = await supabaseWithTimeout(
                tempClient.auth.signUp({
                    email: newEmail,
                    password: newPassword,
                    options: {
                        data: {
                            full_name: newName,
                            role: 'staff',
                            permissions: newPermissions
                        }
                    }
                })
            );

            if (authError) throw authError;
            if (!authData.user) throw new Error('Staff creation failed in authentication layer.');

            const { error: profileError } = await supabaseWithTimeout(
                supabase.rpc('create_vendor_staff_profile', {
                    p_user_id: authData.user.id,
                    p_full_name: newName,
                    p_email: newEmail,
                    p_permissions: newPermissions,
                    p_vendor_id: profile.id
                })
            );

            if (profileError) {
                console.warn('Profile creation failed, but user was created in auth:', profileError);
                throw profileError;
            }

            setToast({ msg: `Successfully created Staff account for ${newName}!`, type: 'success' });
            fetchStaff();
            setIsAddModalOpen(false);
            setNewName('');
            setNewEmail('');
            setNewPassword('');
            setNewPermissions('read_only');
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setToast({ msg: 'Submission interrupted. Please try again.', type: 'error' });
            } else if (error?.message === 'NETWORK_TIMEOUT') {
                setToast({ msg: 'Network timeout. Check your connection and try again.', type: 'error' });
            } else if (error.message?.includes('already registered')) {
                setToast({ msg: 'Email already exists.', type: 'error' });
            } else {
                setToast({ msg: error.message, type: 'error' });
            }
        } finally {
            setActionLoading(false);
        }
    };

    const openEditModal = (p: StaffProfile) => {
        if (p.is_owner) return;
        setEditingProfile(p);
        setEditName(p.full_name || '');
        setEditEmail(p.email || '');
        setEditPermissions(p.permissions);
    };

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProfile) return;
        setActionLoading(true);
        setToast(null);

        try {
            const { error } = await supabaseWithTimeout(
                supabase
                    .from('profiles')
                    .update({
                        full_name: editName,
                        email: editEmail,
                        permissions: editPermissions
                    })
                    .eq('id', editingProfile.id)
                    .eq('vendor_id', profile?.id)
            );

            if (error) throw error;
            setToast({ msg: `Profile updated successfully for ${editName}.`, type: 'success' });
            fetchStaff();
            setEditingProfile(null);
        } catch (error: any) {
            setToast({ msg: error.message, type: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete || !profile) return;
        setActionLoading(true);
        setToast(null);

        try {
            const { error } = await supabaseWithTimeout(
                supabase
                    .from('profiles')
                    .delete()
                    .eq('id', confirmDelete.id)
                    .eq('vendor_id', profile.id)
            );

            if (error) throw error;
            setToast({ msg: `Removed ${confirmDelete.full_name || 'staff member'}.`, type: 'success' });
            setConfirmDelete(null);
            fetchStaff();
        } catch (error: any) {
            setToast({ msg: error.message, type: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

    if (!isOwner) {
        return (
            <DashboardLayout role="staff">
                <div className="px-5 max-w-3xl mx-auto py-16 text-center">
                    <div className="h-16 w-16 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-3xl flex items-center justify-center mx-auto mb-5">
                        <AlertTriangle size={28} />
                    </div>
                    <h2 className="text-xl font-black text-gray-900 dark:text-gray-100">Only the store owner can manage staff.</h2>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout role="staff">
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-[11px] font-black uppercase tracking-widest animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-3">
                            <Users className="text-primary" size={24} />
                            Staff Management
                        </h1>
                        <p className="text-gray-400 font-medium text-xs uppercase tracking-widest">Manage your store team and their access levels.</p>
                    </div>
                    {!isReadOnly && (
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="flex items-center justify-center gap-2 px-6 py-3.5 bg-primary text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/25 active:scale-95 transition-all"
                        >
                            <UserPlus size={18} />
                            Add Staff
                        </button>
                    )}
                </div>

                {/* Staff Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {loading ? (
                        <div className="md:col-span-2 xl:col-span-3 flex flex-col items-center gap-3 py-24">
                            <Loader2 className="animate-spin text-primary" size={28} />
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading Staff...</span>
                        </div>
                    ) : staff.length === 0 ? (
                        <div className="md:col-span-2 xl:col-span-3 py-16 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
                            No staff members yet
                        </div>
                    ) : staff.map(p => (
                        <div key={p.id} className={`bg-white dark:bg-gray-900 rounded-3xl border p-6 flex flex-col gap-4 shadow-sm ${
                            p.is_owner ? 'border-primary/30' : 'border-gray-100 dark:border-gray-800'
                        }`}>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center font-black text-lg ${
                                        p.is_owner ? 'bg-primary/10 text-primary' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                                    }`}>
                                        {(p.full_name?.[0] || 'U').toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-black text-gray-900 dark:text-gray-100 truncate flex items-center gap-2">
                                            {p.full_name || 'Anonymous User'}
                                            {p.is_owner && <ShieldCheck size={14} className="text-primary" />}
                                        </p>
                                        <p className="text-xs text-gray-400 truncate">{p.email || 'No email'}</p>
                                    </div>
                                </div>
                                {!p.is_owner && !isReadOnly && (
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => openEditModal(p)}
                                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-primary hover:text-white transition-all active:scale-90"
                                            aria-label="Edit staff"
                                        >
                                            <Edit3 size={15} />
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete(p)}
                                            className="h-9 w-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                                            aria-label="Delete staff"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-4">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                    p.is_owner
                                        ? 'bg-primary/10 text-primary'
                                        : p.permissions === 'read_write'
                                            ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300'
                                            : 'bg-orange-50 text-orange-700 border border-orange-100 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300'
                                }`}>
                                    <UserCheck size={10} />
                                    {p.is_owner ? 'Store Owner' : `Staff · ${p.permissions === 'read_write' ? 'Read & Write' : 'Read Only'}`}
                                </span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                    {format(new Date(p.created_at), 'dd MMM yyyy')}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Add Staff Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-gray-950/80 backdrop-blur-xl">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-[2rem] overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 max-h-[90vh] flex flex-col">
                        <div className="p-7 border-b dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 dark:text-gray-100">Add Staff Member</h2>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">They will only see your store data</p>
                            </div>
                            <button onClick={() => setIsAddModalOpen(false)} className="h-11 w-11 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-rose-100 text-gray-500 hover:text-rose-600 transition-all">
                                <X size={22} />
                            </button>
                        </div>

                        <form onSubmit={handleAddStaff} className="p-7 space-y-5 overflow-y-auto flex-1">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                <div className="relative">
                                    <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                    <input
                                        required
                                        type="text"
                                        value={newName}
                                        onChange={e => setNewName(e.target.value)}
                                        className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                        placeholder="e.g. Ramesh Shrestha"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Official Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                    <input
                                        required
                                        type="email"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                        placeholder="staff@yourstore.com"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Secure Password</label>
                                <div className="relative">
                                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                    <input
                                        required
                                        type={showPassword ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        className="w-full h-14 pl-12 pr-12 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Access Level</label>
                                <div className="relative">
                                    <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                    <select
                                        required
                                        value={newPermissions}
                                        onChange={e => setNewPermissions(e.target.value as any)}
                                        className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-black text-gray-900 dark:text-gray-100 transition-all appearance-none"
                                    >
                                        <option value="read_write">Read & Write Access</option>
                                        <option value="read_only">Read Only Access</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={actionLoading}
                                className="w-full h-14 bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/30 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {actionLoading ? (
                                    <>
                                        <Loader2 className="animate-spin" size={18} /> Creating...
                                    </>
                                ) : (
                                    <>Create Staff Account</>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingProfile && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-gray-950/80 backdrop-blur-xl">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-[2rem] overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 max-h-[90vh] flex flex-col">
                        <div className="p-7 border-b dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 dark:text-gray-100">Edit Staff</h2>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Update name, email or access level</p>
                            </div>
                            <button onClick={() => setEditingProfile(null)} className="h-11 w-11 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-rose-100 text-gray-500 hover:text-rose-600 transition-all">
                                <X size={22} />
                            </button>
                        </div>

                        <form onSubmit={handleEditSave} className="p-7 space-y-5 overflow-y-auto flex-1">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                <input
                                    required
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="w-full h-14 px-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Official Email</label>
                                <input
                                    required
                                    type="email"
                                    value={editEmail}
                                    onChange={e => setEditEmail(e.target.value)}
                                    className="w-full h-14 px-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Access Level</label>
                                <select
                                    value={editPermissions}
                                    onChange={e => setEditPermissions(e.target.value as any)}
                                    className="w-full h-14 px-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/30 rounded-2xl outline-none font-black text-gray-900 dark:text-gray-100 transition-all appearance-none"
                                >
                                    <option value="read_write">Read & Write Access</option>
                                    <option value="read_only">Read Only Access</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                disabled={actionLoading}
                                className="w-full h-14 bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/30 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {actionLoading ? <Loader2 className="animate-spin" size={18} /> : 'Save Changes'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {confirmDelete && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-gray-950/80 backdrop-blur-xl">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[2rem] overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10">
                        <div className="p-7 text-center space-y-4">
                            <div className="h-14 w-14 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-gray-100">Remove Staff Member?</h3>
                            <p className="text-sm text-gray-400 font-medium">
                                {confirmDelete.full_name || 'This staff member'} will lose access to your store immediately.
                            </p>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="flex-1 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 font-black text-gray-500 text-sm transition-all active:scale-95"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={actionLoading}
                                    className="flex-1 h-12 rounded-2xl bg-rose-500 text-white font-black text-sm shadow-lg shadow-rose-500/30 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {actionLoading ? <Loader2 className="animate-spin" size={16} /> : 'Remove'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
