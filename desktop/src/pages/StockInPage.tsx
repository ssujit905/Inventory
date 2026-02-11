import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { Plus, DollarSign, Package, AlertCircle, Barcode, X, History, ArrowRight } from 'lucide-react';
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

    // Form Selection

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
    const totalAmount = quantity * costPrice;

    useEffect(() => {
        fetchRecentTransactions();

        // Setup real-time subscription for transactions
        const channel = supabase
            .channel('transactions-in-changes-v2')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'product_lots'
            }, () => {
                fetchRecentTransactions();
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'transactions',
                filter: "type=eq.in"
            }, () => {
                fetchRecentTransactions();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

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
        if (!Number.isFinite(newCost) || newCost <= 0) {
            setMessage({ type: 'error', text: 'Enter a valid cost greater than 0.' });
            return;
        }
        setLoading(true);

        try {
            const { data: updatedLot, error } = await supabase
                .from('product_lots')
                .update({ cost_price: newCost })
                .eq('id', selectedLot.id)
                .select('id, cost_price')
                .maybeSingle();

            if (error) throw error;
            if (!updatedLot) {
                throw new Error('Update failed. No row updated (check permissions or lot id).');
            }

            setMessage({ type: 'success', text: 'Cost price updated!' });
            setRecentTransactions(prev =>
                prev.map(tx =>
                    tx.lot?.id === updatedLot.id
                        ? {
                            ...tx,
                            lot: {
                                ...tx.lot,
                                cost_price: updatedLot.cost_price,
                            },
                        }
                        : tx
                )
            );
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
        if (!lotId) {
            setMessage({ type: 'error', text: 'Missing lot id for update.' });
            return;
        }
        setSelectedLot({ id: lotId, sku, qty });
        setNewCost(currentCost);
        setIsUpdateModalOpen(true);
        setMessage(null);
    };

    const openEntryForm = () => {
        setSku('');
        setDetails('');
        setIsFormOpen(true);
        setLotNumber('');
        setQuantity(0);
        setCostPrice(0);
        setEntryDate('');
        setMessage(null);
    };

    const handleStockIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            let productId;

            // 1. Check if product with this SKU already exists
            const { data: existingProd } = await supabase
                .from('products')
                .select('id')
                .eq('sku', sku)
                .maybeSingle();

            if (existingProd) {
                productId = existingProd.id;
            } else {
                // Create Product if new
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

            if (!productId) throw new Error("Product identification failed");

            // 2. Create Lot
            const { data: lotData, error: lotError } = await supabase
                .from('product_lots')
                .insert([{
                    product_id: productId,
                    lot_number: lotNumber,
                    expiry_date: null,
                    received_date: entryDate ? `${entryDate}T00:00:00Z` : undefined,
                    quantity_remaining: quantity,
                    cost_price: isAdmin ? costPrice : 0,
                    created_by: user.id
                }])
                .select()
                .single();

            if (lotError) throw lotError;

            // 3. Create Transaction Record
            const { error: transError } = await supabase.from('transactions').insert([{
                product_id: productId,
                lot_id: lotData.id,
                type: 'in',
                quantity_changed: quantity,
                performed_by: user.id
            }]);

            if (transError) throw transError;

            setMessage({ type: 'success', text: 'Stock received successfully!' });

            // Immediate UI update before modal close
            await fetchRecentTransactions();

            setTimeout(() => {
                setIsFormOpen(false);
            }, 800);

        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-6xl mx-auto space-y-8 pb-24 relative min-h-[80vh]">

                {/* Header Section */}
                <div className="flex items-center justify-between border-b dark:border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Stock In Records</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Inbound Product Batches</p>
                    </div>

                    <button
                        onClick={openEntryForm}
                        className="group relative flex items-center gap-3 px-8 py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/25 transition-all hover:scale-[1.02] active:scale-95 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <Plus size={24} className="relative z-10" />
                        <span className="relative z-10">New Product Receipt</span>
                    </button>
                </div>

                {/* History Section */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                <History size={20} className="text-gray-500" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 font-outfit">Records</h3>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {recentTransactions.length === 0 ? (
                            <div className="py-24 flex flex-col items-center justify-center border-2 border-dashed dark:border-gray-800 rounded-[2.5rem] bg-gray-50/50 dark:bg-gray-900/20">
                                <Package size={48} className="text-gray-200 dark:text-gray-800 mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No Intake records yet</p>
                                <button onClick={openEntryForm} className="mt-4 text-primary font-black flex items-center gap-2 hover:underline">
                                    Create First Entry <ArrowRight size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <div className="col-span-2">Date</div>
                                    <div className="col-span-3">SKU</div>
                                    <div className="col-span-3">Description</div>
                                    <div className="col-span-2 text-right">Qty</div>
                                    <div className="col-span-2 text-right">Lot</div>
                                </div>
                                {recentTransactions.map((tx, index) => {
                                    const isPendingCost = (tx.lot?.cost_price || 0) === 0;
                                    const displayIndex = recentTransactions.length - index;
                                    return (
                                        <div key={tx.id} className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all">
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 items-center">
                                                <div className="md:col-span-2 flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center text-xs font-black">
                                                        {displayIndex}
                                                    </div>
                                                    <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                        {format(new Date(tx.lot?.received_date || tx.created_at), 'MMM dd, yyyy')}
                                                    </span>
                                                </div>
                                                <div className="md:col-span-3 flex items-center gap-3">
                                                    <div className="h-9 w-9 bg-primary/5 dark:bg-primary/10 rounded-lg flex items-center justify-center text-primary flex-shrink-0">
                                                        <Barcode size={14} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-black text-gray-900 dark:text-gray-100 truncate">{tx.product?.sku}</div>
                                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">SKU</div>
                                                    </div>
                                                </div>
                                                <div className="md:col-span-3 text-xs text-gray-600 dark:text-gray-300 line-clamp-1 italic leading-relaxed">
                                                    {tx.product?.description || 'No description provided'}
                                                </div>
                                                <div className="md:col-span-2 text-right text-sm font-black text-primary font-mono tracking-tight">
                                                    +{tx.quantity_changed}
                                                </div>
                                                <div className="md:col-span-2 text-right text-xs font-black text-gray-700 dark:text-gray-300 font-mono tracking-tight">
                                                    #{tx.lot?.lot_number}
                                                </div>
                                            </div>

                                            {isAdmin && (
                                                <div className="px-6 pb-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                                        <span className="md:text-left">Unit: ₹{Number(tx.lot?.cost_price || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                        <span className="md:text-left">Total: ₹{(tx.quantity_changed * (tx.lot?.cost_price || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                        <span className="md:text-left">
                                                            {isPendingCost ? (
                                                                <span className="inline-flex px-2.5 py-1 bg-rose-50 dark:bg-rose-950/20 text-rose-500 text-[9px] font-black uppercase tracking-widest rounded-full border border-rose-100 dark:border-rose-900/30">
                                                                    Pending
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex px-2.5 py-1 bg-green-50 dark:bg-green-950/20 text-green-600 text-[9px] font-black uppercase tracking-widest rounded-full border border-green-100 dark:border-green-900/30">
                                                                    Verified
                                                                </span>
                                                            )}
                                                        </span>
                                                        <button
                                                            onClick={() => openUpdateModal(tx.lot?.id, tx.product?.sku, tx.quantity_changed, tx.lot?.cost_price)}
                                                            className="md:justify-self-end px-5 py-2.5 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-colors"
                                                        >
                                                            Update Cost Price
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>

                {/* Form Modal */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/5">
                            <div className="p-10 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 font-outfit flex items-center gap-3">
                                        <div className="p-2 bg-primary text-white rounded-xl shadow-lg shadow-primary/30">
                                            <Plus size={20} />
                                        </div>
                                        New Receipt
                                    </h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mt-2">Inventory Ledger Entry</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-12 w-12 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-500 hover:text-red-500 transition-all">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleStockIn} className="p-10 space-y-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
                                {message && (
                                    <div className={`p-5 rounded-2xl text-sm font-black flex items-center gap-3 animate-in slide-in-from-left-4 ${message.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                                        <AlertCircle size={20} /> {message.text}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em] mb-3">Product Identifier (ID) <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-300" />
                                            <input
                                                required
                                                type="text"
                                                value={sku}
                                                onChange={e => setSku(e.target.value)}
                                                className="w-full h-16 pl-14 pr-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 font-black text-lg transition-all text-gray-900 dark:text-gray-100"
                                                placeholder="Enter SKU or Product ID"
                                            />
                                        </div>
                                    </div>

                                    <div className="col-span-2">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em] mb-3">Description / Details <span className="text-red-500">*</span></label>
                                        <textarea
                                            required
                                            rows={2}
                                            value={details}
                                            onChange={e => setDetails(e.target.value)}
                                            className="w-full p-5 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/5 font-medium transition-all text-gray-900 dark:text-gray-100"
                                            placeholder="Notes about this product intake..."
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Batch / Lot Number <span className="text-red-500">*</span></label>
                                        <input
                                            required
                                            type="text"
                                            value={lotNumber}
                                            onChange={e => setLotNumber(e.target.value)}
                                            className="w-full h-14 px-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-primary/50 font-bold text-gray-900 dark:text-gray-100"
                                            placeholder="LOT-2024-X"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Received Date <span className="text-red-500">*</span></label>
                                        <input
                                            required
                                            type="date"
                                            value={entryDate}
                                            onChange={e => setEntryDate(e.target.value)}
                                            className="w-full h-14 px-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-primary/50 font-black text-gray-900 dark:text-gray-100"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Receipt Quantity <span className="text-red-500">*</span></label>
                                        <input
                                            required
                                            type="number"
                                            min="1"
                                            value={quantity || ''}
                                            onChange={e => setQuantity(Number(e.target.value))}
                                            className="w-full h-14 px-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-primary/50 font-black text-2xl text-primary text-gray-900 dark:text-gray-100"
                                        />
                                    </div>

                                    {isAdmin && (
                                        <div className="space-y-3">
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Unit Purchase Cost</label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                                <input
                                                    type="number"
                                                    step="1"
                                                    value={costPrice || ''}
                                                    onChange={e => setCostPrice(Number(e.target.value))}
                                                    className="w-full h-14 pl-12 pr-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-primary/50 font-black text-gray-900 dark:text-gray-100"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {isAdmin && (
                                        <div className="col-span-2 p-6 bg-primary/[0.03] dark:bg-primary/[0.05] rounded-3xl flex items-center justify-between border-2 border-primary/10 border-dashed">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Transaction Value</span>
                                                <span className="text-xs text-primary/60 font-medium">Automatic Calculation</span>
                                            </div>
                                            <span className="text-3xl font-black text-primary font-mono">${totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    )}

                                    <div className="col-span-2">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em] mb-3 flex items-center gap-2">
                                            <div className="h-1.5 w-1.5 rounded-full bg-gray-300"></div> Reference Image URL
                                        </label>
                                        <input
                                            type="text"
                                            value={imageUrl}
                                            onChange={e => setImageUrl(e.target.value)}
                                            className="w-full h-14 px-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-primary/50 text-xs text-gray-400 font-medium text-gray-900 dark:text-gray-100"
                                            placeholder="https://cloud-storage.com/product-img.jpg"
                                        />
                                    </div>
                                </div>

                                <div className="pt-6 flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="h-16 px-10 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-black rounded-2xl transition-all hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 h-16 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/30 transition-all hover:scale-[1.01] hover:bg-primary-dark active:scale-95 disabled:opacity-50"
                                    >
                                        {loading ? 'Submitting Data...' : 'Confirm Receipt'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Update Cost Modal (Admin Only) */}
                {isUpdateModalOpen && selectedLot && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/5">
                            <div className="p-8 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit uppercase">Update Batch Cost</h2>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mt-1 line-clamp-1">{selectedLot.sku} - {selectedLot.qty} Units</p>
                                </div>
                                <button onClick={() => setIsUpdateModalOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 text-gray-500 hover:text-red-500 transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleUpdateCost} className="p-8 space-y-6">
                                {message && (
                                    <div className={`p-4 rounded-xl text-xs font-black flex items-center gap-3 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        <AlertCircle size={16} /> {message.text}
                                    </div>
                                )}

                                <div className="space-y-3">
                                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Unit Purchase Price ($)</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                        <input
                                            required
                                            type="number"
                                            step="1"
                                            value={newCost || ''}
                                            onChange={e => setNewCost(Number(e.target.value))}
                                            className="w-full h-14 pl-12 pr-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-primary/50 font-black text-lg"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 flex justify-between items-center">
                                    <span className="text-[10px] font-black text-gray-400 uppercase">Projected Total</span>
                                    <span className="text-xl font-black text-primary font-mono">${(selectedLot.qty * newCost).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-14 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/30 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                                >
                                    {loading ? 'Saving...' : 'Verify & Update Value'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

            </div>
        </DashboardLayout>
    );
}
