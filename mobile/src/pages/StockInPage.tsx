import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { Plus, DollarSign, Package, AlertCircle, Barcode, X, History, Hash } from 'lucide-react';
import { format } from 'date-fns';

type RecentTransaction = {
    id: string;
    created_at: string;
    quantity_changed: number;
    type: string;
    product: { name: string; sku: string; description: string };
    lot: { id: string; lot_number: string; cost_price: number; expiry_date: string | null; received_date: string };
};

export default function StockInPage() {
    const { user, profile } = useAuthStore();
    const isAdmin = profile?.role === 'admin';

    // UI State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);

    // Form Fields
    const [sku, setSku] = useState('');
    const [details, setDetails] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [lotNumber, setLotNumber] = useState('');
    const [entryDate, setEntryDate] = useState('');
    const [quantity, setQuantity] = useState<number>(0);
    const [costPrice, setCostPrice] = useState<number>(0);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Admin Cost Update State
    const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
    const [selectedLot, setSelectedLot] = useState<{ id: string, sku: string, qty: number } | null>(null);
    const [newCost, setNewCost] = useState<number>(0);

    // Derived State

    useEffect(() => {
        fetchRecentTransactions();
    }, []);

    useRealtimeRefresh(
        () => fetchRecentTransactions(),
        {
            channelName: 'transactions-in-changes-v3',
            tables: ['product_lots', 'transactions'],
            pollMs: 8000
        }
    );

    const fetchRecentTransactions = async () => {
        const { data, error } = await supabase
            .from('transactions')
            .select(`
                id,
                created_at,
                quantity_changed,
                type,
                product:products(name, sku, description),
                lot:product_lots(id, lot_number, cost_price, expiry_date, received_date)
            `)
            .eq('type', 'in')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching transactions:', error);
            return;
        }

        if (data) {
            const sorted = [...data].sort((a: any, b: any) => {
                const aDate = new Date(a.lot?.received_date || a.created_at).getTime();
                const bDate = new Date(b.lot?.received_date || b.created_at).getTime();
                return bDate - aDate;
            });
            setRecentTransactions(sorted as any);
        }
    };

    const handleUpdateCost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedLot || !isAdmin) return;
        setLoading(true);

        try {
            const { error } = await supabase
                .from('product_lots')
                .update({ cost_price: newCost })
                .eq('id', selectedLot.id);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Cost price updated!' });
            await fetchRecentTransactions();
            setTimeout(() => {
                setIsUpdateModalOpen(false);
                setSelectedLot(null);
                setMessage(null);
            }, 1000);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    const openUpdateModal = (lotId: string, sku: string, qty: number, currentCost: number) => {
        setSelectedLot({ id: lotId, sku, qty });
        setNewCost(currentCost);
        setIsUpdateModalOpen(true);
        setMessage(null);
    };

    const openEntryForm = () => {
        setSku('');
        setDetails('');
        setImageUrl('');
        setLotNumber('');
        setQuantity(0);
        setCostPrice(0);
        setEntryDate('');
        setMessage(null);
        setIsFormOpen(true);
    };

    const handleStockIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            let productId;
            const { data: existingProd } = await supabase
                .from('products')
                .select('id')
                .eq('sku', sku)
                .maybeSingle();

            if (existingProd) {
                productId = existingProd.id;
            } else {
                const { data: prodData, error: prodError } = await supabase
                    .from('products')
                    .insert([{
                        name: sku,
                        sku: sku,
                        description: details,
                        image_url: imageUrl,
                        min_stock_alert: 10
                    }])
                    .select()
                    .single();

                if (prodError) throw prodError;
                productId = prodData.id;
            }

            const { data: lotData, error: lotError } = await supabase
                .from('product_lots')
                .insert([{
                    product_id: productId,
                    lot_number: lotNumber,
                    received_date: entryDate ? `${entryDate}T00:00:00Z` : undefined,
                    quantity_remaining: quantity,
                    cost_price: isAdmin ? costPrice : 0,
                    created_by: user.id
                }])
                .select()
                .single();

            if (lotError) throw lotError;

            const { error: transError } = await supabase.from('transactions').insert([{
                product_id: productId,
                lot_id: lotData.id,
                type: 'in',
                quantity_changed: quantity,
                performed_by: user.id
            }]);

            if (transError) throw transError;

            setMessage({ type: 'success', text: 'Stock received successfully!' });
            await fetchRecentTransactions();
            setTimeout(() => setIsFormOpen(false), 800);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto space-y-6 pb-12">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Stock In Management</h1>
                        <p className="text-gray-400 font-medium text-xs">Record and verify inbound product shipments and costs.</p>
                    </div>
                    <button
                        onClick={openEntryForm}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-all shadow-sm active:scale-95 w-full sm:w-auto"
                    >
                        <Plus size={16} strokeWidth={2.5} />
                        Receive Shipment
                    </button>
                </div>

                {/* Reception History - Card Layout */}
                <div className="flex items-center gap-2 px-1">
                    <History size={14} strokeWidth={1.5} className="text-gray-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Reception History</h3>
                    <span className="ml-auto text-[10px] font-bold text-gray-300">{recentTransactions.length} records</span>
                </div>

                <div className="space-y-2.5">
                    {recentTransactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                            <div className="flex flex-col items-center gap-3 opacity-30">
                                <Package size={40} strokeWidth={1.5} />
                                <p className="text-xs font-bold uppercase tracking-widest">No intake records</p>
                            </div>
                        </div>
                    ) : (
                        recentTransactions.map((tx, index) => {
                            const totalValue = tx.quantity_changed * (tx.lot?.cost_price || 0);
                            const isPending = (tx.lot?.cost_price || 0) <= 0;
                            const displayIndex = recentTransactions.length - index;

                            return (
                                <div key={tx.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden active:scale-[0.99] transition-all">
                                    {/* Top section: Index + Date + Qty badge */}
                                    <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
                                        <div className="flex items-center gap-2.5">
                                            <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black flex-shrink-0">
                                                {displayIndex}
                                            </span>
                                            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                                {format(new Date(tx.lot?.received_date || tx.created_at), 'MMM dd, yyyy')}
                                            </span>
                                        </div>
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-[11px] font-black">
                                            +{tx.quantity_changed} <span className="text-[9px] font-bold opacity-60">units</span>
                                        </span>
                                    </div>

                                    {/* Product info row */}
                                    <div className="px-3.5 pb-2.5">
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-9 w-9 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400 flex-shrink-0">
                                                <Barcode size={16} strokeWidth={1.5} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{tx.product?.sku}</p>
                                                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate leading-relaxed">{tx.product?.name}</p>
                                                <p className="text-[10px] text-gray-700 dark:text-gray-300 leading-snug line-clamp-2 break-words mt-0.5">
                                                    Desc: {tx.product?.description?.trim() ? tx.product.description : 'No description'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Details strip */}
                                    <div className={`flex items-center gap-0 border-t border-gray-50 dark:border-gray-800 ${isAdmin ? '' : 'rounded-b-xl'}`}>
                                        {/* Lot */}
                                        <div className="flex-1 px-3.5 py-2 border-r border-gray-50 dark:border-gray-800">
                                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Batch</p>
                                            <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate">{tx.lot?.lot_number || '—'}</p>
                                        </div>

                                        {isAdmin && (
                                            <>
                                                {/* Unit Cost */}
                                                <div className="flex-1 px-3 py-2 border-r border-gray-50 dark:border-gray-800 text-center">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Unit Cost</p>
                                                    <p className={`text-[11px] font-black ${isPending ? 'text-amber-500' : 'text-gray-800 dark:text-gray-200'}`}>
                                                        ${(tx.lot?.cost_price || 0).toLocaleString()}
                                                    </p>
                                                </div>
                                                {/* Total Value */}
                                                <div className="flex-1 px-3 py-2 text-right">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Total</p>
                                                    <p className="text-[11px] font-black text-primary">
                                                        ${totalValue.toLocaleString()}
                                                    </p>
                                                </div>
                                            </>
                                        )}

                                        {!isAdmin && (
                                            <div className="flex-1 px-3.5 py-2 text-right">
                                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Status</p>
                                                <p className="text-[10px] font-black text-emerald-500 uppercase">Received</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Admin footer: Status + Update button */}
                                    {isAdmin && (
                                        <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50/60 dark:bg-gray-800/30 border-t border-gray-50 dark:border-gray-800">
                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${isPending
                                                    ? 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 border-amber-200 dark:border-amber-800'
                                                    : 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 border-emerald-200 dark:border-emerald-800'
                                                }`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${isPending ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                                                {isPending ? 'Cost Pending' : 'Verified'}
                                            </span>
                                            <button
                                                onClick={() => openUpdateModal(tx.lot?.id, tx.product?.sku, tx.quantity_changed, tx.lot?.cost_price)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 text-[10px] font-bold text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary/50 hover:text-primary transition-all active:scale-95 shadow-sm"
                                            >
                                                <DollarSign size={12} strokeWidth={2} />
                                                Update Cost
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Entry Modal (Centered Card Style) */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800">
                            <div className="px-8 py-6 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stock Receipt</h2>
                                    <p className="text-xs text-gray-400 font-medium">Log incoming inventory batch</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-10 w-10 rounded-xl bg-white dark:bg-gray-900 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all shadow-sm border border-gray-100 dark:border-gray-800">
                                    <X size={20} strokeWidth={1.5} />
                                </button>
                            </div>

                            <form onSubmit={handleStockIn} className="p-8 space-y-6">
                                {message && (
                                    <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                        <AlertCircle size={16} /> {message.text}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">SKU / Product ID</label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                                                <Barcode size={16} strokeWidth={1.5} />
                                            </div>
                                            <input
                                                required
                                                type="text"
                                                value={sku}
                                                onChange={e => setSku(e.target.value)}
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                                placeholder="PRO-X-001"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Batch #</label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                                                <Hash size={16} strokeWidth={1.5} />
                                            </div>
                                            <input
                                                required
                                                type="text"
                                                value={lotNumber}
                                                onChange={e => setLotNumber(e.target.value)}
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                                placeholder="LOT-01"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Date</label>
                                        <input
                                            required
                                            type="date"
                                            value={entryDate}
                                            onChange={e => setEntryDate(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Quantity</label>
                                        <input
                                            required
                                            type="number"
                                            value={quantity || ''}
                                            onChange={e => setQuantity(Number(e.target.value))}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-bold text-primary outline-none transition-all"
                                            placeholder="0"
                                        />
                                    </div>

                                    {isAdmin && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Unit Cost ($)</label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                                                    <DollarSign size={16} strokeWidth={1.5} />
                                                </div>
                                                <input
                                                    type="number"
                                                    value={costPrice || ''}
                                                    onChange={e => setCostPrice(Number(e.target.value))}
                                                    className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 outline-none transition-all"
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Product Description</label>
                                        <textarea
                                            value={details}
                                            onChange={e => setDetails(e.target.value)}
                                            rows={2}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                            placeholder="Notes about this shipment..."
                                        />
                                    </div>
                                </div>

                                {isAdmin && quantity > 0 && costPrice > 0 && (
                                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex justify-between items-center group">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Transaction Value</span>
                                            <span className="text-[10px] text-primary/60 font-medium">Automatic Calculation</span>
                                        </div>
                                        <span className="text-2xl font-bold text-primary group-hover:scale-110 transition-transform">${(quantity * costPrice).toLocaleString()}</span>
                                    </div>
                                )}

                                <div className="flex gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="flex-1 py-3 px-6 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 rounded-xl text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-[2] py-3 px-6 bg-primary text-white rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50"
                                    >
                                        {loading ? 'Processing...' : 'Confirm Shipment'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Update Cost Modal */}
                {isUpdateModalOpen && selectedLot && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                    <DollarSign size={16} className="text-primary" />
                                    Cost Update
                                </h3>
                                <button onClick={() => setIsUpdateModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                    <X size={18} strokeWidth={1.5} />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Update Unit Price (₹)</label>
                                    <input
                                        type="number"
                                        value={newCost || ''}
                                        onChange={e => setNewCost(Number(e.target.value))}
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-lg font-bold text-gray-900 dark:text-gray-100 outline-none focus:border-primary transition-all"
                                        autoFocus
                                    />
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg text-[10px] text-gray-400 font-medium">
                                    Batch: {selectedLot.sku} ({selectedLot.qty} units)
                                </div>
                                <button
                                    onClick={handleUpdateCost}
                                    disabled={loading}
                                    className="w-full py-3 bg-primary text-white rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                                >
                                    {loading ? 'Saving...' : 'Confirm Update'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
