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

            let totalRevenue = 0;
            let totalReturnCost = 0;
            let deliveredCount = 0;
            let returnedCount = 0;
            let cancelledCount = 0;
            let processingCount = 0;
            let sentCount = 0;
            let pendingCount = 0;

            const woStatusCounts: Record<string, number> = {};

            orders.forEach((wo: any) => {
                const woStatus = wo.status || 'pending';
                const label = woStatus.charAt(0).toUpperCase() + woStatus.slice(1);
                woStatusCounts[label] = (woStatusCounts[label] || 0) + 1;

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

            setStatusData(
                Object.entries(woStatusCounts)
                    .map(([name, value]) => ({
                        name,
                        value,
                        color: PIE_COLORS[name] || '#94a3b8',
                    }))
                    .sort((a, b) => b.value - a.value)
            );

            const now = new Date();
            const last6 = eachMonthOfInterval({ start: subMonths(now, 5), end: now });

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
                <div className="flex h-[60vh] items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 size={32} className="animate-spin text-primary" />
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Compiling Website Analytics...</p>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto space-y-8 pb-12">
                
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Website Performance</h1>
                        <p className="text-sm text-gray-400 font-bold uppercase tracking-widest">E-Commerce Revenue & Fulfillment</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={fetchStats}
                            className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-gray-100 transition-colors"
                        >
                            Refresh Data
                        </button>
                        <div className="flex items-center gap-2 px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 text-blue-600 rounded-3xl">
                            <Globe size={16} />
                            <span className="text-xs font-black uppercase tracking-widest">{stats.totalWebOrders} Total Web Orders</span>
                        </div>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <KpiCard
                        title="Gross Revenue"
                        value={`Rs. ${stats.totalRevenue.toLocaleString()}`}
                        sub="Total Delivered"
                        icon={<IndianRupee size={20} />}
                        color="emerald"
                        up={true}
                    />
                    <KpiCard
                        title="Net Revenue"
                        value={`Rs. ${stats.netRevenue.toLocaleString()}`}
                        sub="After Returns"
                        icon={<TrendingUp size={20} />}
                        color={stats.netRevenue >= 0 ? 'emerald' : 'rose'}
                        up={stats.netRevenue >= 0}
                    />
                    <KpiCard
                        title="Return Loss"
                        value={`Rs. ${stats.totalReturnCost.toLocaleString()}`}
                        sub="Logistics Drain"
                        icon={<RotateCcw size={20} />}
                        color="rose"
                        up={false}
                    />
                    <KpiCard
                        title="Avg. Order Value"
                        value={`Rs. ${stats.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        sub="Per Delivery"
                        icon={<ShoppingBag size={20} />}
                        color="blue"
                        up={true}
                    />
                </div>

                {/* Rates & Pipeline Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Fulfillment Pipeline */}
                    <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Fulfillment Pipeline</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Live Sales Funnel</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-center">
                                    <p className="text-2xl font-black text-emerald-500">{stats.deliveryRate.toFixed(1)}%</p>
                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Delivery Rate</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-black text-rose-500">{stats.returnRate.toFixed(1)}%</p>
                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Return Rate</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="space-y-6">
                            {[
                                { label: 'Delivered',  count: stats.deliveredCount,  color: 'bg-emerald-500', textColor: 'text-emerald-600' },
                                { label: 'Sent',       count: stats.sentCount,       color: 'bg-blue-500',    textColor: 'text-blue-600' },
                                { label: 'Processing', count: stats.processingCount, color: 'bg-indigo-500',  textColor: 'text-indigo-600' },
                                { label: 'Pending',    count: stats.pendingCount,    color: 'bg-amber-500',   textColor: 'text-amber-600' },
                                { label: 'Returned',   count: stats.returnedCount,   color: 'bg-rose-500',    textColor: 'text-rose-600' },
                                { label: 'Cancelled',  count: stats.cancelledCount,  color: 'bg-gray-400',    textColor: 'text-gray-500' },
                            ].map(item => (
                                <div key={item.label} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-xs font-black uppercase tracking-widest ${item.textColor}`}>{item.label}</span>
                                        <span className="text-sm font-black text-gray-700 dark:text-gray-300">{item.count} Orders</span>
                                    </div>
                                    <div className="h-3 bg-gray-50 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-100 dark:border-gray-700">
                                        <div
                                            className={`h-full ${item.color} rounded-full transition-all duration-1000`}
                                            style={{ width: stats.totalWebOrders > 0 ? `${(item.count / stats.totalWebOrders) * 100}%` : '0%' }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Status Distribution Pie */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center">
                        <div className="w-full mb-8">
                            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight text-center">Status Distribution</h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 text-center">Website Order States</p>
                        </div>
                        <div className="h-64 w-64 relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={statusData} innerRadius={70} outerRadius={100} paddingAngle={4} dataKey="value" strokeWidth={0}>
                                        {statusData.map((entry, i) => (
                                            <Cell key={i} fill={entry.color} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <p className="text-3xl font-black text-gray-900 dark:text-gray-100">{stats.totalWebOrders}</p>
                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Total Orders</p>
                            </div>
                        </div>
                        <div className="w-full mt-8 grid grid-cols-2 gap-4">
                            {statusData.map((item, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{item.name}</span>
                                    <span className="text-[10px] font-black text-gray-900 dark:text-gray-100 ml-auto">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Revenue Trend */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="mb-8 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Revenue vs Returns</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">E-Commerce Growth (6M)</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Net</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-rose-500" />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Returns</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthlyRevenue}>
                                    <defs>
                                        <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.3} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94A3B8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94A3B8' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '16px' }}
                                    />
                                    <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={4} fill="url(#netGrad)" name="Revenue" />
                                    <Area type="monotone" dataKey="returns" stroke="#f43f5e" strokeWidth={3} fill="none" strokeDasharray="5 5" name="Returns" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Order Volume */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="mb-8">
                            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Monthly Order Volume</h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Transaction Frequency</p>
                        </div>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthlyOrders}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.3} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94A3B8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: '#94A3B8' }} />
                                    <Tooltip
                                        cursor={{ fill: '#F8FAFC' }}
                                        contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '16px' }}
                                    />
                                    <Bar dataKey="total" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={40} name="Orders" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

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
        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 p-8 shadow-sm transition-all hover:shadow-xl hover:-translate-y-1">
            <div className="flex items-start justify-between mb-6">
                <div className={`h-12 w-12 ${iconColors[color] || 'bg-primary'} text-white rounded-2xl flex items-center justify-center shadow-lg shadow-current/20`}>
                    {icon}
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase border ${badgeColors[color] || badgeColors.blue}`}>
                    {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {up ? 'Gain' : 'Loss'}
                </div>
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{title}</p>
            <h4 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">{value}</h4>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">{sub}</p>
        </div>
    );
}
