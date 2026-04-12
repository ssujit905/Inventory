import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import {
    ShoppingBag, Loader2, ChevronDown, ChevronUp,
    Package, Truck, Check, X, Clock, AlertTriangle, Globe, Phone, MapPin, Mail,
    ArrowUpCircle, Info, Star, Save, RotateCcw
} from 'lucide-react';

interface OrderItem {
    id: number;
    product_title: string;
    product_image: string;
    quantity: number;
    unit_price: number;
    sku: string;
}

interface Order {
    id: number;
    order_number: string;
    customer_name: string;
    email: string;
    phone: string;
    phone2: string;
    address: string;
    city: string;
    payment_method: string;
    status: string;
    total_amount: number;
    notes: string;
    created_at: string;
    website_order_items: OrderItem[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Pending', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: <Clock size={12} /> },
    confirmed: { label: 'Confirmed', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: <Check size={12} /> },
    processing: { label: 'Processing', color: 'bg-violet-50 text-violet-600 border-violet-200', icon: <Package size={12} /> },
    sent: { label: 'Sent', color: 'bg-cyan-50 text-cyan-600 border-cyan-200', icon: <Truck size={12} /> },
    delivered: { label: 'Delivered', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <Check size={12} /> },
    returned: { label: 'Returned', color: 'bg-slate-50 text-slate-600 border-slate-200', icon: <RotateCcw size={12} /> },
    cancelled: { label: 'Cancelled', color: 'bg-rose-50 text-rose-600 border-rose-200', icon: <X size={12} /> },
};

const STATUS_ORDER = ['processing', 'sent', 'delivered', 'returned', 'cancelled'];

export default function WebsiteOrdersPage() {
    const { profile } = useAuthStore();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Push to Sales State
    const [isPushModalOpen, setIsPushModalOpen] = useState(false);
    const [selectedOrderForPush, setSelectedOrderForPush] = useState<Order | null>(null);
    const [skuMappings, setSkuMappings] = useState<Record<number, string>>({}); // order_item_id -> product_id
    const [physicalProducts, setPhysicalProducts] = useState<Array<{id: string, sku: string}>>([]);
    const [pushing, setPushing] = useState(false);

    useEffect(() => { 
        fetchOrders(); 
        
        // Subscribe to real-time updates for website orders
        const channel = supabase
            .channel('website_orders_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'website_orders' }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        if (isPushModalOpen) {
            fetchPhysicalProducts();
        }
    }, [isPushModalOpen]);

    const fetchPhysicalProducts = async () => {
        const { data } = await supabase.from('products').select('id, sku').order('sku');
        if (data) setPhysicalProducts(data);
    };

    const openPushModal = (order: Order) => {
        setSelectedOrderForPush(order);
        setSkuMappings({});
        setIsPushModalOpen(true);
    };

    const handlePushToSales = async () => {
        if (!selectedOrderForPush || !profile) return;
        
        // Validate all items mapped
        const unmapped = selectedOrderForPush.website_order_items.some(item => !skuMappings[item.id]);
        if (unmapped) return showToast('Please select a matching SKU for all items', 'error');

        setPushing(true);
        try {
            // 1. Create Sale Header
            const firstItemId = selectedOrderForPush.website_order_items[0].id;
            const firstPhysicalId = skuMappings[firstItemId];
            const totalQty = selectedOrderForPush.website_order_items.reduce((s: number, i: any) => s + i.quantity, 0);

            const salePayloadFull = {
                order_date: format(new Date(), 'yyyy-MM-dd'),
                destination_branch: selectedOrderForPush.city,
                customer_name: selectedOrderForPush.customer_name,
                customer_address: `${selectedOrderForPush.address}, ${selectedOrderForPush.city}`,
                phone1: selectedOrderForPush.phone,
                phone2: selectedOrderForPush.phone2 || null,
                cod_amount: selectedOrderForPush.total_amount,
                parcel_status: 'processing',
                is_website: true,
                recorded_by: profile.id,
                notes: `WEB ORDER: ${selectedOrderForPush.order_number}`,
                product_id: firstPhysicalId,
                quantity: totalQty
            };

            let newSale: any = null;
            let saleError: any = null;

            ({ data: newSale, error: saleError } = await supabase
                .from('sales')
                .insert([salePayloadFull])
                .select('id')
                .single());

            // Fallback for older schema without 'notes' or 'is_website'
            if (saleError && /column.*(notes|is_website)|schema cache/i.test(String(saleError.message || ''))) {
                const { notes, is_website, ...legacyPayload } = salePayloadFull;
                ({ data: newSale, error: saleError } = await supabase
                    .from('sales')
                    .insert([legacyPayload])
                    .select('id')
                    .single());
            }

            if (saleError) throw saleError;

            // 2. Loop through each item to deduct stock and create sale items
            for (const item of selectedOrderForPush.website_order_items) {
                const physicalId = skuMappings[item.id];
                
                // Fetch lots for FIFO stock deduction
                const { data: lots, error: lotError } = await supabase
                    .from('product_lots')
                    .select('id, product_id, received_date, transactions (type, quantity_changed, sales (parcel_status))')
                    .eq('product_id', physicalId)
                    .order('received_date', { ascending: true });

                if (lotError) throw lotError;

                // Process lots to find current stock
                const processedLots = (lots || []).map((lot: any) => {
                    const txs = lot.transactions || [];
                    const stockIn = txs.filter((t: any) => t.type === 'in').reduce((s: number, t: any) => s + t.quantity_changed, 0);
                    const sold = txs.filter((t: any) => {
                        if (t.type !== 'sale') return false;
                        if (t.sales) return ['processing', 'sent', 'delivered'].includes(t.sales.parcel_status);
                        return true;
                    }).reduce((s: number, t: any) => s + Math.abs(t.quantity_changed), 0);
                    return { ...lot, current: stockIn - sold };
                }).filter(l => l.current > 0);

                const totalStock = processedLots.reduce((s, l) => s + l.current, 0);
                if (totalStock < item.quantity) {
                    const sku = physicalProducts.find(p => p.id === physicalId)?.sku;
                    throw new Error(`Insufficient stock for physical SKU: ${sku}`);
                }

                // Deduct using FIFO
                let remainingToDeduct = item.quantity;
                for (const lot of processedLots) {
                    if (remainingToDeduct <= 0) break;
                    const deduction = Math.min(lot.current, remainingToDeduct);
                    
                    // Update Physical Stock
                    await supabase.from('product_lots').update({ quantity_remaining: lot.current - deduction }).eq('id', lot.id);
                    
                    // Create Transaction
                    await supabase.from('transactions').insert([{
                        product_id: physicalId,
                        lot_id: lot.id,
                        sale_id: newSale.id,
                        type: 'sale',
                        quantity_changed: -deduction,
                        performed_by: profile.id
                    }]);
                    remainingToDeduct -= deduction;
                }

                // Create Sale Item
                await supabase.from('sale_items').insert([{
                    sale_id: newSale.id,
                    product_id: physicalId,
                    quantity: item.quantity
                }]);
            }

            // 3. Update Website Order Status to Confirmed
            await updateStatus(selectedOrderForPush.id, 'confirmed');
            
            showToast('Order pushed to app sales and stock updated!');
            setIsPushModalOpen(false);
        } catch (error: any) {
            console.error('Push to Sales Error:', error);
            const msg = error.message?.includes('column "is_website" does not exist') 
                ? 'DATABASE ERROR: Please add the "is_website" column to your sales table in Supabase.'
                : error.message;
            showToast(msg, 'error');
        } finally {
            setPushing(false);
        }
    };

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchOrders = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('website_orders')
            .select(`*, website_order_items(*)`)
            .order('created_at', { ascending: false });
        if (error) showToast(error.message, 'error');
        else setOrders(data || []);
        setLoading(false);
    };

    const updateStatus = async (id: number, status: string) => {
        let error;
        if (status === 'cancelled') {
            const { error: cancelError } = await supabase.rpc('handle_website_order_cancellation', {
                p_order_id: id,
                p_reason: 'ADMIN CANCEL'
            });
            error = cancelError;
        } else {
            const { error: updateError } = await supabase.from('website_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
            error = updateError;
        }

        if (error) return showToast(error.message, 'error');
        setOrders(os => os.map(o => o.id === id ? { ...o, status } : o));
        showToast('Status updated!');
    };

    const filtered = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus);

    // Summary counts
    const counts = orders.reduce((acc, o) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {/* Global Toast Notification — Always at the top-right! */}
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="max-w-5xl mx-auto space-y-6 pb-12">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Globe size={22} className="text-primary" /> Website Orders
                        </h1>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-1">Customer orders from your website</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{orders.length}</p>
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Total Orders</p>
                    </div>
                </div>

                {/* Status Summary Cards */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    {STATUS_ORDER.map(s => {
                        const cfg = STATUS_CONFIG[s];
                        return (
                            <button
                                key={s}
                                onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
                                className={`p-3 rounded-2xl border text-left transition-all hover:shadow-md ${filterStatus === s ? cfg.color + ' border-opacity-100 shadow-sm' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'}`}
                            >
                                <p className="text-xl font-black text-gray-900 dark:text-gray-100">{counts[s] || 0}</p>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">{cfg.label}</p>
                            </button>
                        );
                    })}
                </div>

                {/* Orders List */}
                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 gap-4">
                        <ShoppingBag size={48} className="text-gray-200 dark:text-gray-700" />
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No orders yet</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(order => {
                            const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
                            const isExpanded = expandedId === order.id;
                            return (
                                <div key={order.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-all">
                                    {/* Order Header Row */}
                                    <div
                                        className="flex items-center gap-4 p-4 cursor-pointer"
                                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-black text-gray-500 dark:text-gray-400 font-mono">{order.order_number}</span>
                                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black ${cfg.color}`}>
                                                    {cfg.icon} {cfg.label}
                                                </span>
                                            </div>
                                            <p className="font-bold text-gray-900 dark:text-gray-100 text-sm mt-1 truncate">{order.customer_name}</p>
                                            <p className="text-xs text-gray-400">{format(new Date(order.created_at), 'MMM d, yyyy · h:mm a')}</p>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="font-black text-gray-900 dark:text-gray-100">Rs. {order.total_amount.toLocaleString()}</p>
                                            <p className="text-xs text-gray-400">{order.website_order_items?.length || 0} item{order.website_order_items?.length !== 1 ? 's' : ''}</p>
                                        </div>
                                        {isExpanded ? <ChevronUp size={18} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={18} className="text-gray-400 flex-shrink-0" />}
                                    </div>

                                    {/* Action Header — Quick Push */}

                                    {/* Expanded Details */}
                                    {isExpanded && (
                                        <div className="border-t border-gray-100 dark:border-gray-800 p-5 space-y-5">
                                            {/* Customer Info */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer Details</p>
                                                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                        <Phone size={13} className="text-gray-400" /> {order.phone}
                                                    </div>
                                                    {order.phone2 && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                            <Phone size={13} className="text-gray-400" /> {order.phone2} <span className="text-[10px] text-gray-400 font-bold uppercase ml-1">(Backup)</span>
                                                        </div>
                                                    )}
                                                    {order.email && (
                                                        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                            <Mail size={13} className="text-gray-400" /> {order.email}
                                                        </div>
                                                    )}
                                                    <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                        <MapPin size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                                                        <span>{order.address}, {order.city}</span>
                                                    </div>
                                                    <div className="text-sm text-gray-500">Payment: <span className="font-bold">{order.payment_method}</span></div>
                                                    {order.notes && <div className="text-sm text-gray-500">Notes: <span className="text-gray-700 dark:text-gray-300">{order.notes}</span></div>}
                                                </div>

                                                 <div className="space-y-4">
                                                     <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Order Tracking</p>
                                                     <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${cfg.color} bg-opacity-20`}>
                                                                {cfg.icon}
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">{cfg.label}</p>
                                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Live Sync Active</p>
                                                            </div>
                                                        </div>
                                                        <span className="text-[9px] font-black text-primary px-2 py-1 bg-primary/5 rounded-md border border-primary/10 uppercase tracking-widest animate-pulse">Synced</span>
                                                     </div>
                                                     <p className="text-[9px] text-gray-400 font-medium leading-relaxed italic">
                                                        This order is linked to your master Sales ledger. Changes made in the "Sales" tab will reflect here automatically.
                                                     </p>
                                                 </div>
                                            </div>

                                            {/* Order Items */}
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Items Ordered</p>
                                                <div className="space-y-2">
                                                    {(order.website_order_items || []).map(item => (
                                                        <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                                                            {item.product_image && (
                                                                <img src={item.product_image} alt="" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{item.product_title}</p>
                                                                    {item.sku && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500 font-black">{item.sku}</span>}
                                                                </div>
                                                                <p className="text-xs text-gray-400">Qty: {item.quantity} × Rs. {item.unit_price.toLocaleString()}</p>
                                                            </div>
                                                            <p className="font-black text-gray-900 dark:text-gray-100 text-sm flex-shrink-0">
                                                                Rs. {(item.quantity * item.unit_price).toLocaleString()}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>

                                                {/* Total */}
                                                <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-100 dark:border-gray-800">
                                                    <span className="font-bold text-gray-700 dark:text-gray-300">Total</span>
                                                    <span className="text-lg font-black text-primary">Rs. {order.total_amount.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Push to Sales Mapping Modal */}
            {isPushModalOpen && selectedOrderForPush && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/5 animate-in zoom-in-95 duration-300">
                        <div className="p-8 border-b dark:border-gray-800 bg-gradient-to-r from-primary/5 to-transparent flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">Push to App Sales</h3>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Map website items to physical SKUs</p>
                            </div>
                            <button 
                                onClick={() => setIsPushModalOpen(false)}
                                className="h-10 w-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-red-500 transition-all"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            {/* Order Summary */}
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 flex items-center justify-between border border-gray-100 dark:border-gray-700/50">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Customer</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{selectedOrderForPush.customer_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total COD</p>
                                    <p className="text-sm font-black text-primary">Rs. {selectedOrderForPush.total_amount.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Item Mapping */}
                            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                                {selectedOrderForPush.website_order_items.map(item => (
                                    <div key={item.id} className="p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex-shrink-0">
                                                {item.product_image ? <img src={item.product_image} alt="" className="w-full h-full object-cover" /> : <Package className="w-full h-full p-2 text-gray-300" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{item.product_title}</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Qty: {item.quantity}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-1">Select Physical App SKU</label>
                                            <select 
                                                value={skuMappings[item.id] || ''}
                                                onChange={(e) => setSkuMappings(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary/50 text-xs font-bold rounded-xl outline-none transition-all"
                                            >
                                                <option value="">-- Choose SKU --</option>
                                                {physicalProducts.map(p => (
                                                    <option key={p.id} value={p.id}>{p.sku}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button
                                disabled={pushing}
                                onClick={handlePushToSales}
                                className="w-full py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/30 flex items-center justify-center gap-3 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:grayscale transition-all"
                            >
                                {pushing ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                {pushing ? 'PUSHING TO APP...' : 'CONFIRM & PUSH TO SALES'}
                            </button>
                            <p className="text-[10px] text-center text-gray-400 font-bold uppercase tracking-widest">Deducts stock & creates sale record in App history</p>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
