import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useSearchStore } from '../hooks/useSearchStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { Plus, ShoppingCart, User, Phone, DollarSign, X, History, CheckCircle2, Edit2, Eye, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';

type SaleItem = {
    id?: string;
    product: { sku: string };
    quantity: number;
    sold_amount?: number | null;
    product_id?: string;
};

type SaleItemRow = {
    id: string;
    quantity: number;
    sold_amount: number | null;
    product: { sku: string } | null;
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
    sold_amount?: number | null;
    return_cost?: number | null;
    ad_id?: string | null;
    created_at: string;
    // We'll derive products from sale_items
    items?: SaleItem[];
};

type ProductOption = {
    id: string;
    sku: string;
    total_stock: number;
};

type AdOption = {
    id: string;
    description: string;
    amount: number;
};

export default function SalesPage() {
    const { user, profile } = useAuthStore();
    const isAdmin = profile?.role === 'admin';
    const { query } = useSearchStore();

    // UI State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
    const [viewSale, setViewSale] = useState<Sale | null>(null);
    const [saleItems, setSaleItems] = useState<SaleItemRow[]>([]);
    const [soldAmountInput, setSoldAmountInput] = useState<number | ''>('');
    const [returnCostInput, setReturnCostInput] = useState<number | ''>('');
    const [sales, setSales] = useState<Sale[]>([]);
    const [pendingStatus, setPendingStatus] = useState<'delivered' | 'returned' | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportDate, setExportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [exportNotice, setExportNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const filteredSales = useMemo(() => {
        if (!query.trim()) return sales;
        const lowQuery = query.toLowerCase();
        return sales.filter(sale =>
            sale.customer_name.toLowerCase().includes(lowQuery) ||
            sale.phone1.includes(lowQuery) ||
            (sale.phone2 && sale.phone2.includes(lowQuery))
        );
    }, [sales, query]);
    const isSearchMode = query.trim().length > 0;

    // Form Fields
    const [orderDate, setOrderDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [destinationBranch, setDestinationBranch] = useState('');
    const [parcelStatus, setParcelStatus] = useState<'processing' | 'sent' | 'delivered' | 'returned'>('processing');
    const [customerName, setCustomerName] = useState('');
    const [customerAddress, setCustomerAddress] = useState('');
    const [phone1, setPhone1] = useState('');
    const [phone2, setPhone2] = useState('');
    const [codAmount, setCodAmount] = useState<number>(0);
    const [adId, setAdId] = useState('');

    // Multi-Product State
    const [orderItems, setOrderItems] = useState<{ productId: string, quantity: number }[]>([
        { productId: '', quantity: 1 }
    ]);
    const [baseAvailableProducts, setBaseAvailableProducts] = useState<ProductOption[]>([]);
    const [adsOptions, setAdsOptions] = useState<AdOption[]>([]);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetchSales();
    }, []);

    useRealtimeRefresh(
        () => fetchSales(),
        {
            channelName: 'sales-changes-v2',
            tables: ['sales', 'sale_items', 'product_lots', 'transactions'],
            pollMs: 8000
        }
    );

    const fetchSales = async () => {
        // Fetch sales and their associated transactions to identify products
        const { data } = await supabase
            .from('sales')
            .select(`
                *,
                sale_items (
                    id,
                    quantity,
                    sold_amount,
                    product:products(sku)
                )
            `)
            .order('created_at', { ascending: false })
            .limit(100);

        if (data) {
            const processedSales = data.map((sale: any) => {
                return {
                    ...sale,
                    items: (sale.sale_items || []).map((i: any) => ({
                        id: i.id,
                        product: { sku: i.product?.sku || 'SKU' },
                        quantity: i.quantity,
                        sold_amount: i.sold_amount ?? null
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

            setBaseAvailableProducts(options);
        }
    };

    useEffect(() => {
        if (isFormOpen) {
            fetchAvailableProducts();
            fetchAds();
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
        setAdId('');
        setOrderItems([{ productId: '', quantity: 1 }]);
        setIsFormOpen(true);
        setMessage(null);
    };

    const fetchAds = async () => {
        const { data } = await supabase
            .from('expenses')
            .select('id, description, amount')
            .eq('category', 'ads')
            .order('created_at', { ascending: false });

        if (data) setAdsOptions(data as AdOption[]);
    };

    const handleStatusUpdate = async (newStatus: Sale['parcel_status']) => {
        if (!selectedSale) return;
        setLoading(true);

        try {
            if (!isAdmin && newStatus === 'delivered' && Number(selectedSale.sold_amount || 0) > 0) {
                throw new Error('Delivered amount can only be entered once by staff. Ask admin to edit.');
            }
            if (!isAdmin && newStatus === 'returned' && Number(selectedSale.return_cost || 0) > 0) {
                throw new Error('Return cost can only be entered once by staff. Ask admin to edit.');
            }

            if (newStatus === 'delivered') {
                if (!soldAmountInput || Number(soldAmountInput) <= 0) {
                    throw new Error('Enter sold amount before marking as delivered.');
                }
            }
            if (newStatus === 'returned') {
                if (!returnCostInput || Number(returnCostInput) <= 0) {
                    throw new Error('Enter return courier cost before marking as returned.');
                }
            }

            const { error } = await supabase
                .from('sales')
                .update({
                    parcel_status: newStatus,
                    sold_amount: newStatus === 'delivered' ? Number(soldAmountInput || 0) : selectedSale.sold_amount,
                    return_cost: newStatus === 'returned' ? Number(returnCostInput || 0) : selectedSale.return_cost
                })
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

    const openStatusModal = async (sale: Sale) => {
        setSelectedSale(sale);
        setIsStatusModalOpen(true);
        setMessage(null);
        setSoldAmountInput(sale.sold_amount ?? '');
        setReturnCostInput(sale.return_cost ?? '');
        setPendingStatus(null);

        const { data, error } = await supabase
            .from('sale_items')
            .select(`
                id,
                quantity,
                sold_amount,
                product:products(sku)
            `)
            .eq('sale_id', sale.id);

        if (!error && data) {
            setSaleItems(data as any);
        }
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
                const productSku = baseAvailableProducts.find(p => p.id === item.productId)?.sku || 'Unknown';

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
                    ad_id: adId || null,
                    // Legacy column support (optional: use first item)
                    product_id: deductionsToMake[0]?.productId,
                    quantity: orderItems.reduce((s, i) => s + i.quantity, 0),
                    recorded_by: user.id
                }])
                .select('id')
                .single();

            if (saleError) throw saleError;

            // 3. Insert sale items (for accurate sold amount tracking)
            const saleItemsPayload = orderItems.map(i => ({
                sale_id: newSale.id,
                product_id: i.productId,
                quantity: i.quantity
            }));
            const { error: itemsError } = await supabase
                .from('sale_items')
                .insert(saleItemsPayload);

            if (itemsError) throw itemsError;

            // 4. Commit Deductions and Log Transactions
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

    const openViewModal = (sale: Sale) => {
        setViewSale(sale);
        setIsViewModalOpen(true);
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

    const getRemainingForProduct = (productId: string, excludeIndex: number) => {
        const base = baseAvailableProducts.find(p => p.id === productId);
        if (!base) return 0;
        const reserved = orderItems.reduce((sum, item, idx) => {
            if (idx === excludeIndex) return sum;
            if (item.productId !== productId) return sum;
            return sum + Number(item.quantity || 0);
        }, 0);
        return Math.max(0, base.total_stock - reserved);
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

    const handleExportSales = () => {
        setExportDate(format(new Date(), 'yyyy-MM-dd'));
        setIsExportModalOpen(true);
    };

    const handleConfirmExport = async () => {
        setIsExportModalOpen(false);
        const { data, error } = await supabase
            .from('sales')
            .select(`
                id,
                order_date,
                destination_branch,
                parcel_status,
                customer_name,
                customer_address,
                phone1,
                phone2,
                cod_amount,
                sold_amount,
                return_cost,
                ad_id,
                created_at,
                sale_items (
                    quantity,
                    product:products(sku)
                )
            `)
            .eq('order_date', exportDate)
            .order('created_at', { ascending: false });

        if (error) {
            setExportNotice({ type: 'error', text: `Export failed: ${error.message}` });
            return;
        }

        const rows = (data || []).map((sale: any) => {
            const items = (sale.sale_items || []).map((it: any) => `${it.product?.sku || 'SKU'} x${it.quantity}`);
            return [
                sale.order_date,
                sale.destination_branch,
                sale.customer_name,
                sale.customer_address,
                sale.phone1,
                sale.phone2 || '',
                sale.cod_amount,
                items.join(' | ')
            ];
        });

        if (rows.length === 0) {
            setExportNotice({ type: 'error', text: 'No sales found for selected date.' });
            return;
        }

        const sheetRows = [
            [
                'order_date',
                'destination_branch',
                'customer_name',
                'customer_address',
                'phone1',
                'phone2',
                'cod_amount',
                'items_detail'
            ],
            ...rows
        ];

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
        worksheet['!cols'] = [
            { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 30 }, { wch: 14 },
            { wch: 14 }, { wch: 12 }, { wch: 40 }
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales');
        const fileName = `sales_export_${exportDate}.xlsx`;
        const ipc = (window as any).ipcRenderer;

        if (ipc?.invoke) {
            const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
            const result = await ipc.invoke('save-xlsx-download', { fileName, base64 });
            if (!result?.ok) {
                setExportNotice({ type: 'error', text: `Export failed: ${result?.error || 'Unable to save file'}` });
                return;
            }
            setExportNotice({ type: 'success', text: `File saved to Downloads: ${fileName}` });
        } else {
            XLSX.writeFile(workbook, fileName);
            setExportNotice({ type: 'success', text: `File exported: ${fileName}` });
        }
        setTimeout(() => setExportNotice(null), 4000);
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto space-y-8 pb-24 relative min-h-[80vh]">

                {!isSearchMode && (
                    <div className="flex flex-col gap-4 border-b dark:border-gray-800 pb-6">
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Sales & Orders</h1>
                            <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Outbound Product Ledger</p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full sm:w-auto">
                            <button
                                onClick={handleExportSales}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg font-bold text-xs hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-full sm:w-auto"
                            >
                                <FileDown size={16} />
                                Export
                            </button>
                            <button
                                onClick={openEntryForm}
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90 transition-all shadow-sm active:scale-95 w-full sm:w-auto"
                            >
                                <Plus size={16} strokeWidth={2.5} />
                                New Order Entry
                            </button>
                        </div>
                    </div>
                )}

                {/* History Grid */}
                <div className="space-y-6">
                    {exportNotice && (
                        <div className={`px-4 py-3 rounded-xl text-sm font-bold border ${exportNotice.type === 'success'
                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/20 dark:text-green-300 dark:border-green-900/30'
                            : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-300 dark:border-red-900/30'
                            }`}>
                            {exportNotice.text}
                        </div>
                    )}
                    {!isSearchMode && (
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                <History size={20} className="text-gray-500" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 font-outfit">Recent Shipments</h3>
                        </div>
                    )}

                    <div className="space-y-3">
                        {filteredSales.length === 0 ? (
                            <div className="py-24 flex flex-col items-center justify-center border-2 border-dashed dark:border-gray-800 rounded-[2.5rem] bg-gray-50/50 dark:bg-gray-900/20">
                                <ShoppingCart size={48} className="text-gray-200 dark:text-gray-800 mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No sales records found</p>
                            </div>
                        ) : (
                            <>
                                <div className="hidden md:grid grid-cols-12 gap-5 px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <div className="col-span-2">Date</div>
                                    <div className="col-span-2">Customer</div>
                                    <div className="col-span-2">Branch</div>
                                    <div className="col-span-2 text-right">COD</div>
                                    <div className="col-span-2 text-right">Status</div>
                                    <div className="col-span-2 text-right">Actions</div>
                                </div>
                                {filteredSales.map((sale, index) => {
                                    const displayIndex = filteredSales.length - index;
                                    return (
                                        <div key={sale.id} className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black">
                                                {displayIndex}
                                            </div>
                                            <div className="flex flex-col gap-3 pl-12 pr-4 py-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                        {format(new Date(sale.order_date), 'MMM dd, yyyy')}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(sale.parcel_status)}`}>
                                                            {sale.parcel_status}
                                                        </span>
                                                        <button
                                                            onClick={() => openStatusModal(sale)}
                                                            className="h-8 w-8 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-500 hover:text-primary transition-all"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => openViewModal(sale)}
                                                            className="h-8 w-8 flex items-center justify-center bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="min-w-0">
                                                    <div className="text-sm font-black text-gray-900 dark:text-gray-100 truncate">{sale.customer_name}</div>
                                                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                                        {sale.phone1}{sale.phone2 ? ` / ${sale.phone2}` : ''}
                                                    </div>
                                                </div>

                                                <div className="text-left text-sm font-black text-primary font-mono tracking-tight">
                                                    ${Number(sale.cod_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>

                {isExportModalOpen && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/5">
                            <div className="p-6 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
                                <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase">Export Sales</h3>
                                <button onClick={() => setIsExportModalOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 text-gray-500 hover:text-red-500 transition-all">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6 space-y-5">
                                <div className="space-y-2">
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Date</label>
                                    <input
                                        type="date"
                                        value={exportDate}
                                        onChange={(e) => setExportDate(e.target.value)}
                                        className="w-full h-12 px-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-black"
                                    />
                                </div>
                                <p className="text-xs text-gray-500">Exports all sales for the selected date in a row-wise CSV file (Excel/Numbers compatible).</p>
                                <div className="flex gap-3 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setIsExportModalOpen(false)}
                                        className="h-11 px-5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-black rounded-xl text-xs uppercase tracking-widest"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConfirmExport}
                                        className="flex-1 h-11 bg-primary text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-lg shadow-primary/20"
                                    >
                                        Export File
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

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
                                        <input required type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="w-full h-12 px-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-bold text-gray-900 dark:text-gray-100" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Destination Branch *</label>
                                        <input required type="text" value={destinationBranch} onChange={e => setDestinationBranch(e.target.value)} className="w-full h-12 px-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-bold" placeholder="Region / Branch Name" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Parcel Status *</label>
                                        <select required value={parcelStatus} onChange={e => setParcelStatus(e.target.value as any)} className="w-full h-12 px-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-black text-gray-900 dark:text-gray-100">
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
                                        <textarea required rows={2} value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-medium text-gray-900 dark:text-gray-100" placeholder="House no, Street, City, Landmark..." />
                                    </div>
                                    <div className="space-y-2 lg:col-span-1 md:col-span-2">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Phone Number 2 (Optional - 10 Digits)</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                            <input type="text" maxLength={10} value={phone2} onChange={e => setPhone2(e.target.value.replace(/\D/g, ''))} className="w-full h-12 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-black tracking-widest text-gray-900 dark:text-gray-100" placeholder="1234567890" />
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
                                                            className="w-full h-12 px-4 bg-white dark:bg-gray-800 border-2 dark:border-gray-700 rounded-xl outline-none focus:border-primary/50 font-black text-sm text-gray-900 dark:text-gray-100"
                                                        >
                                                            <option value="">-- Choose SKU --</option>
                                                            {baseAvailableProducts.map(p => {
                                                                const remaining = getRemainingForProduct(p.id, index);
                                                                const isSelected = item.productId === p.id;
                                                                return (
                                                                    <option key={p.id} value={p.id} disabled={!isSelected && remaining <= 0}>
                                                                        {p.sku} (Available: {remaining})
                                                                    </option>
                                                                );
                                                            })}
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
                                                            className="w-full h-12 px-4 bg-white dark:bg-gray-800 border-2 dark:border-gray-700 rounded-xl outline-none focus:border-primary/50 font-black text-gray-900 dark:text-gray-100"
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
                                            <input required type="number" step="1" min="1" value={codAmount || ''} onChange={e => setCodAmount(Number(e.target.value))} className="w-full h-14 pl-12 pr-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-black text-xl text-primary text-gray-900 dark:text-gray-100" placeholder="0" />
                                        </div>
                                    </div>

                                    <div className="space-y-2 col-span-full">
                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Ads Campaign (Optional)</label>
                                        <select
                                            value={adId}
                                            onChange={e => setAdId(e.target.value)}
                                            className="w-full h-12 px-4 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-xl outline-none focus:border-primary/50 font-black text-sm text-gray-900 dark:text-gray-100"
                                        >
                                            <option value="">-- Select Ads Campaign --</option>
                                            {adsOptions.map(ad => (
                                                <option key={ad.id} value={ad.id}>
                                                    {ad.description} (${Number(ad.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="pt-10 flex flex-col sm:flex-row gap-4 max-w-2xl mx-auto w-full">
                                    <button type="submit" disabled={loading} className="flex-1 h-14 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/30 transition-all hover:scale-[1.01] active:scale-95 disabled:opacity-50">
                                        {loading ? 'Processing Order...' : 'Confirm Shipment'}
                                    </button>
                                    <button type="button" onClick={() => setIsFormOpen(false)} className="flex-1 h-14 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-black rounded-2xl shadow-xl shadow-gray-200/40 dark:shadow-black/20 transition-all hover:scale-[1.01] active:scale-95 hover:bg-gray-200 dark:hover:bg-gray-700">
                                        Discard Order
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Status Update Modal */}
                {isStatusModalOpen && selectedSale && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/5 max-h-[85vh] flex flex-col">
                            <div className="p-8 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit uppercase">Update Status</h2>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mt-1 line-clamp-1">{selectedSale.customer_name}</p>
                                </div>
                                <button onClick={() => setIsStatusModalOpen(false)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 text-gray-500 hover:text-red-500 transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
                                {(() => {
                                    const staffDeliveredLocked = !isAdmin && Number(selectedSale.sold_amount || 0) > 0;
                                    const staffReturnedLocked = !isAdmin && Number(selectedSale.return_cost || 0) > 0;
                                    return (
                                        <>
                                {message && (
                                    <div className={`p-4 rounded-xl text-xs font-black flex items-center gap-3 ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        <CheckCircle2 size={16} /> {message.text}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-3">
                                    {(['processing', 'sent', 'delivered', 'returned'] as const).map((status) => (
                                        <button
                                            key={status}
                                            onClick={() => {
                                                if (status === 'delivered' || status === 'returned') {
                                                    setPendingStatus(status);
                                                    return;
                                                }
                                                handleStatusUpdate(status);
                                            }}
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

                                <div className={`transition-all duration-300 ease-out overflow-hidden ${pendingStatus ? 'max-h-60 opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}>
                                    {pendingStatus === 'delivered' && (
                                        <div className="p-4 rounded-2xl border-2 border-primary/20 bg-primary/5 space-y-3">
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sold Amount (Total)</div>
                                            {staffDeliveredLocked && (
                                                <div className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                                    Staff can enter sold amount only once. Admin can edit it later.
                                                </div>
                                            )}
                                            <div className="relative">
                                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={soldAmountInput}
                                                    onChange={(e) => setSoldAmountInput(Number(e.target.value))}
                                                    disabled={staffDeliveredLocked}
                                                    className="w-full h-12 pl-12 pr-4 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-primary/50 font-black text-sm"
                                                    placeholder="Total sold amount"
                                                />
                                            </div>
                                            <button
                                                onClick={() => handleStatusUpdate('delivered')}
                                                disabled={loading || staffDeliveredLocked}
                                                className="w-full h-12 bg-primary text-white font-black rounded-xl uppercase text-xs tracking-widest shadow-lg shadow-primary/25"
                                            >
                                                Confirm Delivered
                                            </button>
                                        </div>
                                    )}

                                    {pendingStatus === 'returned' && (
                                        <div className="p-4 rounded-2xl border-2 border-rose-200 bg-rose-50/50 dark:border-rose-900/30 dark:bg-rose-950/10 space-y-3">
                                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Return Courier Cost</div>
                                            {staffReturnedLocked && (
                                                <div className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                                    Staff can enter return cost only once. Admin can edit it later.
                                                </div>
                                            )}
                                            <div className="relative">
                                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={returnCostInput}
                                                    onChange={(e) => setReturnCostInput(Number(e.target.value))}
                                                    disabled={staffReturnedLocked}
                                                    className="w-full h-12 pl-12 pr-4 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-primary/50 font-black text-sm"
                                                    placeholder="Return cost"
                                                />
                                            </div>
                                            <button
                                                onClick={() => handleStatusUpdate('returned')}
                                                disabled={loading || staffReturnedLocked}
                                                className="w-full h-12 bg-rose-600 text-white font-black rounded-xl uppercase text-xs tracking-widest shadow-lg shadow-rose-600/25"
                                            >
                                                Confirm Returned
                                            </button>
                                        </div>
                                    )}
                                </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* View Sale Modal */}
                {isViewModalOpen && viewSale && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-3xl rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/5">
                            <div className="p-8 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit uppercase">Sale Details</h2>
                                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mt-1">
                                        {viewSale.customer_name}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsViewModalOpen(false)}
                                    className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 text-gray-500 hover:text-red-500 transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Order Date</p>
                                        <p className="text-sm font-black text-gray-900 dark:text-gray-100">
                                            {format(new Date(viewSale.order_date), 'MMM dd, yyyy')}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</p>
                                        <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusColor(viewSale.parcel_status)}`}>
                                            {viewSale.parcel_status}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Destination</p>
                                        <p className="text-sm font-black text-gray-900 dark:text-gray-100">
                                            {viewSale.destination_branch}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">COD Amount</p>
                                        <p className="text-sm font-black text-primary font-mono">
                                            ${Number(viewSale.cod_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer</p>
                                        <p className="text-sm font-black text-gray-900 dark:text-gray-100">
                                            {viewSale.customer_name}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Contact</p>
                                        <p className="text-sm font-black text-gray-900 dark:text-gray-100">
                                            {viewSale.phone1}{viewSale.phone2 ? ` / ${viewSale.phone2}` : ''}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Address</p>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                        {viewSale.customer_address}
                                    </p>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Items</p>
                                        <span className="text-[10px] font-black text-primary px-2 py-0.5 bg-primary/10 rounded-md">
                                            {(viewSale.items || []).length} SKU(s)
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {(viewSale.items || []).map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/60 px-4 py-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                                                <span className="text-xs font-black text-gray-700 dark:text-gray-300">{item.product.sku}</span>
                                                <span className="text-xs font-black bg-white dark:bg-gray-900 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-800 text-primary font-mono select-none">
                                                    x{item.quantity}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </DashboardLayout>
    );
}
