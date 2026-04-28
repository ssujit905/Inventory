import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { format, subMonths, eachMonthOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import {
    Globe, TrendingUp, ShoppingBag, Loader2, IndianRupee,
    RotateCcw, CheckCircle2, ArrowUpRight, ArrowDownRight, Package
} from 'lucide-react';

interface WebStats {
    totalRevenue: number;
    totalReturnCost: number;
    netRevenue: number;
    totalWebOrders: number;
    deliveredCount: number;
    returnedCount: number;
    cancelledCount: number;
    processingCount: number;
    sentCount: number;
    pendingCount: number;
    avgOrderValue: number;
    deliveryRate: number;
    returnRate: number;
}

const PIE_COLORS: Record<string, string> = {
    Delivered:   '#10b981',
    Processing:  '#6366f1',
    Sent:        '#3b82f6',
    Pending:     '#f59e0b',
    Confirmed:   '#8b5cf6',
    Returned:    '#f43f5e',
    Cancelled:   '#94a3b8',
};

export default function WebsiteReportsPage() {
    const { profile } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<WebStats>({
        totalRevenue: 0, totalReturnCost: 0, netRevenue: 0,
        totalWebOrders: 0, deliveredCount: 0, returnedCount: 0,
        cancelledCount: 0, processingCount: 0, sentCount: 0, pendingCount: 0,
        avgOrderValue: 0, deliveryRate: 0, returnRate: 0,
    });
    const [monthlyRevenue, setMonthlyRevenue] = useState<any[]>([]);
    const [monthlyOrders, setMonthlyOrders] = useState<any[]>([]);
    const [statusData, setStatusData] = useState<any[]>([]);

    useEffect(() => { fetchStats(); }, []);


    const fetchStats = async () => {
        setLoading(true);
        try {
            // ──────────────────────────────────────────────────
            // PRIMARY DATA SOURCE: website_orders joined to sales
            // This is the ONLY reliable way to identify web orders.
            // website_orders.sale_id links to the sales table row
            // that was created when the order was "pushed to sales".
            // ──────────────────────────────────────────────────
            const { data: webOrders, error: woErr } = await supabase
                .from('website_orders')
                .select(`
                    id,
                    status,
                    total_amount,
                    created_at,
                    sale_id,
                    sales:sales!sale_id(
                        id,
                        parcel_status,
                        sold_amount,
                        return_cost,
                        cod_amount,
                        order_date,
                        created_at
                    )
                `)
                .order('created_at', { ascending: false });

            if (woErr) throw woErr;

            const orders = webOrders || [];
            const totalWebOrders = orders.length;

            // ── Revenue from SALES table (sold_amount on delivered) ──
            let totalRevenue = 0;
            let totalReturnCost = 0;
            let deliveredCount = 0;
            let returnedCount = 0;
            let cancelledCount = 0;
            let processingCount = 0;
            let sentCount = 0;
            let pendingCount = 0;

            // For pie chart: count by website_orders.status (customer-facing)
            const woStatusCounts: Record<string, number> = {};

            orders.forEach((wo: any) => {
                // Count website_orders statuses for the pie
                const woStatus = wo.status || 'pending';
                const label = woStatus.charAt(0).toUpperCase() + woStatus.slice(1);
                woStatusCounts[label] = (woStatusCounts[label] || 0) + 1;

                // If this order was pushed to sales, use the SALES data for financials
                const sale = wo.sales;
                if (sale) {
                    const ps = sale.parcel_status;
                    if (ps === 'delivered') {
                        deliveredCount++;
                        totalRevenue += Number(sale.sold_amount || 0);
                    } else if (ps === 'returned') {
                        returnedCount++;
                        totalReturnCost += Number(sale.return_cost || 0);
                    } else if (ps === 'cancelled') {
                        cancelledCount++;
                    } else if (ps === 'sent') {
                        sentCount++;
                    } else if (ps === 'processing') {
                        processingCount++;
                    } else {
                        pendingCount++;
                    }
                } else {
                    // Not yet pushed to sales — still pending/confirmed
                    pendingCount++;
                }
            });

            const netRevenue = totalRevenue - totalReturnCost;
            const avgOrderValue = deliveredCount > 0 ? totalRevenue / deliveredCount : 0;
            const closedOrders = deliveredCount + returnedCount + cancelledCount;
            const deliveryRate = closedOrders > 0 ? (deliveredCount / closedOrders) * 100 : 0;
            const returnRate = closedOrders > 0 ? (returnedCount / closedOrders) * 100 : 0;

            setStats({
                totalRevenue, totalReturnCost, netRevenue,
                totalWebOrders, deliveredCount, returnedCount,
                cancelledCount, processingCount, sentCount, pendingCount,
                avgOrderValue, deliveryRate, returnRate,
            });

            // ── Pie Data from website_orders status ──
            setStatusData(
                Object.entries(woStatusCounts)
                    .map(([name, value]) => ({
                        name,
                        value,
                        color: PIE_COLORS[name] || '#94a3b8',
                    }))
                    .sort((a, b) => b.value - a.value)
            );

            // ── Monthly Trends (last 6 months) ──
            const now = new Date();
            const last6 = eachMonthOfInterval({ start: subMonths(now, 5), end: now });

            // Revenue trend from linked sales
            const revTrend = last6.map(month => {
                const mStart = startOfMonth(month);
                const mEnd = endOfMonth(month);
                let rev = 0, ret = 0, cnt = 0;

                orders.forEach((wo: any) => {
                    const sale = wo.sales;
                    if (!sale) return;
                    const d = new Date(sale.order_date || sale.created_at);
                    if (d >= mStart && d <= mEnd) {
                        cnt++;
                        if (sale.parcel_status === 'delivered') rev += Number(sale.sold_amount || 0);
                        if (sale.parcel_status === 'returned') ret += Number(sale.return_cost || 0);
                    }
                });

                return { name: format(month, 'MMM'), revenue: rev, returns: ret, net: rev - ret, orders: cnt };
            });

            setMonthlyRevenue(revTrend);

            // Order volume from website_orders created_at
            const ordTrend = last6.map(month => {
                const mStart = startOfMonth(month);
                const mEnd = endOfMonth(month);
                const cnt = orders.filter((wo: any) => {
                    const d = new Date(wo.created_at);
                    return d >= mStart && d <= mEnd;
                }).length;
                return { name: format(month, 'MMM'), total: cnt };
            });

            setMonthlyOrders(ordTrend);

        } catch (err: any) {
            console.error('Website reports fetch failed:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
                <div className="flex h-64 items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 size={32} className="animate-spin text-primary" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Compiling Analytics...</p>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-20">

                {/* Standard Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Website Performance</h1>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">E-Commerce Revenue & Fulfillment</p>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 text-blue-600 rounded-xl">
                        <Globe size={12} />
                        <span className="text-[10px] font-black uppercase tracking-widest">{stats.totalWebOrders} Web Orders</span>
                    </div>
                </div>

                {/* KPI Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KpiCard
                        title="Gross Revenue"
                        value={`Rs. ${stats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        sub="From Delivered"
                        icon={<IndianRupee size={14} />}
                        color="emerald"
                        up={true}
                    />
                    <KpiCard
                        title="Net Revenue"
                        value={`Rs. ${stats.netRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        sub="After Returns"
                        icon={<TrendingUp size={14} />}
                        color={stats.netRevenue >= 0 ? 'emerald' : 'rose'}
                        up={stats.netRevenue >= 0}
                    />
                    <KpiCard
                        title="Return Loss"
                        value={`Rs. ${stats.totalReturnCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        sub="Return Cost"
                        icon={<RotateCcw size={14} />}
                        color="rose"
                        up={false}
                    />
                    <KpiCard
                        title="Avg. Order"
                        value={`Rs. ${stats.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        sub="Per Delivery"
                        icon={<ShoppingBag size={14} />}
                        color="blue"
                        up={true}
                    />
                </div>

                {/* Fulfillment Rate Cards */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 size={14} className="text-emerald-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Delivery Rate</span>
                        </div>
                        <p className="text-2xl font-black text-emerald-500">{stats.deliveryRate.toFixed(1)}%</p>
                        <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(stats.deliveryRate, 100)}%` }} />
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold mt-2">{stats.deliveredCount} of {stats.deliveredCount + stats.returnedCount + stats.cancelledCount} closed</p>
                    </div>
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <RotateCcw size={14} className="text-rose-500" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Return Rate</span>
                        </div>
                        <p className="text-2xl font-black text-rose-500">{stats.returnRate.toFixed(1)}%</p>
                        <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(stats.returnRate, 100)}%` }} />
                        </div>
                        <p className="text-[9px] text-gray-400 font-bold mt-2">{stats.returnedCount} returns recorded</p>
                    </div>
                </div>

                {/* Order Pipeline */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 dark:border-gray-800">
                        <Package size={14} className="text-gray-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Fulfillment Pipeline</span>
                        <span className="ml-auto text-[9px] font-black text-gray-300">Sales Status</span>
                    </div>
                    <div className="p-4 space-y-3">
                        {[
                            { label: 'Delivered',  count: stats.deliveredCount,  color: 'bg-emerald-500', textColor: 'text-emerald-600' },
                            { label: 'Sent',       count: stats.sentCount,       color: 'bg-blue-500',    textColor: 'text-blue-600' },
                            { label: 'Processing', count: stats.processingCount, color: 'bg-indigo-500',  textColor: 'text-indigo-600' },
                            { label: 'Pending',    count: stats.pendingCount,    color: 'bg-amber-500',   textColor: 'text-amber-600' },
                            { label: 'Returned',   count: stats.returnedCount,   color: 'bg-rose-500',    textColor: 'text-rose-600' },
                            { label: 'Cancelled',  count: stats.cancelledCount,  color: 'bg-gray-400',    textColor: 'text-gray-500' },
                        ].map(item => (
                            <div key={item.label} className="flex items-center gap-3">
                                <span className={`text-[9px] font-black uppercase tracking-widest w-20 ${item.textColor}`}>{item.label}</span>
                                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${item.color} rounded-full transition-all`}
                                        style={{ width: stats.totalWebOrders > 0 ? `${(item.count / stats.totalWebOrders) * 100}%` : '0%' }}
                                    />
                                </div>
                                <span className="text-xs font-black text-gray-700 dark:text-gray-300 w-6 text-right">{item.count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Monthly Revenue vs Returns */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 dark:border-gray-800">
                        <TrendingUp size={14} className="text-gray-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Revenue vs Returns</span>
                        <span className="ml-auto text-[9px] font-black text-gray-300">Last 6 Months</span>
                    </div>
                    <div className="p-4">
                        <div className="flex gap-4 mb-4">
                            {[
                                { color: 'bg-emerald-500', label: 'Revenue' },
                                { color: 'bg-rose-400',    label: 'Returns' },
                                { color: 'bg-blue-500',    label: 'Net' },
                            ].map(l => (
                                <div key={l.label} className="flex items-center gap-1.5">
                                    <div className={`h-1.5 w-3 rounded-full ${l.color}`} />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{l.label}</span>
                                </div>
                            ))}
                        </div>
                        <div className="h-52 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthlyRevenue} margin={{ left: -20 }}>
                                    <defs>
                                        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.3} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} dy={6} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                                        formatter={(value: any) => [`Rs. ${Number(value).toLocaleString()}`, '']}
                                    />
                                    <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#revGrad)" name="Revenue" />
                                    <Area type="monotone" dataKey="returns" stroke="#f43f5e" strokeWidth={2} fill="none" strokeDasharray="4 2" name="Returns" />
                                    <Area type="monotone" dataKey="net"     stroke="#3b82f6" strokeWidth={2.5} fill="url(#netGrad)" name="Net" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Monthly Order Volume */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 dark:border-gray-800">
                        <ShoppingBag size={14} className="text-gray-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Monthly Order Volume</span>
                        <span className="ml-auto text-[9px] font-black text-gray-300">Customer Orders</span>
                    </div>
                    <div className="p-4">
                        <div className="h-44 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthlyOrders} margin={{ left: -20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.3} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} dy={6} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc', opacity: 0.5 }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                                    />
                                    <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={16} name="Orders" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Status Distribution Pie */}
                {statusData.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50 dark:border-gray-800">
                            <Globe size={14} className="text-gray-400" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Order Status Distribution</span>
                        </div>
                        <div className="p-4 flex items-center gap-4">
                            <div className="h-36 w-36 flex-shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={statusData} innerRadius={42} outerRadius={62} paddingAngle={3} dataKey="value" strokeWidth={0}>
                                            {statusData.map((entry, i) => (
                                                <Cell key={i} fill={entry.color} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex-1 space-y-2">
                                {statusData.map((item, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black text-gray-700 dark:text-gray-300">{item.value}</span>
                                            <span className="text-[9px] text-gray-300 font-bold">
                                                {stats.totalWebOrders > 0 ? `${((item.value / stats.totalWebOrders) * 100).toFixed(0)}%` : '0%'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </DashboardLayout>
    );
}

function KpiCard({ title, value, sub, icon, color, up }: any) {
    const iconColors: any = { emerald: 'bg-emerald-500', rose: 'bg-rose-500', blue: 'bg-blue-500', amber: 'bg-amber-500' };
    const badgeColors: any = {
        emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        rose:    'bg-rose-50 text-rose-600 border-rose-100',
        blue:    'bg-blue-50 text-blue-600 border-blue-100',
        amber:   'bg-amber-50 text-amber-600 border-amber-100',
    };
    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
                <div className={`h-8 w-8 ${iconColors[color] || 'bg-primary'} text-white rounded-lg flex items-center justify-center shadow-lg shadow-current/10`}>
                    {icon}
                </div>
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase border ${badgeColors[color] || badgeColors.blue}`}>
                    {up ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                    {up ? 'Up' : 'Down'}
                </div>
            </div>
            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{title}</p>
            <h4 className="text-sm font-black text-gray-900 dark:text-gray-100 tracking-tight">{value}</h4>
            <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-1">{sub}</p>
        </div>
    );
}
