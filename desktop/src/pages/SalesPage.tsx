import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useSearchStore } from '../hooks/useSearchStore';
import { Plus, ShoppingCart, User, MapPin, Phone, DollarSign, X, History, CheckCircle2, Edit2 } from 'lucide-react';
import { format } from 'date-fns';

type SaleItem = {
    product: { sku: string };
    quantity: number;
};

type Sale = {
    id: string;
    order_date: string;
    destination_branch: string;
    parcel_status: 'processing' | 'sent' | 'delivered' | 'returned';
    customer_name: string;
    customer_address: string;
    phone1: string;
    phone2: string;
    cod_amount: number;
    created_at: string;
    // We'll derive products from transactions or sale_items
    items?: SaleItem[];
};

type ProductOption = {
    id: string;
    sku: string;
    total_stock: number;
};

export default function SalesPage() {
    const { user } = useAuthStore();
    const { query } = useSearchStore();

    // UI State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [sales, setSales] = useState<Sale[]>([]);

    const filteredSales = useMemo(() => {
        if (!query.trim()) return sales;
        const lowQuery = query.toLowerCase();
        return sales.filter(sale =>
            sale.customer_name.toLowerCase().includes(lowQuery) ||
            sale.phone1.includes(lowQuery) ||
            (sale.phone2 && sale.phone2.includes(lowQuery))
        );
    }, [sales, query]);

    // Form Fields
    const [orderDate, setOrderDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [destinationBranch, setDestinationBranch] = useState('');
    const [parcelStatus, setParcelStatus] = useState<'processing' | 'sent' | 'delivered' | 'returned'>('processing');
    const [customerName, setCustomerName] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [phone1, setPhone1] = useState('');
    const [phone2, setPhone2] = useState('');
    const [codAmount, setCodAmount] = useState<number>(0);

    // Multi-Product State
    const [orderItems, setOrderItems] = useState<{ productId: string, quantity: number }[]>([
        { productId: '', quantity: 1 }
    ]);
    const [availableProducts, setAvailableProducts] = useState<ProductOption[]>([]);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetchSales();

        const channel = supabase
            .channel('sales-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'sales'
            }, () => {
                fetchSales();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchSales = async () => {
        // Fetch sales and their associated transactions to identify products
        const { data } = await supabase
            .from('sales')
            .select(`
                *,
                transactions (
                    quantity_changed,
                    product:products(sku)
                )
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (data) {
            const processedSales = data.map((sale: any) => {
                // Group transactions by product SKU to show items
                const itemMap = new Map<string, number>();
                (sale.transactions || []).forEach((t: any) => {
                    if (t.product?.sku) {
                        const qty = Math.abs(t.quantity_changed);
                        itemMap.set(t.product.sku, (itemMap.get(t.product.sku) || 0) + qty);
                    }
                });

                return {
                    ...sale,
                    items: Array.from(itemMap.entries()).map(([sku, quantity]) => ({
                        product: { sku },
                        quantity
                    }))
                };
            });
            setSales(processedSales as any);
        }
    };

    const fetchAvailableProducts = async () => {
        // Fetch products with their lots and transactions to calculate true "Remaining"
        const { data } = await supabase
            .from('products')
            .select(`
                id,
                sku,
                product_lots (
                    id,
                    transactions (
                        type,
                        quantity_changed,
                        sales (parcel_status)
                    )
                )
            `);

        if (data) {
            const options = data.map((p: any) => {
                let productTotalRemaining = 0;

                (p.product_lots || []).forEach((lot: any) => {
                    const txs = lot.transactions || [];
                    const stockIn = txs
                        .filter((t: any) => t.type === 'in')
                        .reduce((sum: number, t: any) => sum + t.quantity_changed, 0);

                    const sold = txs
                        .filter((t: any) => {
                            if (t.type !== 'sale') return false;
                            if (t.sales) return ['processing', 'sent', 'delivered'].includes(t.sales.parcel_status);
                            return true; // Legacy
                        })
                        .reduce((sum: number, t: any) => sum + Math.abs(t.quantity_changed), 0);

                    productTotalRemaining += (stockIn - sold);
                });

                return {
                    id: p.id,
                    sku: p.sku,
                    total_stock: Math.max(0, productTotalRemaining)
                };
            }).filter(p => p.total_stock > 0);

            setAvailableProducts(options);
        }
    };

    useEffect(() => {
        if (isFormOpen) {
            fetchAvailableProducts();
        }
    }, [isFormOpen]);

    const openEntryForm = () => {
        setOrderDate(format(new Date(), 'yyyy-MM-dd'));
        setDestinationBranch('');
        setParcelStatus('processing');
        setCustomerName('');
        setCustomerAddress('');
        setPhone1('');
        setPhone2('');
        setCodAmount(0);
        setOrderItems([{ productId: '', quantity: 1 }]);
        setIsFormOpen(true);
        setMessage(null);
    };

    const handleStatusUpdate = async (newStatus: Sale['parcel_status']) => {
        if (!selectedSale) return;
        setLoading(true);

        try {
            const { error } = await supabase
                .from('sales')
                .update({ parcel_status: newStatus })
                .eq('id', selectedSale.id);

            if (error) throw error;

            // Update local states immediately for snappy UI
            setSales(currentSales =>
                currentSales.map(s =>
                    s.id === selectedSale.id ? { ...s, parcel_status: newStatus } : s
                )
            );

            setSelectedSale(prev => prev ? { ...prev, parcel_status: newStatus } : null);

            setMessage({ type: 'success', text: 'Status updated successfully!' });

            // Refresh main list to ensure sync
            await fetchSales();

            setTimeout(() => {
                setIsStatusModalOpen(false);
                setMessage(null);
            }, 800);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    const openStatusModal = (sale: Sale) => {
        setSelectedSale(sale);
        setIsStatusModalOpen(true);
        setMessage(null);
    };

    const handleCreateSale = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        // Validation
        if (phone1.length !== 10) {
            setMessage({ type: 'error', text: 'Phone Number 1 must be exactly 10 digits' });
            return;
        }

        // Ensure no empty products
        if (orderItems.some(item => !item.productId)) {
            setMessage({ type: 'error', text: 'Please select a product for all rows' });
            return;
        }

        setLoading(true);

        try {
            // 1. Verify Stock for all items first
            const deductionsToMake: any[] = [];

            for (const item of orderItems) {
                const { data: lots, error: lotError } = await supabase
                    .from('product_lots')
                    .select('id, product_id, received_date, transactions (type, quantity_changed, sales (parcel_status))')
                    .eq('product_id', item.productId)
                    .order('received_date', { ascending: true });

                if (lotError) throw lotError;

                // Calculate current remaining for each lot using the official formula
                const processedLots = (lots || []).map((lot: any) => {
                    const txs = lot.transactions || [];
                    const stockIn = txs
                        .filter((t: any) => t.type === 'in')
                        .reduce((sum: number, t: any) => sum + t.quantity_changed, 0);
                    const sold = txs
                        .filter((t: any) => {
                            if (t.type !== 'sale') return false;
                            if (t.sales) return ['processing', 'sent', 'delivered'].includes(t.sales.parcel_status);
                            return true;
                        })
                        .reduce((sum: number, t: any) => sum + Math.abs(t.quantity_changed), 0);

                    return {
                        ...lot,
                        calculatedRemaining: Math.max(0, stockIn - sold)
                    };
                }).filter(l => l.calculatedRemaining > 0);

                const totalStock = processedLots.reduce((sum, l) => sum + l.calculatedRemaining, 0);
                const productSku = availableProducts.find(p => p.id === item.productId)?.sku || 'Unknown';

                if (totalStock < item.quantity) {
                    throw new Error(`Insufficient stock for ${productSku}. Available: ${totalStock}`);
                }

                // Plan out FIFO deductions based on calculated remaining
                let remainingToDeduct = item.quantity;
                for (const lot of processedLots) {
                    if (remainingToDeduct <= 0) break;
                    const deduction = Math.min(lot.calculatedRemaining, remainingToDeduct);
                    deductionsToMake.push({
                        lotId: lot.id,
                        productId: lot.product_id,
                        deduction,
                        // We still update the physical quantity_remaining column for backward compatibility 
                        // and potential DB-level checks, though our logic is now transaction-based.
                        currentPhysical: lot.calculatedRemaining
                    });
                    remainingToDeduct -= deduction;
                }
            }

            // 2. Insert Sale Record (Header)
            const { data: newSale, error: saleError } = await supabase
                .from('sales')
                .insert([{
                    order_date: orderDate,
                    destination_branch: destinationBranch,
                    parcel_status: parcelStatus,
                    customer_name: customerName,
                    customer_address: customerAddress,
                    phone1,
                    phone2: phone2 || null,
                    cod_amount: codAmount,
                    // Legacy column support (optional: use first item)
                    product_id: deductionsToMake[0]?.productId,
                    quantity: orderItems.reduce((s, i) => s + i.quantity, 0),
                    recorded_by: user.id
                }])
                .select('id')
                .single();

            if (saleError) throw saleError;

            // 3. Commit Deductions and Log Transactions
            for (const step of deductionsToMake) {
                // Update Lot Physical Column (Stock In - Sold - New Deduction)
                await supabase.from('product_lots')
                    .update({ quantity_remaining: step.currentPhysical - step.deduction })
                    .eq('id', step.lotId);

                // Log Transaction
                await supabase.from('transactions').insert([{
                    product_id: step.productId,
                    lot_id: step.lotId,
                    sale_id: newSale.id,
                    type: 'sale',
                    quantity_changed: -step.deduction,
                    performed_by: user.id
                }]);
            }

            setMessage({ type: 'success', text: 'Order created successfully!' });
            fetchSales();
            setTimeout(() => setIsFormOpen(false), 1000);

        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    const addOrderItem = () => {
        setOrderItems([...orderItems, { productId: '', quantity: 1 }]);
    };

    const removeOrderItem = (index: number) => {
        if (orderItems.length > 1) {
            setOrderItems(orderItems.filter((_, i) => i !== index));
        }
    };

    const updateOrderItem = (index: number, field: string, value: any) => {
        const newItems = [...orderItems];
        (newItems[index] as any)[field] = value;
        setOrderItems(newItems);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'processing': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'sent': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'delivered': return 'bg-green-100 text-green-700 border-green-200';
            case 'returned': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const { profile } = useAuthStore();

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto space-y-8 pb-24 relative min-h-[80vh]">

                {/* Header */}
                <div className="flex items-center justify-between border-b dark:border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Sales & Orders</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Outbound Product Ledger</p>
                    </div>

                    <button
                        onClick={openEntryForm}
                        className="group relative flex items-center gap-3 px-8 py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/25 transition-all hover:scale-[1.02] active:scale-95 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <Plus size={24} className="relative z-10" />
                        <span className="relative z-10">New Order Entry</span>
                    </button>
                </div>

                {/* History Grid */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            <History size={20} className="text-gray-500" />
                        </div>
                        <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 font-outfit">Recent Shipments</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {filteredSales.length === 0 ? (
                            <div className="col-span-full py-24 flex flex-col items-center justify-center border-2 border-dashed dark:border-gray-800 rounded-[2.5rem] bg-gray-50/50 dark:bg-gray-900/20">
                                <ShoppingCart size={48} className="text-gray-200 dark:text-gray-800 mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No sales records found</p>
                            </div>
                        ) : (
                            filteredSales.map(sale => (
                                <div key={sale.id} className="group relative bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                                    {/* Top Status Bar */}
                                    <div className="p-6 pb-4 flex items-center justify-between border-b border-gray-50 dark:border-gray-800/50">
                                        <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(sale.parcel_status)}`}>
                                            {sale.parcel_status}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openStatusModal(sale)}
                                                className="h-10 w-10 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-xl text-gray-400 hover:text-primary transition-all hover:scale-110"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-6 space-y-6">
                                        {/* Customer Header */}
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Recipient</div>
                                                <h4 className="font-black text-xl text-gray-900 dark:text-gray-100 truncate font-outfit">{sale.customer_name}</h4>
                                                <div className="flex items-center gap-1.5 mt-2 text-xs font-bold text-gray-500">
                                                    <div className="p-1 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                                                        <MapPin size={10} className="text-blue-500" />
                                                    </div>
                                                    <span className="truncate">{sale.destination_branch}</span>
                                                </div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter block mb-1">Order Date</span>
                                                <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/80 rounded-lg text-[11px] font-black text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-700/50">
                                                    {format(new Date(sale.order_date), 'MMM dd')}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Contact & Address Section */}
                                        <div className="grid grid-cols-1 gap-4 bg-gray-50/50 dark:bg-gray-800/30 p-4 rounded-3xl border border-gray-100 dark:border-gray-800/50">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-500">
                                                    <Phone size={14} />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Contact Info</span>
                                                    <span className="text-xs font-black text-gray-700 dark:text-gray-300 tracking-wider">
                                                        {sale.phone1}{sale.phone2 ? ` / ${sale.phone2}` : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="h-8 w-8 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500 flex-shrink-0">
                                                    <ShoppingCart size={14} />
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Delivery Address</span>
                                                    <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed italic">
                                                        "{sale.customer_address}"
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Products Section */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between px-1">
                                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-[0.2em]">Package Manifest</span>
                                                <span className="text-[10px] font-black text-primary px-2 py-0.5 bg-primary/10 rounded-md">
                                                    {(sale.items || []).length} SKU(s)
                                                </span>
                                            </div>
                                            <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                                {(sale.items || []).map((item: any, idx: number) => (
                                                    <div key={idx} className="flex justify-between items-center bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50 px-4 py-2.5 rounded-2xl shadow-sm">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-2 w-2 rounded-full bg-primary/40"></div>
                                                            <span className="text-xs font-black text-gray-700 dark:text-gray-300">{item.product.sku}</span>
                                                        </div>
                                                        <span className="text-xs font-black bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-800 text-primary font-mono select-none">
                                                            x{item.quantity}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action/Price Footer */}
                                    <div className="p-6 pt-2 bg-gradient-to-br from-primary/5 to-primary/[0.02] dark:from-primary/10 dark:to-transparent border-t border-primary/10">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Total COD (Payable)</span>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-2xl font-black text-primary font-outfit tracking-tighter">
                                                        ${Number(sale.cod_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-12 w-12 rounded-full bg-white dark:bg-gray-800 shadow-lg flex items-center justify-center text-primary group-hover:rotate-12 transition-transform">
                                                <DollarSign size={20} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Form Modal */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/5 flex flex-col max-h-[90vh]">
                            <div className="p-8 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent flex-shrink-0">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-primary text-white rounded-xl shadow-lg">
                                            <ShoppingCart size={20} />
                                        </div>
                                        <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 font-outfit uppercase">Create Sale Record</h2>
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.3em] mt-2 ml-12">New Outbound Transaction</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-12 w-12 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 text-gray-500 hover:text-red-500 transition-all">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleCreateSale} className="p-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                                {message && (
                                    <div className={`p-5 rounded-2xl text-sm font-black flex items-center gap-3 animate-in slide-in-from-left-4 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        <CheckCircle2 size={20} /> {message.text}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {/* Order Core Info */}
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Order Date *</label>
                                        <input required type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="w-full h-12 px-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-bold" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Destination Branch *</label>
                                        <input required type="text" value={destinationBranch} onChange={e => setDestinationBranch(e.target.value)} className="w-full h-12 px-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-bold" placeholder="Region / Branch Name" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Parcel Status *</label>
                                        <select required value={parcelStatus} onChange={e => setParcelStatus(e.target.value as any)} className="w-full h-12 px-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-black">
                                            <option value="processing">Parcel Processing</option>
                                            <option value="sent">Parcel Sent</option>
                                            <option value="delivered">Delivered</option>
                                            <option value="returned">Returned</option>
                                        </select>
                                    </div>

                                    {/* Customer Info */}
                                    <div className="md:col-span-2 space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Customer Full Name *</label>
                                        <div className="relative">
                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                            <input required type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full h-12 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-bold" placeholder="Customer Name" />
                                        </div>
                                    </div>
                                    <div className="space-y-2 lg:col-span-1 md:col-span-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Phone Number 1 * (10 Digits)</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                            <input required type="text" maxLength={10} value={phone1} onChange={e => setPhone1(e.target.value.replace(/\D/g, ''))} className="w-full h-12 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-black tracking-widest" placeholder="1234567890" />
                                        </div>
                                    </div>

                                    <div className="md:col-span-2 space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Full Delivery Address *</label>
                                        <textarea required rows={2} value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-medium" placeholder="House no, Street, City, Landmark..." />
                                    </div>
                                    <div className="space-y-2 lg:col-span-1 md:col-span-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Phone Number 2 (Optional - 10 Digits)</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                            <input type="text" maxLength={10} value={phone2} onChange={e => setPhone2(e.target.value.replace(/\D/g, ''))} className="w-full h-12 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-black tracking-widest" placeholder="1234567890" />
                                        </div>
                                    </div>

                                    {/* Products Selection Section - Multi Product */}
                                    <div className="col-span-full space-y-6">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Order Items *</label>
                                            <button
                                                type="button"
                                                onClick={addOrderItem}
                                                className="text-[10px] font-black text-primary uppercase bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-all"
                                            >
                                                + Add Product
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            {orderItems.map((item, index) => (
                                                <div key={index} className="flex flex-col sm:flex-row gap-4 items-end bg-gray-50 dark:bg-gray-800/30 p-4 rounded-2xl border border-dashed dark:border-gray-800 animate-in slide-in-from-top-2">
                                                    <div className="flex-1 space-y-2 w-full">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Select Product</label>
                                                        <select
                                                            required
                                                            value={item.productId}
                                                            onChange={e => updateOrderItem(index, 'productId', e.target.value)}
                                                            className="w-full h-12 px-4 bg-white dark:bg-gray-800 border-2 dark:border-gray-700 rounded-xl outline-none focus:border-primary/50 font-black text-sm"
                                                        >
                                                            <option value="">-- Choose SKU --</option>
                                                            {availableProducts.map(p => (
                                                                <option key={p.id} value={p.id}>
                                                                    {p.sku} (Available: {p.total_stock})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="w-full sm:w-32 space-y-2">
                                                        <label className="text-[9px] font-black text-gray-400 uppercase ml-1">Quantity</label>
                                                        <input
                                                            required
                                                            type="number"
                                                            min="1"
                                                            value={item.quantity}
                                                            onChange={e => updateOrderItem(index, 'quantity', Number(e.target.value))}
                                                            className="w-full h-12 px-4 bg-white dark:bg-gray-800 border-2 dark:border-gray-700 rounded-xl outline-none focus:border-primary/50 font-black"
                                                        />
                                                    </div>

                                                    {orderItems.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => removeOrderItem(index)}
                                                            className="h-12 w-12 flex items-center justify-center bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-xl hover:bg-rose-100 transition-all"
                                                        >
                                                            <X size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2 col-span-full">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Total COD Amount ($) *</label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                            <input required type="number" step="0.01" value={codAmount || ''} onChange={e => setCodAmount(Number(e.target.value))} className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-black text-xl text-primary" placeholder="0.00" />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-10 flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto w-full">
                                    <button type="button" onClick={() => setIsFormOpen(false)} className="h-14 px-10 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-black rounded-2xl transition-all hover:bg-gray-200">
                                        Discard Order
                                    </button>
                                    <button type="submit" disabled={loading} className="flex-1 h-14 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/30 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50">
                                        {loading ? 'Processing Order...' : 'Confirm Shipment'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Status Update Modal */}
                {isStatusModalOpen && selectedSale && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/5">
                            <div className="p-8 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit uppercase">Update Status</h2>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mt-1 line-clamp-1">{selectedSale.customer_name}</p>
                                </div>
                                <button onClick={() => setIsStatusModalOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 text-gray-500 hover:text-red-500 transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 space-y-6">
                                {message && (
                                    <div className={`p-4 rounded-xl text-xs font-black flex items-center gap-3 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        <CheckCircle2 size={16} /> {message.text}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-3">
                                    {(['processing', 'sent', 'delivered', 'returned'] as const).map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => handleStatusUpdate(status)}
                                            disabled={loading}
                                            className={`h-14 px-6 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-between border-2 ${selectedSale.parcel_status === status
                                                ? 'bg-primary text-white border-primary shadow-lg shadow-primary/25'
                                                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 border-transparent hover:border-primary/30'
                                                }`}
                                        >
                                            {status}
                                            {selectedSale.parcel_status === status && <CheckCircle2 size={18} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </DashboardLayout>
    );
}
