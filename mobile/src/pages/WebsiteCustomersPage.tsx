import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import {
    Users, Search, Loader2, Phone, MapPin, 
    Coins, Key, Trash2, Edit2, Check, X, 
    AlertTriangle, ChevronRight, User
} from 'lucide-react';

interface WebsiteCustomer {
    phone: string;
    name: string;
    address: string;
    city: string;
    shopy_coins: number;
    pin_hash: string;
    created_at: string;
}

export default function WebsiteCustomersPage() {
    const { profile } = useAuthStore();
    const [customers, setCustomers] = useState<WebsiteCustomer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    
    // Edit Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<WebsiteCustomer | null>(null);
    const [newPin, setNewPin] = useState('');
    const [newCoins, setNewCoins] = useState(0);
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('website_customers')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) showToast(error.message, 'error');
        else setCustomers(data || []);
        setLoading(false);
    };

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleUpdateCustomer = async () => {
        if (!selectedCustomer) return;
        setUpdating(true);
        try {
            const updates: any = {
                shopy_coins: newCoins,
                updated_at: new Date().toISOString()
            };
            
            if (newPin.trim()) {
                if (newPin.length !== 4 || isNaN(Number(newPin))) {
                    throw new Error('PIN must be exactly 4 digits');
                }
                updates.pin_hash = newPin;
            }

            const { error } = await supabase
                .from('website_customers')
                .update(updates)
                .eq('phone', selectedCustomer.phone);

            if (error) throw error;
            
            showToast('Customer updated successfully');
            setIsEditModalOpen(false);
            fetchCustomers();
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteCustomer = async (phone: string) => {
        if (!window.confirm('Are you sure you want to delete this customer?')) return;
        
        try {
            const { error } = await supabase
                .from('website_customers')
                .delete()
                .eq('phone', phone);
            
            if (error) throw error;
            showToast('Customer deleted');
            setCustomers(prev => prev.filter(c => c.phone !== phone));
        } catch (err: any) {
            showToast(err.message, 'error');
        }
    };

    const filtered = customers.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.phone.includes(searchTerm)
    );

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {/* Toast Notification */}
            {toast && (
                <div className={`fixed bottom-24 left-4 right-4 z-[200] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-bottom-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="px-4 py-6 space-y-6">
                {/* Header Section */}
                <div className="space-y-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Website Users</h1>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Manage registered customers & coins</p>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search name or phone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-14 pl-12 pr-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-bold shadow-sm"
                        />
                    </div>
                </div>

                {/* Stats Summary */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-2xl font-black text-gray-900 dark:text-white">{customers.length}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">Total Customers</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-2xl font-black text-emerald-500">
                            {customers.reduce((acc, c) => acc + (c.shopy_coins || 0), 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">Circulating Coins</p>
                    </div>
                </div>

                {/* Customer List */}
                <div className="space-y-3">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center">
                            <Loader2 size={32} className="animate-spin text-primary" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 gap-4 text-center">
                            <Users size={40} className="text-gray-100 dark:text-gray-800" />
                            <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No customers found</p>
                        </div>
                    ) : (
                        filtered.map(customer => (
                            <div key={customer.phone} className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-black text-xl">
                                            {customer.name[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-black text-gray-900 dark:text-white">{customer.name}</p>
                                            <p className="text-xs text-gray-400 font-bold flex items-center gap-1">
                                                <Phone size={10} /> {customer.phone}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => {
                                                setSelectedCustomer(customer);
                                                setNewCoins(customer.shopy_coins || 0);
                                                setNewPin('');
                                                setIsEditModalOpen(true);
                                            }}
                                            className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 active:scale-95 transition-all"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteCustomer(customer.phone)}
                                            className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-400 active:scale-95 transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100/50 dark:border-white/5">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Shopy Coins</p>
                                        <p className="text-sm font-black text-emerald-500 flex items-center gap-1.5"><Coins size={14} /> {customer.shopy_coins || 0}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100/50 dark:border-white/5">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Security PIN</p>
                                        <p className="text-sm font-black text-primary flex items-center gap-1.5"><Key size={14} /> {customer.pin_hash}</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2.5 p-1">
                                    <MapPin size={14} className="text-gray-400 mt-0.5" />
                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-bold leading-tight">{customer.address}, {customer.city}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Edit Customer Bottom Sheet / Modal */}
            {isEditModalOpen && selectedCustomer && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-gray-950 w-full max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden border-t sm:border border-white/10 animate-in slide-in-from-bottom-full duration-500">
                        <div className="p-8 border-b dark:border-gray-800/50 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Edit Customer</h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">{selectedCustomer.name}</p>
                            </div>
                            <button onClick={() => setIsEditModalOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-900 text-gray-500"><X size={20} /></button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Update PIN (4 Digits)</label>
                                    <div className="relative">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input 
                                            type="text" 
                                            maxLength={4}
                                            placeholder="Leave blank to keep current"
                                            value={newPin}
                                            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                                            className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-primary rounded-2xl outline-none transition-all font-bold text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Coins Balance</label>
                                    <div className="relative">
                                        <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />
                                        <input 
                                            type="number" 
                                            value={newCoins}
                                            onChange={(e) => setNewCoins(Number(e.target.value))}
                                            className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 border-2 border-transparent focus:border-primary rounded-2xl outline-none transition-all font-bold text-sm text-emerald-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    disabled={updating}
                                    onClick={handleUpdateCustomer}
                                    className="flex-1 py-5 bg-primary text-white font-black rounded-3xl shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 transition-all uppercase text-xs tracking-widest"
                                >
                                    {updating ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                                    Update Customer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
