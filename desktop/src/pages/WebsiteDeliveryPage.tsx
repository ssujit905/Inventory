import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase, supabaseWithTimeout, warmUpSupabase } from '../lib/supabase';
import { getVendorId, isVendorMember } from '../lib/vendorHelpers';
import {
    MapPin, Plus, Trash2, Loader2,
    AlertTriangle, CheckCircle, Truck, Info, Pencil, X, Clock
} from 'lucide-react';

interface DeliveryBranch {
    id: number;
    city: string;
    coverage_area: string;
    shipping_fee: number;
    delivery_time: string;
}

export default function WebsiteDeliveryPage() {
    const { profile } = useAuthStore();
    const [branches, setBranches] = useState<DeliveryBranch[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [editingBranch, setEditingBranch] = useState<{ id: number; field: string; value: string } | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [isFormOpen, setIsFormOpen] = useState(false);

    const [newBranch, setNewBranch] = useState({
        city: '',
        coverage_area: '',
        shipping_fee: '' as string | number,
        delivery_time: '2-4 Days'
    });

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
    // can never stay in its "Processing..." state longer than this.
    useEffect(() => {
        if (!saving) return;
        const t = setTimeout(() => {
            setSaving(false);
            showToast('Request timed out. Please check your connection and try again.', 'error');
        }, 40000);
        return () => clearTimeout(t);
    }, [saving]);

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('desktop_delivery_branch_draft');
        const savedFormOpen = localStorage.getItem('desktop_delivery_form_open');
        if (savedFormOpen === 'true') setIsFormOpen(true);
        if (savedDraft) {
            try {
                setNewBranch(JSON.parse(savedDraft));
            } catch (e) { console.error('Delivery draft restore failed'); }
        }
    }, []);

    useEffect(() => {
        if (isFormOpen) {
            localStorage.setItem('desktop_delivery_branch_draft', JSON.stringify(newBranch));
            localStorage.setItem('desktop_delivery_form_open', 'true');
        } else {
            localStorage.removeItem('desktop_delivery_form_open');
        }
    }, [newBranch, isFormOpen]);

    const clearDraft = () => {
        localStorage.removeItem('desktop_delivery_branch_draft');
        localStorage.removeItem('desktop_delivery_form_open');
    };

    useEffect(() => { fetchBranches(); }, []);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchBranches = async () => {
        setLoading(true);
        const vendorId = getVendorId(profile);
        let query = supabase.from('website_delivery_branches').select('*');
        if (vendorId) {
            query = query.eq('vendor_id', vendorId);
        } else {
            query = query.is('vendor_id', null);
        }
        const { data, error } = await query.order('city', { ascending: true });
        if (error) showToast(error.message, 'error');
        else setBranches(data || []);
        setLoading(false);
    };

    const handleAddBranch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBranch.city.trim()) return;
        setSaving(true);

        // Ensure the session/connection is healthy before writing, so we don't
        // hang on a stale connection left over from backgrounding.
        await warmUpSupabase(6000);

        const controller = new AbortController();
        activeSubmitRef.current = controller;

        const branchPayload: any = {
            city: newBranch.city.trim(),
            coverage_area: newBranch.coverage_area.trim(),
            shipping_fee: Number(newBranch.shipping_fee) || 0,
            delivery_time: newBranch.delivery_time.trim(),
            vendor_id: getVendorId(profile)
        };
        const { data, error } = await supabaseWithTimeout(
            supabase
                .from('website_delivery_branches')
                .insert(branchPayload)
                .select()
                .abortSignal(controller.signal)
                .single()
        );

        if (error) {
            if (error?.message === 'NETWORK_TIMEOUT') {
                showToast('Network timeout. Check your connection and try again.', 'error');
            } else {
                showToast(error.message, 'error');
            }
        } else {
            setBranches(prev => [...prev, data].sort((a, b) => a.city.localeCompare(b.city)));
            setNewBranch({ city: '', coverage_area: '', shipping_fee: '', delivery_time: '2-4 Days' });
            clearDraft();
            setIsFormOpen(false);
            showToast('Delivery branch added!');
        }
        if (activeSubmitRef.current === controller) activeSubmitRef.current = null;
        setSaving(false);
    };

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (confirmingDelete !== id) {
            setConfirmingDelete(id);
            setTimeout(() => {
                setConfirmingDelete(prev => prev === id ? null : prev);
            }, 3000);
            return;
        }

        setDeleting(id);
        setConfirmingDelete(null);

        await warmUpSupabase(6000);

        const controller = new AbortController();
        activeSubmitRef.current = controller;
        
        try {
            const { error } = await supabaseWithTimeout(
                supabase
                    .from('website_delivery_branches')
                    .delete()
                    .eq('id', id)
                    .abortSignal(controller.signal)
            );

            if (error) {
                if (error?.message === 'NETWORK_TIMEOUT') {
                    showToast('Network timeout. Check your connection and try again.', 'error');
                } else {
                    showToast(error.message, 'error');
                }
            } else {
                setBranches(prev => prev.filter(b => b.id !== id));
                showToast('Branch deleted successfully');
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                showToast('Delete interrupted when you left the app. Please try again.', 'error');
            } else {
                showToast(err.message || 'An error occurred while deleting', 'error');
            }
        } finally {
            if (activeSubmitRef.current === controller) activeSubmitRef.current = null;
            setDeleting(null);
        }
    };

    const handleUpdateField = async (id: number, field: string, value: any) => {
        const { error } = await supabaseWithTimeout(
            supabase
                .from('website_delivery_branches')
                .update({ [field]: value })
                .eq('id', id)
        );
        if (error) {
            showToast(error?.message === 'NETWORK_TIMEOUT' ? 'Network timeout. Check your connection and try again.' : error.message, 'error');
        } else {
            setBranches(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
            showToast('Field updated');
        }
        setEditingBranch(null);
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <CheckCircle size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="max-w-6xl mx-auto space-y-8 pb-12">
                {/* Page Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Truck size={24} className="text-primary" /> Delivery Branches
                        </h1>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">
                            Manage destination cities, coverage areas & shipping fees
                        </p>
                    </div>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                        <Plus size={18} strokeWidth={3} /> Add New Destination
                    </button>
                </div>

                {/* Branches List Table Style */}
                <div className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 flex items-center gap-2">
                        <MapPin size={16} className="text-gray-400" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Shipping Network History</h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50/30 dark:bg-gray-800/30 text-[10px] uppercase tracking-widest font-black text-gray-400 border-b border-gray-100 dark:border-gray-800">
                                <tr>
                                    <th className="px-8 py-4">City / Area</th>
                                    <th className="px-8 py-4">Estimated Time</th>
                                    <th className="px-8 py-4 text-right">Shipping Fee</th>
                                    <th className="px-8 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-20 text-center">
                                            <Loader2 className="animate-spin text-primary mx-auto" size={32} />
                                        </td>
                                    </tr>
                                ) : branches.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-8 py-20 text-center">
                                            <div className="opacity-20 flex flex-col items-center gap-2">
                                                <Truck size={48} />
                                                <p className="font-black text-xs uppercase tracking-[0.2em]">No Branches Defined</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    branches.map(branch => (
                                        <tr key={branch.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all">
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                                        <MapPin size={18} />
                                                    </div>
                                                    <div>
                                                        <p className="font-black text-gray-900 dark:text-gray-100">{branch.city}</p>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight break-all max-w-[260px]">{branch.coverage_area || 'Standard Coverage'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
                                                    <Clock size={12} className="text-gray-400" />
                                                    <input 
                                                        type="text"
                                                        className="bg-transparent text-[11px] font-black text-gray-700 dark:text-gray-300 focus:outline-none w-24"
                                                        value={editingBranch?.id === branch.id && editingBranch.field === 'delivery_time' ? editingBranch.value : branch.delivery_time}
                                                        onChange={(e) => setEditingBranch({ id: branch.id, field: 'delivery_time', value: e.target.value })}
                                                        onBlur={() => handleUpdateField(branch.id, 'delivery_time', editingBranch?.value)}
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <div className="inline-flex items-center gap-1.5 bg-primary/5 dark:bg-primary/10 rounded-xl px-4 py-2 border border-primary/10">
                                                    <span className="text-[10px] font-black text-primary/60">Rs.</span>
                                                    <input
                                                        type="number"
                                                        className="w-16 bg-transparent text-sm font-black text-primary focus:outline-none text-right"
                                                        value={editingBranch?.id === branch.id && editingBranch.field === 'shipping_fee' ? editingBranch.value : branch.shipping_fee}
                                                        onChange={(e) => setEditingBranch({ id: branch.id, field: 'shipping_fee', value: e.target.value })}
                                                        onBlur={() => handleUpdateField(branch.id, 'shipping_fee', Number(editingBranch?.value))}
                                                    />
                                                    <Pencil size={10} className="text-primary/30" />
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <button
                                                    onClick={(e) => handleDelete(e, branch.id)}
                                                    disabled={deleting === branch.id}
                                                    className={`px-4 py-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest ${
                                                        confirmingDelete === branch.id 
                                                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
                                                        : 'text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                                                    }`}
                                                >
                                                    {deleting === branch.id ? <Loader2 size={14} className="animate-spin" /> : confirmingDelete === branch.id ? "Confirm?" : <Trash2 size={18} />}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Form Modal (Stock In Style) */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-300">
                            <div className="px-10 py-8 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight uppercase">New Destination</h2>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Expanding shipping network</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-12 w-12 rounded-2xl bg-white dark:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-rose-500 transition-all shadow-sm border border-gray-100 dark:border-gray-800">
                                    <X size={24} strokeWidth={2.5} />
                                </button>
                            </div>

                            <form onSubmit={handleAddBranch} className="p-10 space-y-8">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Destination City *</label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                                                <MapPin size={20} />
                                            </div>
                                            <input
                                                required
                                                type="text"
                                                placeholder="e.g. Pokhara"
                                                className="w-full pl-14 pr-5 h-14 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-2xl text-base font-bold text-gray-900 dark:text-gray-100 outline-none transition-all"
                                                value={newBranch.city}
                                                onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Coverage Area</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. City Centre & Major Suburbs"
                                            className="w-full px-5 h-14 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-2xl text-sm font-bold text-gray-900 dark:text-gray-100 outline-none transition-all"
                                            value={newBranch.coverage_area}
                                            onChange={(e) => setNewBranch({ ...newBranch, coverage_area: e.target.value })}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Estimated Time</label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                                                    <Clock size={18} />
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="2-4 Days"
                                                    className="w-full pl-14 pr-5 h-14 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-2xl text-sm font-bold text-gray-900 dark:text-gray-100 outline-none transition-all"
                                                    value={newBranch.delivery_time}
                                                    onChange={(e) => setNewBranch({ ...newBranch, delivery_time: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Shipping Fee (Rs.)</label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                                                    <Truck size={18} />
                                                </div>
                                                <input
                                                    required
                                                    type="number"
                                                    placeholder="150"
                                                    className="w-full pl-14 pr-5 h-14 bg-gray-50 dark:bg-gray-800 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-2xl text-base font-black text-primary outline-none transition-all"
                                                    value={newBranch.shipping_fee}
                                                    onChange={(e) => setNewBranch({ ...newBranch, shipping_fee: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-6">
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="flex-1 h-14 px-8 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="flex-[1.5] h-14 px-8 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="animate-spin mx-auto" /> : "Deploy Destination"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
