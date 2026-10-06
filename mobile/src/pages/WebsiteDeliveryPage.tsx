import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { getVendorId } from '../lib/vendorHelpers';
import { supabase, supabaseWithTimeout, warmUpSupabase } from '../lib/supabase';
import {
    MapPin, Plus, Trash2, Loader2,
    AlertTriangle, CheckCircle, Truck, Pencil, X, Clock
} from 'lucide-react';

interface DeliveryBranch {
    id: number;
    city: string;
    coverage_area: string;
    shipping_fee: number;
    delivery_time: string;
}

const COMMON_DELIVERY_TIMES = ['Same Day', '1-2 Days', '2-4 Days', '3-5 Days', '5-7 Days'];
const COMMON_SHIPPING_FEES = [0, 50, 100, 150, 200];

export default function WebsiteDeliveryPage() {
    const { profile } = useAuthStore();
    const [branches, setBranches] = useState<DeliveryBranch[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);

    // Add / Edit Modal state
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState<DeliveryBranch | null>(null);
    const [formBranch, setFormBranch] = useState({
        city: '',
        coverage_area: '',
        shipping_fee: '' as string | number,
        delivery_time: '2-4 Days'
    });

    // Delete Confirmation state
    const [branchToDelete, setBranchToDelete] = useState<DeliveryBranch | null>(null);

    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Abort controller failsafe on backgrounding WebView
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

    // Failsafe timeout for pending network operations
    useEffect(() => {
        if (!saving && deletingId === null) return;
        const t = setTimeout(() => {
            setSaving(false);
            setDeletingId(null);
            showToast('Request timed out. Please check your connection and try again.', 'error');
        }, 40000);
        return () => clearTimeout(t);
    }, [saving, deletingId]);

    const clearDraft = () => {
        localStorage.removeItem('mobile_delivery_branch_draft');
        localStorage.removeItem('mobile_delivery_form_open');
    };

    // Draft persistence for new branch
    useEffect(() => {
        const savedDraft = localStorage.getItem('mobile_delivery_branch_draft');
        const savedFormOpen = localStorage.getItem('mobile_delivery_form_open');
        if (savedFormOpen === 'true') {
            setIsFormOpen(true);
        }
        if (savedDraft) {
            try {
                setFormBranch(JSON.parse(savedDraft));
            } catch {
                // Ignore draft restore errors
            }
        }
    }, []);

    useEffect(() => {
        if (isFormOpen && !editingBranch) {
            localStorage.setItem('mobile_delivery_branch_draft', JSON.stringify(formBranch));
            localStorage.setItem('mobile_delivery_form_open', 'true');
        } else if (!isFormOpen) {
            localStorage.removeItem('mobile_delivery_form_open');
        }
    }, [formBranch, isFormOpen, editingBranch]);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const fetchBranches = useCallback(async () => {
        setLoading(true);
        try {
            const vendorId = getVendorId(profile);
            let query = supabase.from('website_delivery_branches').select('*');
            if (vendorId) {
                query = query.eq('vendor_id', vendorId);
            } else {
                query = query.is('vendor_id', null);
            }
            const { data, error } = await supabaseWithTimeout(query.order('city', { ascending: true }));
            if (error) throw error;
            setBranches(data || []);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to load delivery branches';
            showToast(message, 'error');
        } finally {
            setLoading(false);
        }
    }, [profile]);

    useEffect(() => {
        fetchBranches();
    }, [fetchBranches]);

    const handleOpenAdd = () => {
        setEditingBranch(null);
        setFormBranch({
            city: '',
            coverage_area: '',
            shipping_fee: '',
            delivery_time: '2-4 Days'
        });
        setIsFormOpen(true);
    };

    const handleOpenEdit = (branch: DeliveryBranch) => {
        setEditingBranch(branch);
        setFormBranch({
            city: branch.city,
            coverage_area: branch.coverage_area || '',
            shipping_fee: branch.shipping_fee,
            delivery_time: branch.delivery_time || '2-4 Days'
        });
        setIsFormOpen(true);
    };

    const handleCloseModal = () => {
        setIsFormOpen(false);
        setEditingBranch(null);
        if (!editingBranch) {
            clearDraft();
        }
    };

    const handleSaveBranch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formBranch.city.trim()) {
            showToast('Please enter a city name', 'error');
            return;
        }

        setSaving(true);
        const branchPayload = {
            city: formBranch.city.trim(),
            coverage_area: formBranch.coverage_area.trim(),
            shipping_fee: Number(formBranch.shipping_fee) || 0,
            delivery_time: formBranch.delivery_time.trim() || '2-4 Days',
            vendor_id: getVendorId(profile)
        };

        await warmUpSupabase(6000);
        const controller = new AbortController();
        activeSubmitRef.current = controller;

        try {
            if (editingBranch) {
                // Update existing branch
                const { data, error } = await supabaseWithTimeout(
                    supabase
                        .from('website_delivery_branches')
                        .update(branchPayload)
                        .eq('id', editingBranch.id)
                        .select()
                        .abortSignal(controller.signal)
                        .single()
                );
                if (error) throw error;
                setBranches(prev => prev.map(b => b.id === editingBranch.id ? data : b));
                showToast(`Updated ${data.city} hub!`);
            } else {
                // Insert new branch
                const { data, error } = await supabaseWithTimeout(
                    supabase
                        .from('website_delivery_branches')
                        .insert(branchPayload)
                        .select()
                        .abortSignal(controller.signal)
                        .single()
                );
                if (error) throw error;
                setBranches(prev => [...prev, data]);
                clearDraft();
                showToast(`Added ${data.city} hub!`);
            }
            handleCloseModal();
        } catch (err: unknown) {
            const errObj = err as { name?: string; message?: string };
            if (errObj?.name === 'AbortError') {
                showToast('Save interrupted. Please try again.', 'error');
            } else if (errObj?.message === 'NETWORK_TIMEOUT') {
                showToast('Network timeout. Check your connection.', 'error');
            } else {
                showToast(errObj?.message || 'Operation failed', 'error');
            }
        } finally {
            if (activeSubmitRef.current === controller) activeSubmitRef.current = null;
            setSaving(false);
        }
    };

    const confirmDeleteBranch = async () => {
        if (!branchToDelete) return;
        const id = branchToDelete.id;
        const cityName = branchToDelete.city;
        setDeletingId(id);

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
            if (error) throw error;
            setBranches(prev => prev.filter(b => b.id !== id));
            showToast(`Removed ${cityName} hub`);
            setBranchToDelete(null);
        } catch (err: unknown) {
            const errObj = err as { name?: string; message?: string };
            if (errObj?.name === 'AbortError') {
                showToast('Interrupted when you left the app.', 'error');
            } else if (errObj?.message === 'NETWORK_TIMEOUT') {
                showToast('Network timeout. Please retry.', 'error');
            } else {
                showToast(errObj?.message || 'Delete failed', 'error');
            }
        } finally {
            if (activeSubmitRef.current === controller) activeSubmitRef.current = null;
            setDeletingId(null);
        }
    };

    // Branches sorted alphabetically
    const sortedBranches = useMemo(() => {
        return [...branches].sort((a, b) => a.city.localeCompare(b.city));
    }, [branches]);

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-4 left-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white text-xs font-bold tracking-wide animate-in fade-in slide-in-from-top duration-300 ${
                    toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
                }`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                        {toast.type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                    </div>
                    <span className="flex-1">{toast.msg}</span>
                    <button onClick={() => setToast(null)} className="p-1 hover:bg-white/10 rounded-lg">
                        <X size={14} />
                    </button>
                </div>
            )}

            <div className="px-4 py-4 space-y-4 max-w-lg mx-auto pb-24">
                {/* Header with Title and Add Button */}
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">Delivery Hubs</h1>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                                {branches.length}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Shipping zones & delivery fees</p>
                    </div>

                    <button
                        onClick={handleOpenAdd}
                        className="h-10 px-4 bg-primary text-white rounded-xl font-bold text-xs text-center shadow-md shadow-primary/25 flex items-center justify-center gap-2 active:scale-95 transition-all shrink-0"
                    >
                        <Plus size={16} strokeWidth={2.5} />
                        <span>Add Hub</span>
                    </button>
                </div>

                {/* Main Content Area */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Loading delivery network...</p>
                    </div>
                ) : sortedBranches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 px-4 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 text-center">
                        <div className="h-12 w-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400 mb-3">
                            <Truck size={24} />
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-1">No delivery hubs configured</h3>
                        <p className="text-xs text-gray-400 max-w-xs mb-4">Add destination cities and delivery charges for your store.</p>
                        <button
                            onClick={handleOpenAdd}
                            className="px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-md shadow-primary/25 inline-flex items-center justify-center gap-2 text-center"
                        >
                            <Plus size={16} />
                            <span>Add First Hub</span>
                        </button>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                        {sortedBranches.map((branch) => {
                            const isFree = Number(branch.shipping_fee) === 0;
                            return (
                                <div
                                    key={branch.id}
                                    className="flex items-center gap-3 px-4 py-3"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">
                                            {branch.city}
                                        </p>
                                        <p className="text-[11px] text-gray-400 truncate">
                                            {isFree ? 'Free' : `Rs. ${branch.shipping_fee}`} · {branch.delivery_time || '2-4 Days'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleOpenEdit(branch)}
                                        aria-label="Edit Hub"
                                        className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center active:scale-95 shrink-0"
                                    >
                                        <Pencil size={14} />
                                    </button>
                                    <button
                                        onClick={() => setBranchToDelete(branch)}
                                        aria-label="Delete Hub"
                                        className="h-8 w-8 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center active:scale-95 shrink-0"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Add / Edit Hub Bottom Sheet Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-t-3xl shadow-2xl border-t border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
                        {/* Drag Handle */}
                        <div className="pt-3 pb-1 flex justify-center">
                            <div className="w-12 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
                        </div>

                        {/* Modal Header */}
                        <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
                            <div>
                                <h2 className="text-base font-extrabold text-gray-900 dark:text-gray-100">
                                    {editingBranch ? `Edit ${editingBranch.city}` : 'New Delivery Hub'}
                                </h2>
                                <p className="text-[11px] text-gray-400">
                                    {editingBranch ? 'Update destination rates & time' : 'Configure a new delivery zone'}
                                </p>
                            </div>
                            <button
                                onClick={handleCloseModal}
                                className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-white"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSaveBranch} className="p-5 overflow-y-auto space-y-4">
                            {/* City Name */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">City / Destination</label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        required
                                        type="text"
                                        placeholder="e.g. Kathmandu, Pokhara, Biratnagar"
                                        value={formBranch.city}
                                        onChange={(e) => setFormBranch({ ...formBranch, city: e.target.value })}
                                        className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            </div>

                            {/* Coverage Details */}
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Coverage Details</label>
                                <div className="relative">
                                    <MapPin size={16} className="absolute left-3.5 top-3 text-gray-400" />
                                    <textarea
                                        rows={2}
                                        placeholder="e.g. Inside Ring Road, Lalitpur, Bhaktapur"
                                        value={formBranch.coverage_area}
                                        onChange={(e) => setFormBranch({ ...formBranch, coverage_area: e.target.value })}
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                                    />
                                </div>
                            </div>

                            {/* Shipping Fee */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Shipping Fee (Rs.)</label>
                                    <span className="text-[10px] text-gray-400">Set 0 for Free Delivery</span>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-primary">Rs.</span>
                                    <input
                                        required
                                        type="number"
                                        inputMode="numeric"
                                        min="0"
                                        placeholder="100"
                                        value={formBranch.shipping_fee}
                                        onChange={(e) => setFormBranch({ ...formBranch, shipping_fee: e.target.value })}
                                        className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm font-black text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                {/* Preset Fee Pills */}
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                    {COMMON_SHIPPING_FEES.map((fee) => (
                                        <button
                                            type="button"
                                            key={fee}
                                            onClick={() => setFormBranch({ ...formBranch, shipping_fee: fee })}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold text-center border transition-colors ${
                                                Number(formBranch.shipping_fee) === fee
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                                            }`}
                                        >
                                            {fee === 0 ? 'Free' : `Rs. ${fee}`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Delivery Time */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Estimated Delivery Time</label>
                                <div className="relative">
                                    <Clock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="2-4 Days"
                                        value={formBranch.delivery_time}
                                        onChange={(e) => setFormBranch({ ...formBranch, delivery_time: e.target.value })}
                                        className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                                {/* Preset Time Pills */}
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                    {COMMON_DELIVERY_TIMES.map((time) => (
                                        <button
                                            type="button"
                                            key={time}
                                            onClick={() => setFormBranch({ ...formBranch, delivery_time: time })}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold text-center border transition-colors ${
                                                formBranch.delivery_time === time
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                                            }`}
                                        >
                                            {time}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Submit and Cancel Buttons */}
                            <div className="flex items-center gap-3 pt-3 pb-6">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="flex-1 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-xs text-center flex items-center justify-center active:scale-95 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-[2] h-12 rounded-xl bg-primary text-white font-bold text-xs text-center shadow-lg shadow-primary/25 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 transition-all"
                                >
                                    {saving ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <span>{editingBranch ? 'Update Hub' : 'Deploy Hub'}</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Sheet */}
            {branchToDelete && (
                <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-gray-800 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto">
                            <Trash2 size={24} />
                        </div>
                        <div className="text-center space-y-1">
                            <h3 className="text-base font-extrabold text-gray-900 dark:text-gray-100">
                                Delete {branchToDelete.city} Hub?
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Customers will no longer be able to select this destination during website checkout.
                            </p>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setBranchToDelete(null)}
                                className="flex-1 h-11 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-xs text-center flex items-center justify-center active:scale-95 transition-all"
                            >
                                Keep Hub
                            </button>
                            <button
                                type="button"
                                disabled={deletingId !== null}
                                onClick={confirmDeleteBranch}
                                className="flex-1 h-11 rounded-xl bg-rose-600 text-white font-bold text-xs text-center shadow-md shadow-rose-600/25 flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {deletingId !== null ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <span>Delete</span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
