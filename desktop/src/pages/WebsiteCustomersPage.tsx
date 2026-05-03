import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import {
    Users, Search, Loader2, Phone, MapPin, 
    Coins, Key, Trash2, Edit2, Check, X, 
    AlertTriangle, RefreshCw
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
        if (!window.confirm('Are you sure you want to delete this customer? All their order history in the dashboard might be affected.')) return;
        
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
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="max-w-6xl mx-auto space-y-6 pb-12">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Users size={22} className="text-primary" /> Website Customers
                        </h1>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-1">Manage registered users & loyalty coins</p>
                    </div>

                    <div className="relative w-full md:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="Search name or phone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-12 pl-12 pr-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl outline-none focus:border-primary transition-all text-sm font-bold shadow-sm"
                        />
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{customers.length}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">Total Users</p>
                    </div>
                    <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <p className="text-2xl font-black text-emerald-500">
                            {customers.reduce((acc, c) => acc + (c.shopy_coins || 0), 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">Circulating Coins</p>
                    </div>
                </div>

                {/* Customers Table/Grid */}
                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 gap-4 text-center">
                        <Users size={48} className="text-gray-100 dark:text-gray-800" />
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No customers found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map(customer => (
                            <div key={customer.phone} className="bg-white dark:bg-gray-900 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md transition-all space-y-4">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-lg">
                                            {customer.name[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-black text-gray-900 dark:text-gray-100">{customer.name}</p>
                                            <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} /> +977 {customer.phone}</p>
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
                                            className="h-8 w-8 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-primary transition-all"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteCustomer(customer.phone)}
                                            className="h-8 w-8 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-red-500 transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100/50 dark:border-white/5">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Coins</p>
                                        <p className="text-sm font-black text-emerald-500 flex items-center gap-1"><Coins size={12} /> {customer.shopy_coins || 0}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100/50 dark:border-white/5">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                                        <p className="text-sm font-black text-primary flex items-center gap-1"><Key size={12} /> PIN SET</p>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1"><MapPin size={10} /> Address</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed truncate">{customer.address}, {customer.city}</p>
                                </div>

                                <div className="pt-2 border-t border-gray-50 dark:border-gray-800 flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    <span>Joined {new Date(customer.created_at).toLocaleDateString()}</span>
                                    <span className="text-primary font-black">PIN: {customer.pin_hash}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && selectedCustomer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/5 animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b dark:border-gray-800 bg-gradient-to-r from-primary/5 to-transparent flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">Edit Customer</h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">{selectedCustomer.name}</p>
                            </div>
                            <button onClick={() => setIsEditModalOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-red-500 transition-all"><X size={20} /></button>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">New 4-Digit PIN</label>
                                    <div className="relative">
                                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input 
                                            type="text" 
                                            maxLength={4}
                                            placeholder="Leave blank to keep current"
                                            value={newPin}
                                            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                                            className="w-full h-12 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary rounded-xl outline-none transition-all font-bold text-sm"
                                        />
                                    </div>
                                    <p className="text-[9px] text-gray-400 font-medium ml-1 italic">Current: {selectedCustomer.pin_hash}</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Update Coins Balance</label>
                                    <div className="relative">
                                        <Coins className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />
                                        <input 
                                            type="number" 
                                            value={newCoins}
                                            onChange={(e) => setNewCoins(Number(e.target.value))}
                                            className="w-full h-12 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary rounded-xl outline-none transition-all font-bold text-sm text-emerald-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-gray-800 text-gray-500 font-black rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all uppercase text-xs tracking-widest"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={updating}
                                    onClick={handleUpdateCustomer}
                                    className="flex-2 py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/30 flex items-center justify-center gap-3 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 transition-all uppercase text-xs tracking-widest px-8"
                                >
                                    {updating ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
