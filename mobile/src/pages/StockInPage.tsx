import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { Plus, Package, X, Hash, History, Barcode, CheckCircle2, Calculator, Calendar } from 'lucide-react';
import { format } from 'date-fns';

type RecentTransaction = {
    id: string;
    created_at: string;
    quantity_changed: number;
    type: string;
    product: { name: string; sku: string; description: string };
    lot: { id: string; lot_number: string; cost_price: number; received_date: string };
};

export default function StockInPage() {
    const { user, profile } = useAuthStore();
    const isAdmin = profile?.role === 'admin';

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
    const [loading, setLoading] = useState(false);

    // Form Fields
    const [sku, setSku] = useState('');
    const [lotNumber, setLotNumber] = useState('');
    const [entryDate, setEntryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [quantity, setQuantity] = useState<number | ''>('');
    const [costPrice, setCostPrice] = useState<number | ''>('');

    useEffect(() => {
        fetchRecentTransactions();
    }, []);

    const fetchRecentTransactions = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('transactions')
            .select(`
                id,
                created_at,
                quantity_changed,
                type,
                product:products(name, sku, description),
                lot:product_lots(id, lot_number, cost_price, received_date)
            `)
            .eq('type', 'in')
            .order('created_at', { ascending: false })
            .limit(20);

        if (data) setRecentTransactions(data as any);
        setLoading(false);
    };

    const handleStockIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);
        try {
            // Find or create product
            let productId;
            const { data: existingProd } = await supabase.from('products').select('id').eq('sku', sku).maybeSingle();

            if (existingProd) {
                productId = existingProd.id;
            } else {
                const { data: newProd, error: pErr } = await supabase.from('products').insert([{
                    name: sku,
                    sku: sku,
                    min_stock_alert: 5
                }]).select().single();
                if (pErr) throw pErr;
                productId = newProd.id;
            }

            // Create Lot
            const { data: lotData, error: lErr } = await supabase.from('product_lots').insert([{
                product_id: productId,
                lot_number: lotNumber,
                received_date: entryDate,
                quantity_remaining: Number(quantity),
                cost_price: Number(costPrice || 0),
                created_by: user.id
            }]).select().single();
            if (lErr) throw lErr;

            // Create Transaction
            await supabase.from('transactions').insert([{
                product_id: productId,
                lot_id: lotData.id,
                type: 'in',
                quantity_changed: Number(quantity),
                performed_by: user.id
            }]);

            setIsFormOpen(false);
            fetchRecentTransactions();
        } catch (err) {
            alert('Failed to save stock entry');
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Stock In</h1>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Inbound Logistics</p>
                    </div>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="h-12 w-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30"
                    >
                        <Plus size={24} />
                    </button>
                </div>

                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <History size={16} className="text-gray-400" />
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Recent Inbound</h3>
                    </div>

                    <div className="space-y-4">
                        {loading && recentTransactions.length === 0 ? (
                            <div className="h-40 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-3xl" />
                        ) : (
                            recentTransactions.map((tx) => (
                                <div key={tx.id} className="bg-white dark:bg-gray-900 p-5 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-xl flex items-center justify-center">
                                                <Package size={20} />
                                            </div>
                                            <div>
                                                <h4 className="font-black text-sm">{tx.product?.sku}</h4>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Lot: {tx.lot?.lot_number}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-emerald-500">+{tx.quantity_changed}</p>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase">{format(new Date(tx.lot?.received_date || tx.created_at), 'MMM dd')}</p>
                                        </div>
                                    </div>
                                    {isAdmin && (
                                        <div className="pt-3 border-t border-gray-50 dark:border-gray-800/50 flex items-center justify-between">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Unit Cost</span>
                                            <span className="text-sm font-black text-gray-900 dark:text-gray-100">₹{tx.lot?.cost_price.toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Full Screen Form Modal */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-950 flex flex-col animate-in slide-in-from-bottom duration-300">
                        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
                            <span className="text-lg font-black uppercase tracking-widest">Receive Stock</span>
                            <button onClick={() => setIsFormOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-900 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleStockIn} className="flex-1 overflow-y-auto p-6 space-y-8">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">SKU / Barcode</label>
                                    <div className="relative">
                                        <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                                        <input
                                            required
                                            type="text"
                                            value={sku}
                                            onChange={(e) => setSku(e.target.value)}
                                            placeholder="PRO-X-001"
                                            className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 font-bold"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Lot / Batch</label>
                                        <div className="relative">
                                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                            <input
                                                required
                                                type="text"
                                                value={lotNumber}
                                                onChange={(e) => setLotNumber(e.target.value)}
                                                placeholder="B-01"
                                                className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Received Date</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                            <input
                                                required
                                                type="date"
                                                value={entryDate}
                                                onChange={(e) => setEntryDate(e.target.value)}
                                                className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 font-bold text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quantity In</label>
                                    <div className="relative">
                                        <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                                        <input
                                            required
                                            type="number"
                                            value={quantity}
                                            onChange={(e) => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                                            placeholder="0"
                                            className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 font-black text-xl text-emerald-500"
                                        />
                                    </div>
                                </div>

                                {isAdmin && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unit Cost Price (₹)</label>
                                        <div className="relative">
                                            <Calculator className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                                            <input
                                                required
                                                type="number"
                                                value={costPrice}
                                                onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                                                placeholder="0.00"
                                                className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border-none outline-none focus:ring-2 focus:ring-primary/20 font-black text-xl text-gray-900 dark:text-gray-100"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-16 bg-emerald-500 text-white font-black rounded-3xl shadow-xl shadow-emerald-500/30 flex items-center justify-center gap-3 active:scale-95 transition-all text-lg"
                                >
                                    {loading ? 'Processing...' : (
                                        <>
                                            Complete Reception <CheckCircle2 size={24} />
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
