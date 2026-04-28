import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import {
    MapPin, Plus, Trash2, Loader2,
    AlertTriangle, CheckCircle, Truck, Info, Pencil
} from 'lucide-react';

interface DeliveryBranch {
    id: number;
    city: string;
    coverage_area: string;
    shipping_fee: number;
}

export default function WebsiteDeliveryPage() {
    const { profile } = useAuthStore();
    const [branches, setBranches] = useState<DeliveryBranch[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<number | null>(null);
    const [editingFee, setEditingFee] = useState<{ id: number; value: string } | null>(null);
    const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const [newBranch, setNewBranch] = useState({
        city: '',
        coverage_area: '',
        shipping_fee: '' as string | number
    });

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('delivery_branch_draft');
        if (savedDraft) {
            try {
                setNewBranch(JSON.parse(savedDraft));
            } catch (e) { console.error('Delivery draft restore failed'); }
        }
    }, []);

    useEffect(() => {
        // Only save if there's actual content to avoid saving empty resets
        if (newBranch.city || newBranch.coverage_area || newBranch.shipping_fee) {
            localStorage.setItem('delivery_branch_draft', JSON.stringify(newBranch));
        }
    }, [newBranch]);

    const clearDraft = () => {
        localStorage.removeItem('delivery_branch_draft');
    };

    useEffect(() => { fetchBranches(); }, []);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchBranches = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('website_delivery_branches')
            .select('*')
            .order('city', { ascending: true });
        if (error) showToast(error.message, 'error');
        else setBranches(data || []);
        setLoading(false);
    };

    const handleAddBranch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBranch.city.trim()) return;
        setSaving(true);
        const { data, error } = await supabase
            .from('website_delivery_branches')
            .insert({
                city: newBranch.city.trim(),
                coverage_area: newBranch.coverage_area.trim(),
                shipping_fee: Number(newBranch.shipping_fee) || 0
            })
            .select()
            .single();

        if (error) {
            showToast(error.message, 'error');
        } else {
            setBranches(prev => [...prev, data].sort((a, b) => a.city.localeCompare(b.city)));
            setNewBranch({ city: '', coverage_area: '', shipping_fee: '' });
            clearDraft();
            showToast('Delivery branch added!');
        }
        setSaving(false);
    };

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (confirmingDelete !== id) {
            setConfirmingDelete(id);
            // Auto-cancel after 3 seconds if not clicked again
            setTimeout(() => {
                setConfirmingDelete(prev => prev === id ? null : prev);
            }, 3000);
            return;
        }

        setDeleting(id);
        setConfirmingDelete(null);
        
        try {
            const { error } = await supabase
                .from('website_delivery_branches')
                .delete()
                .eq('id', id);

            if (error) {
                showToast(error.message, 'error');
            } else {
                setBranches(prev => prev.filter(b => b.id !== id));
                showToast('Branch deleted successfully');
            }
        } catch (err: any) {
            showToast(err.message || 'An error occurred while deleting', 'error');
        } finally {
            setDeleting(null);
        }
    };

    // Only save fee on blur to avoid hammering DB on every keystroke
    const handleFeeBlur = async (id: number) => {
        if (!editingFee || editingFee.id !== id) return;
        const fee = Number(editingFee.value);
        const { error } = await supabase
            .from('website_delivery_branches')
            .update({ shipping_fee: fee })
            .eq('id', id);
        if (error) {
            showToast(error.message, 'error');
        } else {
            setBranches(prev => prev.map(b => b.id === id ? { ...b, shipping_fee: fee } : b));
            showToast('Shipping fee saved');
        }
        setEditingFee(null);
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-[11px] font-black uppercase tracking-widest animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <CheckCircle size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Delivery Branches</h1>
                        <p className="text-gray-400 font-medium text-xs uppercase tracking-widest">Manage destination cities, coverage areas & fees.</p>
                    </div>
                    <div className="flex items-center gap-3 bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm w-full md:w-auto">
                        <div className="h-9 w-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                            <Truck size={18} />
                        </div>
                        <div>
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Active Hubs</p>
                            <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{branches.length} Locations</p>
                        </div>
                    </div>
                </div>

                {/* Add New Hub Form */}
                <form onSubmit={handleAddBranch} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm space-y-5">
                    <div className="flex items-center gap-2 mb-1">
                        <Plus size={14} strokeWidth={3} className="text-primary" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Add Delivery Hub</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">City Name</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. Pokhara"
                                className="w-full h-11 px-4 rounded-xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 focus:border-primary/30 focus:outline-none text-xs font-bold transition-all"
                                value={newBranch.city}
                                onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">Coverage Area</label>
                            <input
                                type="text"
                                placeholder="e.g. City & Suburbs"
                                className="w-full h-11 px-4 rounded-xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 focus:border-primary/30 focus:outline-none text-xs font-bold transition-all"
                                value={newBranch.coverage_area}
                                onChange={(e) => setNewBranch({ ...newBranch, coverage_area: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">Fee (Rs.)</label>
                            <div className="flex gap-2">
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    className="w-24 h-11 px-4 rounded-xl bg-gray-50/50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 focus:border-primary/30 focus:outline-none text-xs font-bold transition-all"
                                    value={newBranch.shipping_fee}
                                    onChange={(e) => setNewBranch({ ...newBranch, shipping_fee: e.target.value })}
                                />
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 bg-primary text-white rounded-xl px-4 text-[11px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                                >
                                    {saving ? <Loader2 size={16} className="animate-spin" /> : 'Register'}
                                </button>
                            </div>
                        </div>
                    </div>
                </form>

                {/* Hub Stream */}
                <div className="flex items-center gap-2 px-1">
                    <MapPin size={14} strokeWidth={1.5} className="text-gray-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Active Destinations</h3>
                    <span className="ml-auto text-[10px] font-bold text-gray-300">{branches.length} locations</span>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Syncing Hubs...</p>
                    </div>
                ) : branches.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <div className="flex flex-col items-center gap-3 opacity-30">
                            <Truck size={40} strokeWidth={1.5} />
                            <p className="text-xs font-bold uppercase tracking-widest">No hubs configured</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                            {branches.map((branch, idx) => (
                                <div key={branch.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between shadow-sm active:scale-[0.99] transition-all">
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <span className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-[11px] font-black">
                                            {idx + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{branch.city}</p>
                                            <p className="text-[10px] font-medium text-gray-400 truncate mt-0.5">{branch.coverage_area || 'Standard City Coverage'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 rounded-lg border border-gray-100 dark:border-gray-700">
                                            <span className="text-[10px] font-bold text-gray-400">Rs.</span>
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-14 bg-transparent text-xs font-black text-primary focus:outline-none text-right"
                                                value={editingFee?.id === branch.id ? editingFee.value : branch.shipping_fee}
                                                onChange={(e) => setEditingFee({ id: branch.id, value: e.target.value })}
                                                onBlur={() => handleFeeBlur(branch.id)}
                                            />
                                            <Pencil size={10} className="text-gray-300" />
                                        </div>

                                        <button
                                            onClick={(e) => handleDelete(e, branch.id)}
                                            disabled={deleting === branch.id}
                                            className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all ${
                                                confirmingDelete === branch.id 
                                                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20 scale-110' 
                                                : 'text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                                            }`}
                                        >
                                            {deleting === branch.id ? (
                                                <Loader2 size={14} className="animate-spin" />
                                            ) : confirmingDelete === branch.id ? (
                                                <CheckCircle size={16} />
                                            ) : (
                                                <Trash2 size={16} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
        </DashboardLayout>
    );
}
