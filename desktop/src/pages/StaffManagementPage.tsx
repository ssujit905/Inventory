import { useState, useEffect, useRef } from 'react';
import { supabase, supabaseWithTimeout, warmUpSupabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { UserPlus, Shield, Mail, Edit2, X, AlertCircle, Key, UserCheck, Store, Eye, EyeOff, Save, Phone, MapPin, Calendar, Building2, CreditCard, MessageCircle, Crown, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';

const MASTER_EMAIL = 'ssujit905@gmail.com';

const isMaster = (p: Profile) => p.role === 'admin' && p.email?.toLowerCase() === MASTER_EMAIL;

const roleLabel = (p: Profile) => (p.role === 'vendor' ? 'Vendor' : isMaster(p) ? 'Master Admin' : p.role);

const roleBadgeClass = (p: Profile) => {
    if (p.role === 'admin' && isMaster(p)) {
        return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300';
    }
    if (p.role === 'admin') {
        return 'bg-indigo-50 text-indigo-700 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-300';
    }
    if (p.role === 'vendor') {
        return 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-300';
    }
    return 'bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800 dark:text-gray-300';
};

const roleBadgeIcon = (p: Profile) => {
    if (isMaster(p)) return <Crown size={10} />;
    if (p.role === 'vendor') return <Store size={10} />;
    return <Shield size={10} />;
};

const toggleVendorVerified = async (p: Profile, setProfiles: (fn: (prev: Profile[]) => Profile[]) => void, onMessage: (msg: string, type?: 'success' | 'error') => void) => {
    const next = !p.is_verified;
    const { error } = await supabase
        .from('profiles')
        .update({ is_verified: next })
        .eq('id', p.id);

    if (error) {
        onMessage(error.message, 'error');
        return;
    }
    setProfiles(prev => prev.map(x => (x.id === p.id ? { ...x, is_verified: next } : x)));
    onMessage(next ? `Verified ${p.store_name || p.full_name || 'store'}` : `Verification removed for ${p.store_name || p.full_name || 'store'}`);
};

type Profile = {
    id: string;
    full_name: string | null;
    email?: string | null;
    store_name?: string | null;
    role: 'admin' | 'staff' | 'vendor';
    permissions: 'read_only' | 'read_write';
    created_at: string;
    phone?: string | null;
    whatsapp?: string | null;
    address?: string | null;
    city?: string | null;
    description?: string | null;
    bank_name?: string | null;
    bank_account_holder?: string | null;
    bank_account_number?: string | null;
    bank_branch?: string | null;
    esewa_id?: string | null;
    is_verified?: boolean;
};

export default function StaffManagementPage() {
    const { profile: currentUserProfile } = useAuthStore();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const isReadOnly = currentUserProfile?.permissions === 'read_only';

    // Message State
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // When the app window loses focus / sleeps, in-flight requests can hang and
    // even deadlock the Supabase auth lock. Abort any pending submit as soon as
    // the user returns so the button never spins indefinitely.
    const activeSubmitRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const handleResume = () => {
            activeSubmitRef.current?.abort();
            activeSubmitRef.current = null;
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') handleResume();
        };
        window.addEventListener('focus', handleResume);
        window.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('focus', handleResume);
            window.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    // Final failsafe: regardless of what the underlying promises do, the button
    // can never stay in its loading state longer than this.
    useEffect(() => {
        if (!actionLoading) return;
        const t = setTimeout(() => {
            setActionLoading(false);
            setMessage({ type: 'error', text: 'Request timed out. Please check your connection and try again.' });
        }, 40000);
        return () => clearTimeout(t);
    }, [actionLoading]);

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

    // Details Modal State
    const [detailsProfile, setDetailsProfile] = useState<Profile | null>(null);

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
                .is('vendor_id', null)
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

        // Ensure the session/connection is healthy before writing, so we don't
        // hang on a stale connection left over from backgrounding.
        await warmUpSupabase(6000);

        const controller = new AbortController();
        activeSubmitRef.current = controller;

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

            const { data: authData, error: authError } = await supabaseWithTimeout(
                tempClient.auth.signUp({
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
                })
            );

            if (authError) throw authError;
            if (!authData.user) throw new Error("Personnel creation failed in authentication layer.");

            const { error: profileError } = await supabaseWithTimeout(
                supabase
                    .from('profiles')
                    .upsert({
                        id: authData.user.id,
                        full_name: newName,
                        email: newEmail,
                        store_name: newRole === 'vendor' ? newStoreName : null,
                        role: newRole,
                        permissions: newPermissions
                    })
                    .abortSignal(controller.signal)
            );

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
            if (error?.name === 'AbortError') {
                setMessage({
                    type: 'error',
                    text: 'Submission interrupted when you left the app. Please try again.'
                });
            } else if (error?.message === 'NETWORK_TIMEOUT') {
                setMessage({
                    type: 'error',
                    text: 'Network timeout. Check your connection and try again.'
                });
            } else if (error.message?.includes('already registered')) {
                setMessage({
                    type: 'error',
                    text: 'Email already exists.'
                });
            } else {
                setMessage({ type: 'error', text: error.message });
            }
        } finally {
            if (activeSubmitRef.current === controller) activeSubmitRef.current = null;
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

        // Ensure the session/connection is healthy before writing, so we don't
        // hang on a stale connection left over from backgrounding.
        await warmUpSupabase(6000);

        const controller = new AbortController();
        activeSubmitRef.current = controller;

        try {
            // Update profile info
            const { error: profileError } = await supabaseWithTimeout(
                supabase
                    .from('profiles')
                    .update({
                        full_name: editName,
                        email: editEmail,
                        store_name: editingProfile.role === 'vendor' ? editStoreName : editingProfile.store_name,
                        permissions: editPermissions,
                    })
                    .eq('id', editingProfile.id)
                    .abortSignal(controller.signal)
            );

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
            if (error?.name === 'AbortError') {
                setMessage({ type: 'error', text: 'Save interrupted when you left the app. Please try again.' });
            } else if (error?.message === 'NETWORK_TIMEOUT') {
                setMessage({ type: 'error', text: 'Network timeout. Check your connection and try again.' });
            } else {
                setMessage({ type: 'error', text: error.message });
            }
        } finally {
            if (activeSubmitRef.current === controller) activeSubmitRef.current = null;
            setActionLoading(false);
        }
    };

    const renderDetailRow = (label: string, value?: string | null, Icon?: React.ComponentType<{ size?: number | string }>) =>
        value ? (
            <div className="flex items-center gap-4">
                {Icon && (
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                        <Icon size={16} />
                    </div>
                )}
                <div className="min-w-0">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                    <p className="text-sm font-bold text-gray-800 dark:text-gray-200 break-words">{value}</p>
                </div>
            </div>
        ) : null;

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

                {/* Personnel Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {loading ? (
                        <div className="md:col-span-2 xl:col-span-3 flex flex-col items-center gap-4 py-24">
                            <div className="animate-spin h-10 w-10 border-4 border-primary border-t-transparent rounded-full"></div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading Personnel Registry...</span>
                        </div>
                    ) : profiles.length === 0 ? (
                        <div className="md:col-span-2 xl:col-span-3 py-24 text-center text-gray-400 font-bold uppercase tracking-widest text-sm">
                            No accounts detected
                        </div>
                    ) : profiles.map(p => (
                        <div
                            key={p.id}
                            className="group bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/50 dark:shadow-none p-8 flex flex-col gap-6 hover:-translate-y-1 hover:shadow-2xl hover:shadow-gray-300/50 dark:hover:shadow-none transition-all duration-300"
                        >
                            {/* Avatar + Action Buttons */}
                            <div className="flex items-start justify-between">
                                <div className={`h-16 w-16 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner ${
                                    p.role === 'vendor' ? 'bg-purple-100 text-purple-700' : p.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary'
                                }`}>
                                    {p.role === 'vendor' ? <Store size={28} /> : (p.full_name?.[0] || 'U')}
                                </div>
                                <div className="flex items-center gap-2">
                                    {p.role === 'vendor' && !isReadOnly && (
                                        <button
                                            onClick={() => toggleVendorVerified(p, setProfiles, (msg, type) => setMessage({ type: type || 'success', text: msg }))}
                                            title={p.is_verified ? 'Remove verified badge' : 'Verify this vendor store'}
                                            aria-label={p.is_verified ? 'Remove verified badge' : 'Verify this vendor store'}
                                            className={`h-11 w-11 flex items-center justify-center rounded-xl transition-all active:scale-90 ${
                                                p.is_verified
                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400'
                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:bg-emerald-50 hover:text-emerald-600'
                                            }`}
                                        >
                                            <ShieldCheck size={18} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setDetailsProfile(p)}
                                        title="View all details"
                                        aria-label="View all details"
                                        className="h-11 w-11 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:bg-primary hover:text-white transition-all active:scale-90"
                                    >
                                        <Eye size={18} />
                                    </button>
                                    {!isReadOnly && (
                                        <button
                                            onClick={() => openEditModal(p)}
                                            title="Edit account"
                                            aria-label="Edit account"
                                            className="h-11 w-11 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 hover:bg-primary hover:text-white transition-all active:scale-90"
                                        >
                                            <Edit2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Minimal Identity Info */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-black text-lg text-gray-900 dark:text-gray-100 truncate">{p.full_name || 'Anonymous User'}</span>
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm ${roleBadgeClass(p)}`}>
                                        {roleBadgeIcon(p)} {roleLabel(p)}
                                    </span>
                                </div>
                                {p.store_name ? (
                                    <span className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-extrabold px-2.5 py-1 rounded-md bg-purple-50 text-purple-700 border border-purple-100 dark:bg-purple-950/30 dark:border-purple-800 w-fit">
                                            <Store size={11} className="inline mr-1 -mt-0.5" />
                                            {p.store_name}
                                        </span>
                                        {p.is_verified && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
                                                <ShieldCheck size={10} /> Verified
                                            </span>
                                        )}
                                    </span>
                                ) : (
                                    <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5 truncate">
                                        <Mail size={12} className="shrink-0" />
                                        {p.email || 'No email stored'}
                                    </span>
                                )}
                            </div>

                            {/* Footer: Enlisted Date */}
                            <div className="mt-auto flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-5">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                    p.permissions === 'read_write'
                                        ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300'
                                        : 'bg-orange-50 text-orange-700 border border-orange-100 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300'
                                }`}>
                                    <UserCheck size={10} /> {p.permissions === 'read_write' ? 'Read & Write' : 'Read Only'}
                                </span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                    {format(new Date(p.created_at), 'dd MMM yyyy')}
                                </span>
                            </div>
                        </div>
                    ))}
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

                {/* Details Modal */}
                {detailsProfile && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-950/80 backdrop-blur-xl animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-[2.5rem] shadow-3xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/10 max-h-[85vh] flex flex-col">
                            <div className="p-8 border-b dark:border-gray-800 flex items-center gap-5 bg-gradient-to-br from-primary/5 to-transparent">
                                <div className={`h-16 w-16 shrink-0 rounded-2xl flex items-center justify-center font-black text-2xl shadow-inner ${
                                    detailsProfile.role === 'vendor' ? 'bg-purple-100 text-purple-700' : detailsProfile.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary'
                                }`}>
                                    {detailsProfile.role === 'vendor' ? <Store size={28} /> : (detailsProfile.full_name?.[0] || 'U')}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 font-outfit truncate">
                                        {detailsProfile.full_name || 'Anonymous User'}
                                    </h2>
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${roleBadgeClass(detailsProfile)}`}>
                                            {roleBadgeIcon(detailsProfile)} {roleLabel(detailsProfile)}
                                        </span>
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                            detailsProfile.permissions === 'read_write'
                                                ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300'
                                                : 'bg-orange-50 text-orange-700 border border-orange-100 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300'
                                        }`}>
                                            <UserCheck size={10} /> {detailsProfile.permissions === 'read_write' ? 'Read & Write' : 'Read Only'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setDetailsProfile(null)}
                                    className="h-12 w-12 shrink-0 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-rose-100 text-gray-500 hover:text-rose-600 transition-all"
                                >
                                    <X size={22} />
                                </button>
                            </div>

                            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                                <div className="space-y-5">
                                    {renderDetailRow('Email Address', detailsProfile.email, Mail)}
                                    {renderDetailRow('Store Name', detailsProfile.store_name, Store)}
                                    {detailsProfile.role === 'vendor' && (
                                        <div className="flex items-center gap-4">
                                            <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${
                                                detailsProfile.is_verified ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                                            }`}>
                                                <ShieldCheck size={16} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Verification</p>
                                                <p className={`text-sm font-bold ${detailsProfile.is_verified ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                                                    {detailsProfile.is_verified ? 'Verified Store' : 'Not Verified'}
                                                </p>
                                            </div>
                                            {!isReadOnly && (
                                                <button
                                                    onClick={() => {
                                                        toggleVendorVerified(detailsProfile, setProfiles, (msg, type) => setMessage({ type: type || 'success', text: msg }));
                                                        setDetailsProfile({ ...detailsProfile, is_verified: !detailsProfile.is_verified });
                                                    }}
                                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                        detailsProfile.is_verified
                                                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-rose-50 hover:text-rose-600'
                                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 hover:bg-emerald-100'
                                                    }`}
                                                >
                                                    {detailsProfile.is_verified ? 'Unverify' : 'Verify'}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {renderDetailRow('Phone', detailsProfile.phone, Phone)}
                                    {renderDetailRow('WhatsApp', detailsProfile.whatsapp, MessageCircle)}
                                    {renderDetailRow('City', detailsProfile.city, MapPin)}
                                    {renderDetailRow('Address', detailsProfile.address, MapPin)}
                                    {renderDetailRow('Description', detailsProfile.description)}
                                </div>

                                {(detailsProfile.bank_name || detailsProfile.bank_account_holder || detailsProfile.bank_account_number || detailsProfile.bank_branch || detailsProfile.esewa_id) && (
                                    <>
                                        <div className="flex items-center gap-3 pt-2">
                                            <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bank & Payment</span>
                                            <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
                                        </div>
                                        <div className="space-y-5">
                                            {renderDetailRow('Bank Name', detailsProfile.bank_name, Building2)}
                                            {renderDetailRow('Account Holder', detailsProfile.bank_account_holder, CreditCard)}
                                            {renderDetailRow('Account Number', detailsProfile.bank_account_number, CreditCard)}
                                            {renderDetailRow('Branch', detailsProfile.bank_branch, MapPin)}
                                            {renderDetailRow('eSewa ID', detailsProfile.esewa_id, CreditCard)}
                                        </div>
                                    </>
                                )}

                                <div className="flex items-center gap-3 pt-2">
                                    <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Registry</span>
                                    <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
                                </div>
                                <div className="space-y-5">
                                    {renderDetailRow('User ID', detailsProfile.id, Key)}
                                    {renderDetailRow('Enlisted', format(new Date(detailsProfile.created_at), 'dd MMM yyyy, h:mm a'), Calendar)}
                                </div>

                                {!isReadOnly && (
                                    <button
                                        onClick={() => {
                                            openEditModal(detailsProfile);
                                            setDetailsProfile(null);
                                        }}
                                        className="w-full h-14 bg-primary text-white font-black text-sm rounded-2xl shadow-lg shadow-primary/30 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-3"
                                    >
                                        <Edit2 size={16} />
                                        Edit Account
                                    </button>
                                )}
                            </div>
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
