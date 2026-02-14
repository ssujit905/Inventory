import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { Plus, ShoppingCart, User, Phone, DollarSign, X, History, CheckCircle2, Search, ArrowRight, MapPin, Calculator } from 'lucide-react';
import { format } from 'date-fns';

type Sale = {
    id: string;
    order_date: string;
    destination_branch: string;
    parcel_status: 'processing' | 'sent' | 'delivered' | 'returned';
    customer_name: string;
    phone1: string;
    cod_amount: number;
    sale_items?: any[];
};

export default function SalesPage() {
    const { user, profile } = useAuthStore();
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);

    // Form State
    const [customerName, setCustomerName] = useState('');
    const [phone1, setPhone1] = useState('');
    const [codAmount, setCodAmount] = useState<number | ''>('');
    const [address, setAddress] = useState('');

    useEffect(() => {
        fetchSales();
    }, []);

    const fetchSales = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('sales')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
        if (data) setSales(data);
        setLoading(false);
    };

    const filteredSales = useMemo(() => {
        return sales.filter(s =>
            s.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.phone1.includes(searchTerm)
        );
    }, [sales, searchTerm]);

    const handleCreateSale = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);
        try {
            const { error } = await supabase.from('sales').insert([{
                customer_name: customerName,
                phone1: phone1,
                cod_amount: Number(codAmount),
                customer_address: address,
                order_date: format(new Date(), 'yyyy-MM-dd'),
                parcel_status: 'processing',
                recorded_by: user.id
            }]);
            if (error) throw error;
            setIsFormOpen(false);
            fetchSales();
        } catch (err) {
            alert('Failed to save sale');
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">Sales</h1>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Order Management</p>
                    </div>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="h-12 w-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30"
                    >
                        <Plus size={24} />
                    </button>
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search by name or phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-14 pl-12 pr-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-base focus:ring-4 focus:ring-primary/10 outline-none transition-all"
                    />
                </div>

                <div className="space-y-4">
                    {loading && sales.length === 0 ? (
                        <div className="h-40 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-3xl" />
                    ) : (
                        filteredSales.map((sale) => (
                            <div key={sale.id} className="bg-white dark:bg-gray-900 p-5 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm space-y-4 active:scale-[0.98] transition-all">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 bg-blue-50 dark:bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center">
                                            <User size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-gray-900 dark:text-gray-100 leading-tight">{sale.customer_name}</h3>
                                            <div className="flex items-center gap-1 text-xs text-gray-400 font-bold uppercase">
                                                <Phone size={10} />
                                                <span>{sale.phone1}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <StatusPill status={sale.parcel_status} />
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50 dark:border-gray-800/50">
                                    <div className="space-y-1">
                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">COD Amount</p>
                                        <p className="text-xl font-black text-primary">₹{Number(sale.cod_amount).toLocaleString()}</p>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Date</p>
                                        <p className="text-sm font-bold text-gray-600 dark:text-gray-400">{format(new Date(sale.order_date), 'MMM dd, yyyy')}</p>
                                    </div>
                                </div>

                                <button className="w-full py-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-xs font-black uppercase tracking-widest text-gray-500 flex items-center justify-center gap-2">
                                    Manage Order <ArrowRight size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* New Sale Modal (Mobile Style) */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-950 flex flex-col animate-in slide-in-from-bottom duration-300">
                        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
                            <span className="text-lg font-black uppercase tracking-widest">New Sale</span>
                            <button onClick={() => setIsFormOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-900 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateSale} className="flex-1 overflow-y-auto p-6 space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Customer Name</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                                        <input
                                            required
                                            type="text"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            placeholder="Ex: John Doe"
                                            className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 font-bold"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone Number</label>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                                        <input
                                            required
                                            type="tel"
                                            value={phone1}
                                            onChange={(e) => setPhone1(e.target.value)}
                                            placeholder="10 Digits"
                                            className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 font-bold"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">COD Amount (₹)</label>
                                    <div className="relative">
                                        <Calculator className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                                        <input
                                            required
                                            type="number"
                                            value={codAmount}
                                            onChange={(e) => setCodAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="0.00"
                                            className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 font-black text-xl text-primary"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Delivery Address</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-4 top-4 text-gray-300" size={20} />
                                        <textarea
                                            required
                                            rows={3}
                                            value={address}
                                            onChange={(e) => setAddress(e.target.value)}
                                            placeholder="Full address here..."
                                            className="w-full pl-12 pr-4 py-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-16 bg-primary text-white font-black rounded-3xl shadow-xl shadow-primary/30 flex items-center justify-center gap-3 active:scale-95 transition-all text-lg"
                                >
                                    {loading ? 'Processing...' : (
                                        <>
                                            Save Sale Record <CheckCircle2 size={24} />
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

function StatusPill({ status }: { status: Sale['parcel_status'] }) {
    const colors = {
        'processing': 'bg-amber-100 text-amber-600 border-amber-200',
        'sent': 'bg-blue-100 text-blue-600 border-blue-200',
        'delivered': 'bg-emerald-100 text-emerald-600 border-emerald-200',
        'returned': 'bg-rose-100 text-rose-600 border-rose-200'
    };

    return (
        <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${colors[status]}`}>
            {status}
        </span>
    );
}
