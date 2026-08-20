import { useState, useEffect, useRef } from 'react';
import { supabase, supabaseWithTimeout, warmUpSupabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { UserPlus, Shield, Mail, Edit2, X, AlertCircle, Key, UserCheck, Users, Store, Eye, EyeOff, Save, Phone, MapPin, Calendar, Building2, CreditCard, MessageCircle, Crown, ShieldCheck } from 'lucide-react';
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
    plan?: string | null;
    is_verified?: boolean;
};

export default function StaffManagementPage() {
    const { profile: currentUserProfile } = useAuthStore();
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const isReadOnly = currentUserProfile?.permissions === 'read_only';

    // When the WebView is backgrounded, in-flight requests can hang forever.
    // Abort any pending submit as soon as the user returns so the button never spins indefinitely.
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
    // can never stay in its "Processing..." state longer than this.
    useEffect(() => {
        if (!actionLoading) return;
        const t = setTimeout(() => {
            setActionLoading(false);
            setMessage({ type: 'error', text: 'Request timed out. Please check your connection and try again.' });
        }, 40000);
        return () => clearTimeout(t);
    }, [actionLoading]);

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
    const [newPlan, setNewPlan] = useState<'basic' | 'full'>('full');
    const [showPassword, setShowPassword] = useState(false);

    // Edit Modal State
    const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editStoreName, setEditStoreName] = useState('');
    const [editPermissions, setEditPermissions] = useState<'read_only' | 'read_write'>('read_write');
    const [editPlan, setEditPlan] = useState<'basic' | 'full'>('full');
    const [editNewPassword, setEditNewPassword] = useState('');
    const [showEditPassword, setShowEditPassword] = useState(false);

    // Details Modal State
    const [detailsProfile, setDetailsProfile] = useState<Profile | null>(null);

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('mobile_staff_draft');
        const savedFormOpen = localStorage.getItem('mobile_staff_form_open');

        if (savedFormOpen === 'true') setIsAddModalOpen(true);
        if (savedDraft) {
            try {
                const d = JSON.parse(savedDraft);
                setNewName(d.newName || '');
                setNewEmail(d.newEmail || '');
                setNewRole(d.newRole || 'staff');
                setNewPermissions(d.newPermissions || 'read_only');
                setNewPlan(d.newPlan || 'full');
            } catch (e) { console.error('Mobile Staff draft restore failed'); }
        }
    }, []);

    useEffect(() => {
        if (isAddModalOpen) {
            // Never persist a staff password in browser storage.
            const draft = { newName, newEmail, newRole, newPermissions, newPlan };
            localStorage.setItem('mobile_staff_draft', JSON.stringify(draft));
            localStorage.setItem('mobile_staff_form_open', 'true');
        } else {
            localStorage.removeItem('mobile_staff_form_open');
        }
    }, [newName, newEmail, newPassword, newRole, newPermissions, newPlan, isAddModalOpen]);

    const clearDraft = () => {
        localStorage.removeItem('mobile_staff_draft');
        localStorage.removeItem('mobile_staff_form_open');
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

        // Ensure the session/connection is healthy before writing, so we don't
        // hang on a stale connection left over from backgrounding.
        await warmUpSupabase(6000);

        const controller = new AbortController();
        activeSubmitRef.current = controller;

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
                            store_name: newRole === 'vendor' ? newStoreName : null,
                            role: newRole,
                            permissions: newPermissions,
                            plan: newRole === 'vendor' ? newPlan : null
                    }
                }
            });

            if (authError) throw authError;
            if (!authData.user) throw new Error("Personnel creation failed in authentication layer.");

            // 2. Insert Profile Entry manually via the admin's session
            const { error: profileError } = await supabaseWithTimeout(
                supabase
                    .from('profiles')
                    .upsert({
                        id: authData.user.id,
                        full_name: newName,
                        email: newEmail,
                        store_name: newRole === 'vendor' ? newStoreName : null,
                        role: newRole,
                        permissions: newPermissions,
                        plan: newRole === 'vendor' ? newPlan : null
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

            await supabaseWithTimeout(fetchProfiles());
            clearDraft();
            setIsAddModalOpen(false);

            // Clear Form
            setNewName('');
            setNewStoreName('');
            setNewEmail('');
            setNewPassword('');
            setNewRole('staff');
            setNewPermissions('read_only');

        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setMessage({ type: 'error', text: 'Submission interrupted when you left the app. Please try again.' });
            } else if (error?.message === 'NETWORK_TIMEOUT') {
                setMessage({ type: 'error', text: 'Network timeout. Check your connection and try again.' });
            } else if (error.message?.includes('already registered')) {
                setMessage({
                    type: 'error',
                    text: 'Email already exists. Update their role in the list below if they are already registered.'
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
        setEditPlan(p.plan === 'basic' ? 'basic' : 'full');
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
            const { error: profileError } = await supabaseWithTimeout(
                supabase
                    .from('profiles')
                    .update({
                        full_name: editName,
                        email: editEmail,
                        store_name: editingProfile.role === 'vendor' ? editStoreName : editingProfile.store_name,
                        permissions: editPermissions,
                        plan: editingProfile.role === 'vendor' ? editPlan : editingProfile.plan,
                    })
                    .eq('id', editingProfile.id)
                    .abortSignal(controller.signal)
            );

            if (profileError) throw profileError;

            setMessage({
                type: 'success',
                text: `Profile updated for ${editName}.`
            });

            await supabaseWithTimeout(fetchProfiles());
            setEditingProfile(null);
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setMessage({ type: 'error', text: 'Submission interrupted when you left the app. Please try again.' });
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
        <DashboardLayout role={currentUserProfile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Staff & Vendor Management</h1>
                        <p className="text-gray-400 font-medium text-xs">Manage system admins, staff access, and vendor partners.</p>
                    </div>
                    <button
                        onClick={() => !isReadOnly && setIsAddModalOpen(true)}
                        disabled={isReadOnly}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 w-full sm:w-auto ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'}`}
                    >
                        <UserPlus size={16} strokeWidth={2.5} />
                        {isReadOnly ? 'Read Only Mode' : 'Add New Account'}
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
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Account Registry</h3>
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
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No accounts found</p>
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
                                    <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${roleBadgeClass(p)}`}>
                                            {roleBadgeIcon(p)} {roleLabel(p)}
                                        </div>
                                    {p.role === 'vendor' && (
                                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${p.plan === 'basic' ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'}`}>
                                            {p.plan === 'basic' ? 'Basic' : 'Full'} Plan
                                        </span>
                                    )}
                                </div>

                                {/* Main Info Section */}
                                <div className="px-3.5 pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center font-black text-lg border border-gray-100 dark:border-gray-700 ${
                                            p.role === 'vendor' ? 'bg-purple-50 text-purple-600' : 'bg-gray-50 dark:bg-gray-800 text-primary'
                                        }`}>
                                            {p.role === 'vendor' ? <Store size={20} /> : (p.full_name?.[0] || 'U')}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{p.full_name || 'Anonymous User'}</h3>
                                                {p.store_name && (
                                                    <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-purple-50 text-purple-700">
                                                        {p.store_name}
                                                    </span>
                                                )}
                                                {p.is_verified && (
                                                    <span className="inline-flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                        <ShieldCheck size={9} /> Verified
                                                    </span>
                                                )}
                                            </div>
                                            {p.email && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <Mail size={9} className="text-gray-300" />
                                                    <span className="text-[10px] text-gray-400 font-medium">{p.email}</span>
                                                </div>
                                            )}
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
                                    {p.role === 'vendor' && !isReadOnly && (
                                        <button
                                            onClick={() => toggleVendorVerified(p, setProfiles, (msg, type) => setMessage({ type: type || 'success', text: msg }))}
                                            title={p.is_verified ? 'Remove verified badge' : 'Verify this vendor store'}
                                            className={`px-3 py-2.5 flex items-center gap-1.5 text-[10px] font-black uppercase transition-all border-l border-gray-50 dark:border-gray-800 ${
                                                p.is_verified
                                                    ? 'text-emerald-600 bg-emerald-50/50 hover:bg-emerald-50'
                                                    : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-500/5'
                                            }`}
                                        >
                                            <ShieldCheck size={12} />
                                            {p.is_verified ? 'Verified' : 'Verify'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setDetailsProfile(p)}
                                        title="View all details"
                                        className="px-3 py-2.5 flex items-center gap-1.5 text-[10px] font-black uppercase text-gray-500 hover:text-primary hover:bg-primary/5 transition-all border-l border-gray-50 dark:border-gray-800"
                                    >
                                        <Eye size={12} />
                                        View
                                    </button>
                                    {!isReadOnly && (
                                        <button
                                            onClick={() => openEditModal(p)}
                                            className="px-4 py-2.5 flex items-center gap-1.5 text-[10px] font-black uppercase text-gray-500 hover:text-primary hover:bg-primary/5 transition-all border-l border-gray-50 dark:border-gray-800"
                                        >
                                            <Edit2 size={12} />
                                            Edit
                                        </button>
                                    )}
                                    <div className="flex-1 px-3.5 py-2.5 text-right border-l border-gray-50 dark:border-gray-800">
                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Status</p>
                                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-tight mt-0.5">Active</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Add Staff Modal */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800 max-h-[92svh] flex flex-col">
                            <div className="px-5 py-4 sm:px-8 sm:py-6 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50 flex-shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Add New Account</h2>
                                    <p className="text-xs text-gray-400 font-medium">Create credentials for Staff, Admin, or Vendor</p>
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
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.1em] ml-1">Role / Rank</label>
                                            <select
                                                required
                                                value={newRole}
                                                onChange={e => setNewRole(e.target.value as any)}
                                                className="w-full h-14 px-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 appearance-none"
                                            >
                                                <option value="staff">Staff</option>
                                                <option value="vendor">Vendor Partner</option>
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
                                                <option value="read_write">Read & Write</option>
                                                <option value="read_only">Read Only</option>
                                            </select>
                                        </div>
                                    </div>

                                    {newRole === 'vendor' && (
                                        <div className="space-y-1.5 animate-in fade-in duration-200">
                                            <label className="text-[10px] font-black text-purple-600 uppercase tracking-[0.1em] ml-1">Vendor Store Name *</label>
                                            <div className="relative group">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-purple-400">
                                                    <Store size={18} />
                                                </div>
                                                <input
                                                    required={newRole === 'vendor'}
                                                    type="text"
                                                    value={newStoreName}
                                                    onChange={e => setNewStoreName(e.target.value)}
                                                    className="w-full h-14 pl-12 pr-5 bg-purple-50/50 dark:bg-purple-950/20 border-2 border-purple-200 dark:border-purple-800 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                    placeholder="e.g. Himalayan Fashion Hub"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {newRole === 'vendor' && (
                                        <div className="space-y-1.5 animate-in fade-in duration-200">
                                            <label className="text-[10px] font-black text-purple-600 uppercase tracking-[0.1em] ml-1">Vendor Plan</label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setNewPlan('basic')}
                                                    className={`text-left p-4 rounded-2xl border-2 transition-all ${newPlan === 'basic' ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                                                >
                                                    <p className={`font-black text-sm ${newPlan === 'basic' ? 'text-primary' : 'text-gray-900 dark:text-gray-100'}`}>Basic</p>
                                                    <p className="text-[9px] font-bold text-gray-400 mt-1 leading-relaxed">Core selling menus only.</p>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNewPlan('full')}
                                                    className={`text-left p-4 rounded-2xl border-2 transition-all ${newPlan === 'full' ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                                                >
                                                    <p className={`font-black text-sm ${newPlan === 'full' ? 'text-primary' : 'text-gray-900 dark:text-gray-100'}`}>Full</p>
                                                    <p className="text-[9px] font-bold text-gray-400 mt-1 leading-relaxed">All menus including finance.</p>
                                                </button>
                                            </div>
                                        </div>
                                    )}

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

                {/* Edit Profile Modal */}
                {editingProfile && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800 max-h-[92svh] flex flex-col">
                            <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                                <div>
                                    <h2 className="text-base font-black text-gray-900 dark:text-gray-100">Edit Account</h2>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                        {editingProfile.role === 'vendor' ? 'Vendor Partner' : editingProfile.role}
                                    </p>
                                </div>
                                <button onClick={() => setEditingProfile(null)} className="h-9 w-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-rose-100 hover:text-rose-600 transition-all">
                                    <X size={18} />
                                </button>
                            </div>

                            <form onSubmit={handleEditSave} className="p-5 space-y-4 overflow-y-auto flex-1">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                                    <div className="relative">
                                        <Edit2 className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <input required type="text" value={editName} onChange={e => setEditName(e.target.value)}
                                            className="w-full h-14 pl-11 pr-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all" />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                                            className="w-full h-14 pl-11 pr-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                            placeholder="email@example.com" />
                                    </div>
                                </div>

                                {editingProfile.role === 'vendor' && (
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest ml-1">Store Name</label>
                                        <div className="relative">
                                            <Store className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400" />
                                            <input type="text" value={editStoreName} onChange={e => setEditStoreName(e.target.value)}
                                                className="w-full h-14 pl-11 pr-4 bg-purple-50/50 dark:bg-purple-950/20 border-2 border-purple-200 dark:border-purple-800 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                                placeholder="Store name" />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Access Level</label>
                                    <div className="relative">
                                        <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <select value={editPermissions} onChange={e => setEditPermissions(e.target.value as any)}
                                            className="w-full h-14 pl-11 pr-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 rounded-2xl outline-none font-black text-gray-900 dark:text-gray-100 transition-all appearance-none">
                                            <option value="read_write">Read & Write Access</option>
                                            <option value="read_only">Read Only Access</option>
                                        </select>
                                    </div>
                                </div>

                                {editingProfile.role === 'vendor' && (
                                    <div className="space-y-1.5 animate-in fade-in">
                                        <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest ml-1">Vendor Plan</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button type="button" onClick={() => setEditPlan('basic')}
                                                className={`text-left p-4 rounded-2xl border-2 transition-all ${editPlan === 'basic' ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                                                <p className={`font-black text-sm ${editPlan === 'basic' ? 'text-primary' : 'text-gray-900 dark:text-gray-100'}`}>Basic</p>
                                                <p className="text-[9px] font-bold text-gray-400 mt-1 leading-relaxed">Core selling menus only.</p>
                                            </button>
                                            <button type="button" onClick={() => setEditPlan('full')}
                                                className={`text-left p-4 rounded-2xl border-2 transition-all ${editPlan === 'full' ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                                                <p className={`font-black text-sm ${editPlan === 'full' ? 'text-primary' : 'text-gray-900 dark:text-gray-100'}`}>Full</p>
                                                <p className="text-[9px] font-bold text-gray-400 mt-1 leading-relaxed">All menus including finance.</p>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">New Password <span className="text-gray-300 normal-case font-medium">(leave blank to keep)</span></label>
                                    <div className="relative">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                                        <input type={showEditPassword ? 'text' : 'password'} value={editNewPassword} onChange={e => setEditNewPassword(e.target.value)}
                                            className="w-full h-14 pl-11 pr-14 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/20 rounded-2xl outline-none font-bold text-gray-900 dark:text-gray-100 transition-all"
                                            placeholder="New password (optional)" />
                                        <button type="button" onClick={() => setShowEditPassword(!showEditPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary">
                                            {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-amber-600 ml-1">Password reset requires Supabase Admin access.</p>
                                </div>

                                <button type="submit" disabled={actionLoading}
                                    className="w-full h-14 bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                    {actionLoading ? 'Saving...' : <><Save size={16} />Save Changes</>}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* Details Modal */}
                {detailsProfile && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800 max-h-[92svh] flex flex-col">
                            <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50 flex-shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center font-black text-lg ${
                                        detailsProfile.role === 'vendor' ? 'bg-purple-100 text-purple-700' : detailsProfile.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary'
                                    }`}>
                                        {detailsProfile.role === 'vendor' ? <Store size={20} /> : (detailsProfile.full_name?.[0] || 'U')}
                                    </div>
                                    <div>
                                        <h2 className="text-base font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                            {detailsProfile.full_name || 'Anonymous User'}
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${roleBadgeClass(detailsProfile)}`}>
                                                {roleBadgeIcon(detailsProfile)} {roleLabel(detailsProfile)}
                                            </span>
                                        </h2>
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest mt-0.5 ${
                                            detailsProfile.permissions === 'read_write'
                                                ? 'bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300'
                                                : 'bg-orange-50 text-orange-700 border border-orange-100 dark:bg-orange-950/30 dark:border-orange-800 dark:text-orange-300'
                                        }`}>
                                            <UserCheck size={9} /> {detailsProfile.permissions === 'read_write' ? 'Read & Write' : 'Read Only'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setDetailsProfile(null)}
                                    className="h-9 w-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-rose-100 hover:text-rose-600 transition-all"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-5 space-y-5 overflow-y-auto flex-1">
                                {detailsProfile.role === 'vendor' && (
                                    <div className="flex items-center justify-between rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${
                                                detailsProfile.is_verified ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                                            }`}>
                                                <ShieldCheck size={16} />
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Verification</p>
                                                <p className={`text-xs font-bold ${detailsProfile.is_verified ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                                                    {detailsProfile.is_verified ? 'Verified Store' : 'Not Verified'}
                                                </p>
                                            </div>
                                        </div>
                                        {!isReadOnly && (
                                            <button
                                                onClick={() => {
                                                    toggleVendorVerified(detailsProfile, setProfiles, (msg, type) => setMessage({ type: type || 'success', text: msg }));
                                                    setDetailsProfile({ ...detailsProfile, is_verified: !detailsProfile.is_verified });
                                                }}
                                                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
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

                                <div className="space-y-4">
                                    {renderDetailRow('Email Address', detailsProfile.email, Mail)}
                                    {renderDetailRow('Store Name', detailsProfile.store_name, Store)}
                                    {renderDetailRow('Phone', detailsProfile.phone, Phone)}
                                    {renderDetailRow('WhatsApp', detailsProfile.whatsapp, MessageCircle)}
                                    {renderDetailRow('City', detailsProfile.city, MapPin)}
                                    {renderDetailRow('Address', detailsProfile.address, MapPin)}
                                    {renderDetailRow('Description', detailsProfile.description)}
                                </div>

                                {(detailsProfile.bank_name || detailsProfile.bank_account_holder || detailsProfile.bank_account_number || detailsProfile.bank_branch || detailsProfile.esewa_id) && (
                                    <>
                                        <div className="flex items-center gap-3 pt-1">
                                            <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Bank & Payment</span>
                                            <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
                                        </div>
                                        <div className="space-y-4">
                                            {renderDetailRow('Bank Name', detailsProfile.bank_name, Building2)}
                                            {renderDetailRow('Account Holder', detailsProfile.bank_account_holder, CreditCard)}
                                            {renderDetailRow('Account Number', detailsProfile.bank_account_number, CreditCard)}
                                            {renderDetailRow('Branch', detailsProfile.bank_branch, MapPin)}
                                            {renderDetailRow('eSewa ID', detailsProfile.esewa_id, CreditCard)}
                                        </div>
                                    </>
                                )}

                                <div className="flex items-center gap-3 pt-1">
                                    <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Registry</span>
                                    <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800"></div>
                                </div>
                                <div className="space-y-4">
                                    {renderDetailRow('User ID', detailsProfile.id, Key)}
                                    {renderDetailRow('Enlisted', format(new Date(detailsProfile.created_at), 'dd MMM yyyy, h:mm a'), Calendar)}
                                </div>

                                {!isReadOnly && (
                                    <button
                                        onClick={() => {
                                            openEditModal(detailsProfile);
                                            setDetailsProfile(null);
                                        }}
                                        className="w-full h-12 bg-primary text-white font-black text-sm rounded-2xl shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        <Edit2 size={15} />
                                        Edit Account
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
