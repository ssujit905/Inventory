import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { getVendorId, isVendorMember } from '../lib/vendorHelpers';
import { supabase } from '../lib/supabase';
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

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('mobile_delivery_branch_draft');
        const savedFormOpen = localStorage.getItem('mobile_delivery_form_open');
        if (savedFormOpen === 'true') setIsFormOpen(true);
        if (savedDraft) {
            try {
                setNewBranch(JSON.parse(savedDraft));
            } catch (e) { console.error('Delivery draft restore failed'); }
        }
    }, []);

    useEffect(() => {
        if (isFormOpen) {
            localStorage.setItem('mobile_delivery_branch_draft', JSON.stringify(newBranch));
            localStorage.setItem('mobile_delivery_form_open', 'true');
        } else {
            localStorage.removeItem('mobile_delivery_form_open');
        }
    }, [newBranch, isFormOpen]);

    const clearDraft = () => {
        localStorage.removeItem('mobile_delivery_branch_draft');
        localStorage.removeItem('mobile_delivery_form_open');
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
        } else if (profile?.role === 'admin') {
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
        const branchPayload: any = {
            city: newBranch.city.trim(),
            coverage_area: newBranch.coverage_area.trim(),
            shipping_fee: Number(newBranch.shipping_fee) || 0,
            delivery_time: newBranch.delivery_time.trim(),
            vendor_id: getVendorId(profile)
        };
        const { data, error } = await supabase
            .from('website_delivery_branches')
            .insert(branchPayload)
            .select()
            .single();

        if (error) {
            showToast(error.message, 'error');
        } else {
            setBranches(prev => [...prev, data].sort((a, b) => a.city.localeCompare(b.city)));
            setNewBranch({ city: '', coverage_area: '', shipping_fee: '', delivery_time: '2-4 Days' });
            clearDraft();
            setIsFormOpen(false);
            showToast('Branch added!');
        }
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
        
        try {
            const { error } = await supabase
                .from('website_delivery_branches')
                .delete()
                .eq('id', id);

            if (error) {
                showToast(error.message, 'error');
            } else {
                setBranches(prev => prev.filter(b => b.id !== id));
                showToast('Deleted');
            }
        } catch (err: any) {
            showToast('Error', 'error');
        } finally {
            setDeleting(null);
        }
    };

    const handleUpdateField = async (id: number, field: string, value: any) => {
        const { error } = await supabase
            .from('website_delivery_branches')
            .update({ [field]: value })
            .eq('id', id);
        if (error) {
            showToast('Error', 'error');
        } else {
            setBranches(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
        }
        setEditingBranch(null);
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
            <div className="px-5 space-y-6 pb-12">
                {/* Header */}
                <div className="flex flex-col gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Delivery Network</h1>
                        <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest">Manage hubs & shipping fees.</p>
                    </div>
                    <button 
                        onClick={() => setIsFormOpen(true)}
                        className="w-full bg-primary text-white h-14 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 flex items-center justify-center gap-3 active:scale-95 transition-all"
                    >
                        <Plus size={20} strokeWidth={3} /> Add Location
                    </button>
                </div>

                {/* Hub List */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                        <MapPin size={14} className="text-gray-400" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Active Destinations ({branches.length})</h3>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800">
                            <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Syncing...</p>
                        </div>
                    ) : branches.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-[2rem] border-2 border-dashed border-gray-100 dark:border-gray-800">
                            <Truck size={48} className="text-gray-200 mb-4" />
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No hubs active</p>
                        </div>
                    ) : (
                        branches.map((branch) => (
                            <div key={branch.id} className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 p-5 shadow-sm space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                                            <MapPin size={24} />
                                        </div>
                                        <div>
                                            <p className="font-black text-gray-900 dark:text-gray-100 text-lg">{branch.city}</p>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{branch.coverage_area || 'Standard coverage'}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(e, branch.id)}
                                        className={`h-10 w-10 flex items-center justify-center rounded-xl transition-all ${
                                            confirmingDelete === branch.id 
                                            ? 'bg-rose-500 text-white' 
                                            : 'text-gray-200 hover:text-rose-500'
                                        }`}
                                    >
                                        {deleting === branch.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={20} />}
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Fee</p>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-black text-primary">Rs.</span>
                                            <input 
                                                type="number"
                                                className="bg-transparent text-sm font-black text-gray-900 dark:text-white w-full focus:outline-none"
                                                value={editingBranch?.id === branch.id && editingBranch.field === 'shipping_fee' ? editingBranch.value : branch.shipping_fee}
                                                onChange={(e) => setEditingBranch({ id: branch.id, field: 'shipping_fee', value: e.target.value })}
                                                onBlur={() => handleUpdateField(branch.id, 'shipping_fee', Number(editingBranch?.value))}
                                            />
                                        </div>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Time</p>
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={12} className="text-gray-400" />
                                            <input 
                                                type="text"
                                                className="bg-transparent text-[11px] font-black text-gray-900 dark:text-white w-full focus:outline-none"
                                                value={editingBranch?.id === branch.id && editingBranch.field === 'delivery_time' ? editingBranch.value : branch.delivery_time}
                                                onChange={(e) => setEditingBranch({ id: branch.id, field: 'delivery_time', value: e.target.value })}
                                                onBlur={() => handleUpdateField(branch.id, 'delivery_time', editingBranch?.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                                {confirmingDelete === branch.id && (
                                    <button 
                                        onClick={(e) => handleDelete(e, branch.id)}
                                        className="w-full py-3 bg-rose-500 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] animate-pulse"
                                    >
                                        Tap Again to Delete
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Mobile Form Modal */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm">
                        <div className="bg-white dark:bg-gray-900 w-full rounded-t-[3rem] shadow-2xl overflow-hidden border-t border-gray-100 dark:border-gray-800 animate-in slide-in-from-bottom duration-300">
                            <div className="px-8 pt-8 pb-4 flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight uppercase">New Location</h2>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">Expanding your reach</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-10 w-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                                    <X size={20} strokeWidth={3} />
                                </button>
                            </div>

                            <form onSubmit={handleAddBranch} className="p-8 space-y-6">
                                <div className="space-y-5">
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">City Name</label>
                                        <input
                                            required
                                            type="text"
                                            placeholder="e.g. Kathmandu"
                                            className="w-full h-14 px-6 rounded-2xl bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-primary/20 text-base font-bold"
                                            value={newBranch.city}
                                            onChange={(e) => setNewBranch({ ...newBranch, city: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Coverage Details</label>
                                        <input
                                            type="text"
                                            placeholder="Main City Area"
                                            className="w-full h-14 px-6 rounded-2xl bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-primary/20 text-sm font-bold"
                                            value={newBranch.coverage_area}
                                            onChange={(e) => setNewBranch({ ...newBranch, coverage_area: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Time</label>
                                            <input
                                                type="text"
                                                className="w-full h-14 px-6 rounded-2xl bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-primary/20 text-sm font-bold"
                                                value={newBranch.delivery_time}
                                                onChange={(e) => setNewBranch({ ...newBranch, delivery_time: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Fee (Rs.)</label>
                                            <input
                                                required
                                                type="number"
                                                className="w-full h-14 px-6 rounded-2xl bg-gray-50 dark:bg-gray-800 border-none focus:ring-2 focus:ring-primary/20 text-base font-black text-primary"
                                                value={newBranch.shipping_fee}
                                                onChange={(e) => setNewBranch({ ...newBranch, shipping_fee: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4 pb-8">
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="flex-1 h-14 bg-gray-50 dark:bg-gray-800 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="flex-[2] h-14 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 size={20} className="animate-spin mx-auto" /> : "Deploy Hub"}
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
