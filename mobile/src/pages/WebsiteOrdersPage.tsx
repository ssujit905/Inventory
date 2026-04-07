import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import {
    ShoppingBag, Loader2, ChevronDown, ChevronUp,
    Package, Truck, Check, X, Clock, AlertTriangle, Globe, Phone, MapPin, Mail
} from 'lucide-react';

interface OrderItem {
    id: number;
    product_title: string;
    product_image: string;
    quantity: number;
    unit_price: number;
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
    shipped: { label: 'Shipped', color: 'bg-cyan-50 text-cyan-600 border-cyan-200', icon: <Truck size={12} /> },
    delivered: { label: 'Delivered', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <Check size={12} /> },
    cancelled: { label: 'Cancelled', color: 'bg-rose-50 text-rose-600 border-rose-200', icon: <X size={12} /> },
};

const STATUS_ORDER = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function WebsiteOrdersPage() {
    const { profile } = useAuthStore();
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [filterStatus, setFilterStatus] = useState('all');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => { fetchOrders(); }, []);

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
        const { error } = await supabase.from('website_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
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
            {/* Toast */}
            {toast && (
                <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-bold ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    {toast.type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
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

                                                {/* Status Update */}
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Update Status</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {STATUS_ORDER.map(s => {
                                                            const sc = STATUS_CONFIG[s];
                                                            return (
                                                                <button
                                                                    key={s}
                                                                    onClick={() => updateStatus(order.id, s)}
                                                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${order.status === s ? sc.color : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}
                                                                >
                                                                    {sc.icon} {sc.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
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
                                                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{item.product_title}</p>
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
        </DashboardLayout>
    );
}
