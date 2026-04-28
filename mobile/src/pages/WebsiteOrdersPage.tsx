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
    sale_id?: string | null;
    sales?: { parcel_status: string } | null;
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
    const isReadOnly = profile?.permissions === 'read_only';
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // Push to Sales State
    const [isPushModalOpen, setIsPushModalOpen] = useState(false);
    const [selectedOrderForPush, setSelectedOrderForPush] = useState<Order | null>(null);
    const [skuMappings, setSkuMappings] = useState<Record<number, string>>({}); 
    const [physicalProducts, setPhysicalProducts] = useState<Array<{id: string, sku: string}>>([]);
    const [pushing, setPushing] = useState(false);

    useEffect(() => { 
        fetchOrders(); 
        const channel = supabase
            .channel('website_orders_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'website_orders' }, () => {
                fetchOrders();
            })
            .subscribe();

        return () => {
            setTimeout(() => {
                if (channel && (channel as any).state !== 'joining') {
                    supabase.removeChannel(channel).catch(() => {});
                }
            }, 100);
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

    const handlePushToSales = async () => {
        if (!selectedOrderForPush || !profile) return;
        const unmapped = selectedOrderForPush.website_order_items.some(item => !skuMappings[item.id]);
        if (unmapped) return showToast('Please map all items to physical SKUs', 'error');

        setPushing(true);
        try {
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

            let { data: newSale, error: saleError } = await supabase.from('sales').insert([salePayloadFull]).select('id').single();

            if (saleError && /column.*(notes|is_website)/i.test(String(saleError.message || ''))) {
                const { notes, is_website, ...legacyPayload } = salePayloadFull;
                ({ data: newSale, error: saleError } = await supabase.from('sales').insert([legacyPayload]).select('id').single());
            }

            if (saleError) throw saleError;

            for (const item of selectedOrderForPush.website_order_items) {
                const physicalId = skuMappings[item.id];
                const { data: lots } = await supabase
                    .from('product_lots')
                    .select('id, product_id, received_date, transactions (type, quantity_changed, sales (parcel_status))')
                    .eq('product_id', physicalId)
                    .order('received_date', { ascending: true });

                const processedLots = (lots || []).map((lot: any) => {
                    const txs = lot.transactions || [];
                    const stockIn = txs.filter((t: any) => t.type === 'in').reduce((s: number, t: any) => s + t.quantity_changed, 0);
                    const sold = txs.filter((t: any) => t.type === 'sale' && t.sales && ['processing', 'sent', 'delivered'].includes(t.sales.parcel_status)).reduce((s: number, t: any) => s + Math.abs(t.quantity_changed), 0);
                    return { ...lot, current: stockIn - sold };
                }).filter(l => l.current > 0);

                let remaining = item.quantity;
                for (const lot of processedLots) {
                    if (remaining <= 0) break;
                    const deduction = Math.min(lot.current, remaining);
                    await supabase.from('product_lots').update({ quantity_remaining: lot.current - deduction }).eq('id', lot.id);
                    await supabase.from('transactions').insert([{ product_id: physicalId, lot_id: lot.id, sale_id: newSale.id, type: 'sale', quantity_changed: -deduction, performed_by: profile.id }]);
                    remaining -= deduction;
                }
                await supabase.from('sale_items').insert([{ sale_id: newSale.id, product_id: physicalId, quantity: item.quantity }]);
            }

            await updateStatus(selectedOrderForPush.id, 'confirmed');
            showToast('Order pushed to app sales!');
            setIsPushModalOpen(false);
        } catch (error: any) {
            showToast(error.message, 'error');
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
            .select(`*, website_order_items(*), sales:sales!sale_id(parcel_status)`)
            .order('created_at', { ascending: false });
        if (error) showToast(error.message, 'error');
        else setOrders(data || []);
        setLoading(false);
    };

    const updateStatus = async (id: number, status: string) => {
        const { error } = status === 'cancelled' 
            ? await supabase.rpc('handle_website_order_cancellation', { p_order_id: id, p_reason: 'ADMIN CANCEL' })
            : await supabase.from('website_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);

        if (error) return showToast(error.message, 'error');
        setOrders(os => os.map(o => o.id === id ? { ...o, status } : o));
        showToast('Status updated!');
    };

    const filtered = filterStatus === 'all' 
        ? orders 
        : orders.filter(o => (o.sales?.parcel_status || o.status) === filterStatus);

    const counts = orders.reduce((acc, o) => {
        const s = o.sales?.parcel_status || o.status;
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-[11px] font-black uppercase tracking-widest animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Website Orders</h1>
                        <p className="text-gray-400 font-medium text-xs uppercase tracking-widest">Track and manage customer orders from your website.</p>
                    </div>
                    <div className="flex items-center gap-3 bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm w-full md:w-auto">
                        <div className="h-9 w-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                            <Globe size={18} />
                        </div>
                        <div>
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Total Active</p>
                            <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{orders.length} Orders</p>
                        </div>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                    <button
                        onClick={() => setFilterStatus('all')}
                        className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${filterStatus === 'all' ? 'bg-primary text-white shadow-md' : 'bg-white dark:bg-gray-900 text-gray-400 border border-gray-100 dark:border-gray-800'}`}
                    >
                        All
                    </button>
                    {STATUS_ORDER.map(s => {
                        const cfg = STATUS_CONFIG[s];
                        const isActive = filterStatus === s;
                        return (
                            <button
                                key={s}
                                onClick={() => setFilterStatus(isActive ? 'all' : s)}
                                className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${isActive ? cfg.color + ' shadow-md border-transparent' : 'bg-white dark:bg-gray-900 text-gray-400 border border-gray-100 dark:border-gray-800'}`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-current' : 'bg-gray-300 dark:bg-gray-700'}`} />
                                {cfg.label}
                                <span className="opacity-60">({counts[s] || 0})</span>
                            </button>
                        );
                    })}
                </div>

                {/* Order Stream */}
                <div className="flex items-center gap-2 px-1">
                    <ShoppingBag size={14} strokeWidth={1.5} className="text-gray-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Order Stream</h3>
                    <span className="ml-auto text-[10px] font-bold text-gray-300">{filtered.length} visible</span>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Syncing Records...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <div className="flex flex-col items-center gap-3 opacity-30">
                            <ShoppingBag size={40} strokeWidth={1.5} />
                            <p className="text-xs font-bold uppercase tracking-widest">No matching orders</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map((order, idx) => {
                            const currentStatus = order.sales?.parcel_status || order.status;
                            const cfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.pending;
                            const isExpanded = expandedId === order.id;
                            const displayIndex = filtered.length - idx;

                            return (
                                <div 
                                    key={order.id} 
                                    className={`bg-white dark:bg-gray-900 rounded-xl border transition-all overflow-hidden shadow-sm active:scale-[0.99] ${isExpanded ? 'border-primary/30 ring-1 ring-primary/10' : 'border-gray-100 dark:border-gray-800'}`}
                                >
                                    {/* Order Row */}
                                    <div
                                        className="p-4 cursor-pointer"
                                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black">
                                                    {displayIndex}
                                                </span>
                                                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                                    {format(new Date(order.created_at), 'MMM dd, h:mm a')}
                                                </span>
                                            </div>
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>
                                                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                                {cfg.label}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{order.customer_name}</p>
                                                <p className="text-[10px] text-gray-400 font-mono uppercase mt-0.5 tracking-tight">{order.order_number}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-primary">Rs. {order.total_amount.toLocaleString()}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">{order.website_order_items?.length || 0} Items</p>
                                            </div>
                                            <div className={`p-1.5 rounded-lg transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-primary/10 text-primary' : 'text-gray-300'}`}>
                                                <ChevronDown size={16} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Content */}
                                    {isExpanded && (
                                        <div className="px-4 pb-5 space-y-5 animate-in slide-in-from-top-4 duration-300 border-t border-gray-50 dark:border-gray-800 pt-5">
                                            {/* Action Bar - If Pending */}
                                            {order.status === 'pending' && (
                                                <button 
                                                    onClick={(e) => { 
                                                        if (isReadOnly) return;
                                                        e.stopPropagation(); 
                                                        setSelectedOrderForPush(order); 
                                                        setSkuMappings({}); 
                                                        setIsPushModalOpen(true); 
                                                    }}
                                                    disabled={isReadOnly}
                                                    className={`w-full py-3.5 text-[11px] font-black uppercase tracking-widest rounded-xl shadow-lg flex items-center justify-center gap-2.5 active:scale-95 transition-all ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary text-white shadow-primary/20 hover:bg-primary/90'}`}
                                                >
                                                    <ArrowUpCircle size={16} /> {isReadOnly ? 'Read Only Mode' : 'Process & Push to Sales'}
                                                </button>
                                            )}

                                            {/* Info Strip */}
                                            <div className="grid grid-cols-2 gap-px bg-gray-50 dark:bg-gray-800 border border-gray-50 dark:border-gray-800 rounded-xl overflow-hidden">
                                                <div className="bg-white dark:bg-gray-900 p-3">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Customer Phone</p>
                                                    <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate flex items-center gap-1.5">
                                                        <Phone size={11} className="text-primary" /> {order.phone}
                                                    </p>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 p-3">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Backup Phone</p>
                                                    <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate">{order.phone2 || '—'}</p>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 p-3 col-span-2">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1">Shipping Address</p>
                                                    <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-relaxed">
                                                        {order.address}, <span className="font-bold text-gray-900 dark:text-gray-100">{order.city}</span>
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Order Tracking */}
                                            {order.sales && (
                                                <div className="p-4 bg-primary/5 rounded-xl border border-primary/10 flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${cfg.color} bg-opacity-20`}>
                                                            {cfg.icon}
                                                        </div>
                                                        <div>
                                                            <p className="text-[11px] font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">{cfg.label}</p>
                                                            <p className="text-[9px] text-primary font-bold uppercase tracking-widest mt-0.5 animate-pulse">Live Sync Active</p>
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] font-black text-primary px-2 py-1 bg-primary/10 rounded-md border border-primary/10 uppercase tracking-widest">Synced</span>
                                                </div>
                                            )}

                                            {/* Items Ordered */}
                                            <div className="space-y-2">
                                                {(order.website_order_items || []).map(item => (
                                                    <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-50 dark:border-gray-800">
                                                        <div className="w-10 h-10 bg-white dark:bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 border border-gray-100 dark:border-gray-700">
                                                            {item.product_image ? (
                                                                <img src={item.product_image} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <Package className="w-full h-full p-2.5 text-gray-200" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-bold text-gray-900 dark:text-gray-100 truncate">{item.product_title}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className="text-[9px] font-bold text-gray-400">Qty: {item.quantity}</span>
                                                                <span className="text-[9px] font-black text-primary">Rs. {item.unit_price.toLocaleString()}</span>
                                                            </div>
                                                        </div>
                                                        <p className="text-[11px] font-black text-gray-900 dark:text-gray-100">
                                                            Rs. {(item.quantity * item.unit_price).toLocaleString()}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Payment & Total */}
                                            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Payment Method</span>
                                                    <span className="text-[10px] font-black text-primary uppercase">{order.payment_method}</span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Grand Total</p>
                                                    <p className="text-lg font-black text-gray-900 dark:text-gray-100">Rs. {order.total_amount.toLocaleString()}</p>
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

            {/* Push to Sales Modal - Redesigned */}
            {isPushModalOpen && selectedOrderForPush && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-in zoom-in-95 duration-300">
                        <div className="px-6 py-4 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">App Sync</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Link SKUs & Deduct Stock</p>
                            </div>
                            <button onClick={() => setIsPushModalOpen(false)} className="h-9 w-9 flex items-center justify-center rounded-xl bg-white dark:bg-gray-900 text-gray-400 hover:text-rose-500 transition-all border border-gray-100 dark:border-gray-800"><X size={18} /></button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1 custom-scrollbar">
                                {selectedOrderForPush.website_order_items.map(item => (
                                    <div key={item.id} className="p-4 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-100 dark:border-gray-800 space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 bg-white dark:bg-gray-800 rounded-lg overflow-hidden flex-shrink-0 border border-gray-100 dark:border-gray-700">
                                                {item.product_image ? <img src={item.product_image} alt="" className="w-full h-full object-cover" /> : <Package className="w-full h-full p-2 text-gray-200" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-bold text-gray-900 dark:text-gray-100 truncate">{item.product_title}</p>
                                                <p className="text-[9px] text-primary font-black uppercase tracking-tight">Qty: {item.quantity}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest ml-1">App Inventory SKU</label>
                                            <select 
                                                value={skuMappings[item.id] || ''}
                                                onChange={(e) => setSkuMappings(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                className="w-full h-10 px-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[10px] font-bold rounded-lg outline-none focus:border-primary transition-all shadow-sm"
                                            >
                                                <option value="">-- Select SKU --</option>
                                                {physicalProducts.map(p => (
                                                    <option key={p.id} value={p.id}>{p.sku}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-3">
                                <button
                                    disabled={pushing}
                                    onClick={handlePushToSales}
                                    className="w-full py-3.5 bg-primary text-white text-[11px] font-black uppercase tracking-[0.15em] rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2.5 active:scale-95 disabled:opacity-50 transition-all"
                                >
                                    {pushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={16} />}
                                    {pushing ? 'Syncing...' : 'Confirm Sync'}
                                </button>
                                <p className="text-[8px] text-center text-gray-400 font-bold uppercase tracking-widest px-4 leading-relaxed opacity-60">
                                    Deducts stock from main inventory records.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
