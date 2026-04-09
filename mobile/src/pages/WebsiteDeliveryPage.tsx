import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import {
    MapPin, Plus, Trash2, Loader2,
    AlertTriangle, CheckCircle, Truck, Info, Pencil, X
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
    const [editingBranch, setEditingBranch] = useState<DeliveryBranch | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const [form, setForm] = useState({
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

    const handleSave = async () => {
        if (!form.city.trim()) return showToast('City name is required', 'error');
        setSaving(true);
        try {
            const data = {
                city: form.city.trim(),
                coverage_area: form.coverage_area.trim(),
                shipping_fee: Number(form.shipping_fee) || 0
            };

            if (editingBranch) {
                const { error } = await supabase
                    .from('website_delivery_branches')
                    .update(data)
                    .eq('id', editingBranch.id);
                if (error) throw error;
                showToast('Branch updated!');
            } else {
                const { error } = await supabase
                    .from('website_delivery_branches')
                    .insert(data);
                if (error) throw error;
                showToast('Branch added!');
            }

            setShowForm(false);
            setEditingBranch(null);
            setForm({ city: '', coverage_area: '', shipping_fee: '' });
            fetchBranches();
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this delivery branch?')) return;
        setDeleting(id);
        try {
            const { error } = await supabase
                .from('website_delivery_branches')
                .delete()
                .eq('id', id);

            if (error) throw error;
            showToast('Branch deleted');
            setBranches(prev => prev.filter(b => b.id !== id));
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setDeleting(null);
        }
    };

    const openEdit = (b: DeliveryBranch) => {
        setEditingBranch(b);
        setForm({
            city: b.city,
            coverage_area: b.coverage_area,
            shipping_fee: b.shipping_fee
        });
        setShowForm(true);
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {toast && (
                <div className={`fixed top-4 left-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    {toast.msg}
                </div>
            )}

            <div className="space-y-6 pb-20">
                <div className="flex flex-col gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                             Delivery Zones
                        </h1>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Shipping Fees & Coverage</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {loading ? (
                        <div className="h-48 flex items-center justify-center">
                            <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                    ) : branches.length === 0 ? (
                        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 p-12 text-center text-gray-400">
                            <Truck size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="font-black uppercase tracking-widest text-[10px]">No delivery branches configured</p>
                        </div>
                    ) : (
                        branches.map(branch => (
                            <div key={branch.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center justify-between shadow-sm">
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="h-12 w-12 bg-primary/10 rounded-xl text-primary flex items-center justify-center flex-shrink-0">
                                        <MapPin size={24} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-black text-gray-900 dark:text-gray-100 text-sm truncate">{branch.city}</p>
                                        <p className="text-[10px] font-bold text-gray-400 truncate uppercase tracking-widest">{branch.coverage_area || 'Standard'}</p>
                                        <p className="text-primary font-black text-xs mt-0.5">Rs. {branch.shipping_fee}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => openEdit(branch)} className="p-3 bg-gray-50 dark:bg-gray-800 text-gray-500 rounded-xl"><Pencil size={18} /></button>
                                    <button onClick={() => handleDelete(branch.id)} disabled={deleting === branch.id} className="p-3 bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-xl">
                                        {deleting === branch.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <button onClick={() => { setEditingBranch(null); setForm({ city: '', coverage_area: '', shipping_fee: '' }); setShowForm(true); }} className="fixed bottom-24 right-6 h-14 px-6 bg-primary text-white rounded-full flex items-center gap-3 shadow-2xl shadow-primary/40 z-40 transform active:scale-95 transition-transform">
                    <Plus size={24} strokeWidth={3} />
                    <span className="font-black text-xs uppercase tracking-[0.2em]">Add Branch</span>
                </button>
            </div>

            {showForm && (
                <div className="fixed inset-0 z-[150] bg-white dark:bg-gray-950 flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
                    <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
                        <span className="text-lg font-black">{editingBranch ? 'Edit Branch' : 'New Branch'}</span>
                        <button onClick={() => setShowForm(false)} className="p-2 bg-gray-100 dark:bg-gray-900 rounded-full"><X size={20} /></button>
                    </div>
                    <div className="flex-1 p-6 space-y-8 overflow-y-auto">
                        <section className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Branch Location</label>
                            <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="City (e.g. Pokhara) *" className="w-full h-14 px-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-primary/30 outline-none text-sm font-black" />
                            <input value={form.coverage_area} onChange={e => setForm({ ...form, coverage_area: e.target.value })} placeholder="Coverage (e.g. Main City)" className="w-full h-14 px-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-primary/30 outline-none text-sm font-bold" />
                        </section>
                        <section className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Financial Mapping</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-gray-400">Rs.</span>
                                <input value={form.shipping_fee} onChange={e => setForm({ ...form, shipping_fee: e.target.value })} type="number" placeholder="Shipping Fee" className="w-full h-14 pl-12 pr-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-transparent focus:border-primary/30 outline-none text-sm font-black text-primary" />
                            </div>
                        </section>
                    </div>
                    <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex gap-4">
                        <button onClick={() => setShowForm(false)} className="px-6 py-4 rounded-2xl border border-gray-100 dark:border-gray-800 font-black text-xs uppercase tracking-widest">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="flex-1 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20">
                            {saving ? 'Processing...' : (editingBranch ? 'Save Changes' : 'Confirm Branch')}
                        </button>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
