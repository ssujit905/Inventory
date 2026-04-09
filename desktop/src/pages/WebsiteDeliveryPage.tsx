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
            {/* Global Toast Notification — Always at the top-right! */}
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <CheckCircle size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="max-w-4xl mx-auto space-y-8">
                {/* Page Header */}
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Truck size={24} className="text-primary" /> Delivery Branches
                    </h1>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">
                        Manage destination cities, coverage areas & shipping fees
                    </p>
                </div>

                {/* Add New Branch — isolated form so delete buttons can't submit it */}
                <form onSubmit={handleAddBranch} className="bg-white dark:bg-gray-900 rounded-3xl border-2 border-gray-100 dark:border-gray-800 p-6 shadow-sm overflow-hidden">
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-5 flex items-center gap-2">
                        <Plus size={14} /> Add New Destination
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                        <div className="lg:col-span-4 space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">City Name *</label>
                            <input
                                required
                                type="text"
                                placeholder="e.g. Pokhara"
                                className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm font-bold"
                                value={newBranch.city}
                                onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                            />
                        </div>
                        <div className="lg:col-span-4 space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Coverage Area</label>
                            <input
                                type="text"
                                placeholder="e.g. City Centre & Suburbs"
                                className="w-full px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm font-bold"
                                value={newBranch.coverage_area}
                                onChange={(e) => setNewBranch({ ...newBranch, coverage_area: e.target.value })}
                            />
                        </div>
                        <div className="lg:col-span-4 space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Shipping Fee (Rs.) *</label>
                            <div className="flex gap-2">
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    className="w-24 px-4 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm font-bold"
                                    value={newBranch.shipping_fee}
                                    onChange={(e) => setNewBranch({ ...newBranch, shipping_fee: e.target.value })}
                                />
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 bg-primary hover:bg-primary/90 text-white rounded-2xl px-4 font-bold text-sm shadow-lg shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap"
                                >
                                    {saving ? <Loader2 className="animate-spin" size={16} /> : <><Plus size={16} /> Add Branch</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </form>

                {/* Branches List */}
                <div className="space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-widest text-gray-400 ml-1 flex items-center gap-2">
                        <MapPin size={14} /> Active Shipping Destinations ({branches.length})
                    </h3>

                    {loading ? (
                        <div className="h-48 flex items-center justify-center">
                            <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    ) : branches.length === 0 ? (
                        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center text-gray-400">
                            <Truck size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="font-bold uppercase tracking-widest text-xs">No delivery branches yet. Add one above.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {branches.map(branch => (
                                <div key={branch.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between hover:shadow-md transition-all">
                                    {/* Left: City + Coverage */}
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className="p-3 bg-primary/10 rounded-xl text-primary flex-shrink-0">
                                            <MapPin size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-black text-gray-900 dark:text-gray-100">{branch.city}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <Info size={11} className="text-gray-400 flex-shrink-0" />
                                                <p className="text-[11px] font-semibold text-gray-400 truncate">{branch.coverage_area || 'Standard coverage'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Fee editor + Delete */}
                                    <div className="flex items-center gap-4 flex-shrink-0">
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Shipping Fee</p>
                                            <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                                                <span className="text-xs font-bold text-gray-400">Rs.</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    className="w-16 bg-transparent text-sm font-black text-primary focus:outline-none text-right"
                                                    value={editingFee?.id === branch.id ? editingFee.value : branch.shipping_fee}
                                                    onChange={(e) => setEditingFee({ id: branch.id, value: e.target.value })}
                                                    onBlur={() => handleFeeBlur(branch.id)}
                                                    title="Click to edit. Changes save on click away."
                                                />
                                                <Pencil size={12} className="text-gray-300" />
                                            </div>
                                            <p className="text-[9px] text-gray-300 mt-0.5 text-right">Saves on blur</p>
                                        </div>

                                        {/* Delete button — type="button" to prevent form submit */}
                                        <button
                                            type="button"
                                            onClick={(e) => handleDelete(e, branch.id)}
                                            disabled={deleting === branch.id}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all disabled:opacity-50 font-bold text-xs ${
                                                confirmingDelete === branch.id 
                                                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
                                                : 'text-gray-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                                            }`}
                                            title={confirmingDelete === branch.id ? "Click again to confirm" : "Delete branch"}
                                        >
                                            {deleting === branch.id ? (
                                                <Loader2 size={16} className="animate-spin" />
                                            ) : confirmingDelete === branch.id ? (
                                                <>Confirm?</>
                                            ) : (
                                                <Trash2 size={18} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
