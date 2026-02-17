import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom"
import DashboardLayout from "../layouts/DashboardLayout"
import { Package, Activity, AlertTriangle, TrendingUp, ShoppingBag, ArrowRightLeft, Clock, DollarSign } from 'lucide-react'
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar
} from 'recharts';
import { format, startOfMonth, endOfMonth, subDays, startOfYear, eachMonthOfInterval } from 'date-fns';

export default function AdminDashboard() {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        totalDelivered: 0,
        totalReturns: 0,
        processingCount: 0,
        sentCount: 0,
        pendingTotal: 0,
        lowStock: 0,
        outOfStock: 0,
        returnRate: 0,
        deliverySuccessRate: 0
    });

    const [chartData, setChartData] = useState<{ date: string; sales: number }[]>([]);
    const [monthlySalesCount, setMonthlySalesCount] = useState<{ month: string; delivered: number; returns: number }[]>([]);
    const [statusData, setStatusData] = useState<{ name: string; value: number; color: string }[]>([]);
    const [fastMovingSkus, setFastMovingSkus] = useState<{ sku: string; qty: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    useRealtimeRefresh(
        () => fetchDashboardData(false),
        {
            channelName: 'dashboard-updates-v2',
            tables: ['sales', 'product_lots', 'transactions'],
            pollMs: 10000
        }
    );

    const fetchDashboardData = async (isInitial = true) => {
        if (isInitial) setLoading(true);
        try {
            const now = new Date();
            const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');
            const monthEndStr = format(endOfMonth(now), 'yyyy-MM-dd');
            const todayStr = format(now, 'yyyy-MM-dd');
            const yearStart = startOfYear(now);

            const { data: globalSales, error: salesError } = await supabase
                .from('sales')
                .select('parcel_status, order_date');

            if (salesError) throw salesError;

            const totalDelivered = globalSales?.filter(s => s.parcel_status === 'delivered').length || 0;
            const totalReturns = globalSales?.filter(s => s.parcel_status === 'returned').length || 0;

            const { data: productsData, error: prodError } = await supabase
                .from('products')
                .select(`
                    id,
                    min_stock_alert,
                    product_lots(
                        id,
                        transactions(
                            type,
                            quantity_changed,
                            sales(parcel_status)
                        )
                    )
                `);

            if (prodError) throw prodError;

            const productRemaining = (productsData || []).map((p: any) => {
                const totalRemaining = (p.product_lots || []).reduce((sum: number, lot: any) => {
                    const txs = lot.transactions || [];
                    const stockIn = txs
                        .filter((t: any) => t.type === 'in')
                        .reduce((s: number, t: any) => s + Number(t.quantity_changed || 0), 0);
                    const sold = txs
                        .filter((t: any) => {
                            if (t.type !== 'sale') return false;
                            if (t.sales) return ['processing', 'sent', 'delivered'].includes(t.sales.parcel_status);
                            return true;
                        })
                        .reduce((s: number, t: any) => s + Math.abs(Number(t.quantity_changed || 0)), 0);
                    return sum + Math.max(0, stockIn - sold);
                }, 0);
                return {
                    minStock: Number(p.min_stock_alert || 5),
                    remaining: totalRemaining
                };
            });

            const lowStockCount = productRemaining.filter((p: any) => p.remaining <= p.minStock).length;
            const outOfStockCount = productRemaining.filter((p: any) => p.remaining <= 0).length;

            const monthSales = globalSales?.filter(s =>
                s.order_date >= monthStartStr && s.order_date <= monthEndStr
            ) || [];

            const thisMonthDelivered = monthSales.filter(s => s.parcel_status === 'delivered').length || 0;
            const thisMonthReturns = monthSales.filter(s => s.parcel_status === 'returned').length || 0;
            const processingCount = globalSales?.filter(s => s.parcel_status === 'processing').length || 0;
            const sentCount = globalSales?.filter(s => s.parcel_status === 'sent').length || 0;
            const pendingTotal = processingCount + sentCount;
            const returnRate = totalDelivered > 0 ? (totalReturns / totalDelivered) * 100 : 0;
            const monthHandled = thisMonthDelivered + thisMonthReturns;
            const deliverySuccessRate = monthHandled > 0 ? (thisMonthDelivered / monthHandled) * 100 : 0;

            const last30StartStr = format(subDays(now, 29), 'yyyy-MM-dd');
            const { data: movementRows, error: movementError } = await supabase
                .from('transactions')
                .select(`
                    quantity_changed,
                    sale:sales(order_date, parcel_status),
                    lot:product_lots(
                        products(sku)
                    )
                `)
                .eq('type', 'sale');

            if (movementError) throw movementError;

            const skuQtyMap = new Map<string, number>();
            (movementRows || []).forEach((r: any) => {
                const orderDate = r.sale?.order_date;
                if (!orderDate || orderDate < last30StartStr || orderDate > todayStr) return;
                const status = r.sale?.parcel_status;
                if (!['processing', 'sent', 'delivered'].includes(status)) return;
                const sku = r.lot?.products?.sku;
                if (!sku) return;
                const qty = Math.abs(Number(r.quantity_changed || 0));
                skuQtyMap.set(sku, (skuQtyMap.get(sku) || 0) + qty);
            });

            const topFastMoving = Array.from(skuQtyMap.entries())
                .map(([sku, qty]) => ({ sku, qty }))
                .sort((a, b) => b.qty - a.qty)
                .slice(0, 5);

            const last6Days = Array.from({ length: 6 }).map((_, i) => {
                const d = subDays(now, 5 - i);
                return format(d, 'yyyy-MM-dd');
            });

            const trendData = last6Days.map(date => {
                const daySales = globalSales?.filter(s => s.order_date === date) || [];
                return {
                    date: format(new Date(date), 'MMM dd'),
                    sales: daySales.length
                };
            });

            const monthInterval = eachMonthOfInterval({
                start: yearStart,
                end: now
            });

            const yearlyData = monthInterval.map(m => {
                const mStr = format(m, 'MMM');
                const mStartStr = format(startOfMonth(m), 'yyyy-MM-dd');
                const mEndStr = format(endOfMonth(m), 'yyyy-MM-dd');

                const monthSells = globalSales?.filter(s =>
                    s.order_date >= mStartStr && s.order_date <= mEndStr
                ) || [];

                return {
                    month: mStr,
                    delivered: monthSells.filter(s => s.parcel_status === 'delivered').length,
                    returns: monthSells.filter(s => s.parcel_status === 'returned').length
                };
            });

            const statusColorMap: Record<string, string> = {
                processing: '#f59e0b',
                sent: '#3b82f6',
                delivered: '#10b981',
                returned: '#ef4444',
                cancelled: '#6b7280'
            };
            const preferredOrder = ['processing', 'sent', 'delivered', 'returned', 'cancelled'];
            const statusCounts = (globalSales || []).reduce<Record<string, number>>((acc, s: any) => {
                const key = String(s.parcel_status || 'unknown').toLowerCase();
                acc[key] = (acc[key] || 0) + 1;
                return acc;
            }, {});
            const orderedStatuses = [
                ...preferredOrder.filter((s) => statusCounts[s] > 0),
                ...Object.keys(statusCounts).filter((s) => !preferredOrder.includes(s))
            ];
            const statusBreakdown = orderedStatuses.map((status) => ({
                name: status.charAt(0).toUpperCase() + status.slice(1),
                value: statusCounts[status] || 0,
                color: statusColorMap[status] || '#9ca3af'
            }));

            setStats({
                totalDelivered,
                totalReturns,
                processingCount,
                sentCount,
                pendingTotal,
                lowStock: lowStockCount,
                outOfStock: outOfStockCount,
                returnRate,
                deliverySuccessRate
            });
            setChartData(trendData);
            setMonthlySalesCount(yearlyData);
            setStatusData(statusBreakdown);
            setFastMovingSkus(topFastMoving);
            setError(null);
        } catch (error: any) {
            console.error('Error fetching dashboard data:', error);
            setError(error.message || 'Failed to sync dashboard stats');
        } finally {
            setLoading(false);
        }
    };

    const { profile } = useAuthStore();

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto space-y-10 pb-20">
                {error ? (
                    <div className="p-10 bg-rose-50 dark:bg-rose-950/10 border-2 border-rose-200 dark:border-rose-900/30 rounded-[3rem] flex flex-col items-center gap-4 text-center mt-6">
                        <div className="p-4 bg-rose-100 dark:bg-rose-900/10 text-rose-600 rounded-2xl">
                            <AlertTriangle size={36} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-xl font-black text-rose-700 dark:text-rose-400 font-outfit uppercase">Synchronization Failed</h2>
                            <p className="text-sm text-rose-600/70 dark:text-rose-400/60 font-medium max-w-md">{error}</p>
                        </div>
                        <button
                            onClick={() => fetchDashboardData()}
                            className="mt-2 px-8 py-3 bg-rose-600 text-white rounded-xl font-black uppercase text-xs tracking-[0.2em] shadow-lg shadow-rose-600/20 hover:scale-[1.02] transition-all"
                        >
                            Reconnect
                        </button>
                    </div>
                ) : loading ? (
                    <div className="flex h-[60vh] items-center justify-center">
                        <div className="flex flex-col items-center gap-4 animate-pulse">
                            <div className="h-16 w-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs font-black text-gray-400 uppercase tracking-widest mt-4">Harmonizing Data Records...</span>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Hero Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                            <div className="space-y-1">
                                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Executive Dashboard</h1>
                                <p className="text-gray-400 font-medium uppercase tracking-widest text-[10px]">Daily Performance Oversight</p>
                            </div>

                            <div className="flex items-center gap-3 bg-white dark:bg-gray-900 p-2 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                                    <Clock size={20} />
                                </div>
                                <div className="pr-4">
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Current Session</p>
                                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{format(new Date(), 'EEEE, MMM dd')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            <StatCard
                                title="Total Delivered"
                                value={stats.totalDelivered.toString()}
                                desc="Global successful orders"
                                icon={<ShoppingBag size={20} strokeWidth={1.5} />}
                                accent="bg-emerald-500"
                            />
                            <StatCard
                                title="Total Returns"
                                value={stats.totalReturns.toString()}
                                desc="Global parcel returns"
                                icon={<ArrowRightLeft size={20} strokeWidth={1.5} />}
                                accent="bg-rose-500"
                                isWarning={stats.totalReturns > 0}
                            />
                            <PendingCard
                                title="Pending Parcels"
                                total={stats.pendingTotal}
                                processing={stats.processingCount}
                                sent={stats.sentCount}
                                accent="bg-amber-500"
                            />
                            <StatCard
                                title="MTD Success Rate"
                                value={`${stats.deliverySuccessRate.toFixed(1)}%`}
                                desc="Delivered / (Delivered + Returned)"
                                icon={<TrendingUp size={20} strokeWidth={1.5} />}
                                accent="bg-emerald-500"
                            />
                        </div>

                        {/* Charts Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
                                <div className="flex items-center justify-between mb-8">
                                    <div>
                                        <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Sales Trend</h3>
                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Order volume over 6 days</p>
                                    </div>
                                    <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-black uppercase tracking-widest">
                                        Live Data
                                    </div>
                                </div>
                                <div className="h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData}>
                                            <defs>
                                                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} dy={10} />
                                            <YAxis hide axisLine={false} tickLine={false} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 800 }}
                                                cursor={{ stroke: '#3b82f6', strokeWidth: 2 }}
                                            />
                                            <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorSales)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
                                <div className="mb-8">
                                    <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Status Pipeline</h3>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Order Fulfillment Breakdown</p>
                                </div>
                                <div className="h-[250px] w-full relative">
                                    {statusData.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                                            <Package size={40} />
                                            <span className="text-[10px] font-black uppercase">No status data</span>
                                        </div>
                                    ) : (
                                        <>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={statusData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={80}
                                                        paddingAngle={8}
                                                        dataKey="value"
                                                    >
                                                        {statusData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800 }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <span className="text-[10px] font-black text-gray-400 uppercase">Total Orders</span>
                                                <span className="text-2xl font-black text-gray-900 dark:text-gray-100">
                                                    {statusData.reduce((s, d) => s + d.value, 0)}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="mt-6 space-y-3">
                                    {statusData.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs font-bold">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                                                <span className="text-gray-500">{item.name}</span>
                                            </div>
                                            <span className="text-gray-900 dark:text-gray-100">{item.value} units</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Annual Performance */}
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Annual Performance Overview</h3>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Monthly sales vs returns comparison</p>
                                </div>
                            </div>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthlySalesCount}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', fontWeight: 800 }}
                                        />
                                        <Bar dataKey="delivered" fill="#10b981" radius={[6, 6, 0, 0]} barSize={20} name="Delivered" />
                                        <Bar dataKey="returns" fill="#ef4444" radius={[6, 6, 0, 0]} barSize={20} name="Returns" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Actionable Alerts */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                            <div className="lg:col-span-3 bg-gradient-to-br from-gray-900 to-gray-800 rounded-[2.5rem] p-10 text-white relative overflow-hidden group shadow-2xl">
                                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 h-full">
                                    <div>
                                        <h2 className="text-3xl font-black font-outfit mb-3">Inventory Health High</h2>
                                        <p className="text-gray-400 font-medium max-w-md">Your batch-tracking systems are active. All {stats.lowStock > 0 ? 'but ' + stats.lowStock : 'primary'} stock configurations are within safety margins.</p>
                                        <div className="mt-8 flex gap-4">
                                            <button onClick={() => navigate('/admin/inventory')} className="px-6 py-3 bg-white text-gray-900 font-black rounded-xl text-xs uppercase tracking-widest hover:scale-105 transition-transform active:scale-95">
                                                Monitor Ledger
                                            </button>
                                            <button onClick={() => navigate('/admin/stock-in')} className="px-6 py-3 bg-white/10 text-white border border-white/20 font-black rounded-xl text-xs uppercase tracking-widest hover:bg-white/20 transition-all">
                                                Add Supply
                                            </button>
                                        </div>
                                    </div>
                                    <div className="bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 flex flex-col items-center">
                                        <div className="h-12 w-12 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-4">
                                            <Activity size={24} strokeWidth={1.5} />
                                        </div>
                                        <span className="text-2xl font-bold">{stats.returnRate.toFixed(1)}%</span>
                                        <span className="text-[10px] font-bold uppercase text-emerald-400 tracking-widest mt-2">Return Rate</span>
                                    </div>
                                </div>
                                <div className="absolute top-0 right-0 h-full w-1/3 bg-white/5 skew-x-[-20deg] translate-x-12 group-hover:bg-white/10 transition-colors duration-700"></div>
                            </div>

                            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 p-8 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="h-12 w-12 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-6">
                                        <AlertTriangle size={24} />
                                    </div>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Critical Alerts</h3>
                                    <p className="text-sm text-gray-500 font-medium mt-2">Inventory items requiring immediate restock action.</p>
                                </div>
                                <div className="mt-8 border-t dark:border-gray-800 pt-6">
                                    <div className="flex items-center justify-between">
                                        <span className="text-4xl font-black text-gray-900 dark:text-gray-100">{stats.lowStock}</span>
                                        <span className="px-3 py-1 bg-rose-50 dark:bg-rose-900/10 text-rose-600 text-[10px] font-black uppercase rounded-lg">Items Low</span>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between">
                                        <span className="text-xl font-black text-gray-900 dark:text-gray-100">{stats.outOfStock}</span>
                                        <span className="px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-[10px] font-black uppercase rounded-lg">Out of Stock</span>
                                    </div>
                                    <button onClick={() => navigate('/admin/inventory')} className="w-full h-12 mt-6 flex items-center justify-center gap-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-black rounded-xl text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors">
                                        View Alerts
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Fast Moving SKUs */}
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 p-8 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Top 5 Fast-Moving SKUs</h3>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Last 30 days by sold quantity</p>
                                </div>
                            </div>

                            {fastMovingSkus.length === 0 ? (
                                <div className="py-10 text-center text-sm text-gray-400 font-bold uppercase tracking-widest">
                                    No SKU movement in the last 30 days
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {fastMovingSkus.map((item, idx) => (
                                        <div key={item.sku} className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <span className="h-7 w-7 rounded-full bg-primary/10 text-primary text-xs font-black flex items-center justify-center">{idx + 1}</span>
                                                <span className="text-sm font-black text-gray-900 dark:text-gray-100">{item.sku}</span>
                                            </div>
                                            <span className="text-sm font-black text-gray-700 dark:text-gray-300">{item.qty} units</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}

function StatCard({ title, value, desc, icon, accent, isWarning = false }: any) {
    return (
        <div className={`group relative bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:shadow-md hover:translate-y-[-2px] ${isWarning ? 'ring-1 ring-rose-500/20' : ''}`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[10px] font-bold text-gray-500 dark:text-gray-300 uppercase tracking-widest mb-1">{title}</p>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{value}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 font-medium mt-1.5 flex items-center gap-1">
                        {desc}
                    </p>
                </div>
                <div className={`h-10 w-10 ${accent} text-white rounded-lg flex items-center justify-center shadow-lg shadow-current/10 transition-transform group-hover:scale-110`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}

function PendingCard({ title, total, processing, sent, accent }: any) {
    return (
        <div className="group relative bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:shadow-md hover:translate-y-[-2px]">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[10px] font-bold text-gray-500 dark:text-gray-300 uppercase tracking-widest mb-1">{title}</p>
                    <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{total}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 font-medium mt-1.5">Processing + Sent</p>
                </div>
                <div className={`h-10 w-10 ${accent} text-white rounded-lg flex items-center justify-center shadow-lg shadow-current/10 transition-transform group-hover:scale-110`}>
                    <Package size={18} strokeWidth={1.5} />
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-300">Processing</p>
                    <p className="text-base font-black text-gray-900 dark:text-gray-100">{processing}</p>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-300">Sent</p>
                    <p className="text-base font-black text-gray-900 dark:text-gray-100">{sent}</p>
                </div>
            </div>
        </div>
    );
}
