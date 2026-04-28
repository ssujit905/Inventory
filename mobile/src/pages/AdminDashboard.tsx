import { useState, useEffect, cloneElement } from 'react';
import { useNavigate } from "react-router-dom"
import DashboardLayout from "../layouts/DashboardLayout"
import { Package, Activity, AlertTriangle, TrendingUp, ShoppingBag, ArrowRightLeft, Clock, IndianRupee, Globe } from 'lucide-react'
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
    const [websiteOrdersCount, setWebsiteOrdersCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchDashboardData();

        // Auto-refresh when user returns to the tab (fixes "stuck loader" after sleep)
        const handleFocus = () => {
            console.log('Window focused, re-syncing dashboard...');
            fetchDashboardData(false);
        };

        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    useRealtimeRefresh(
        () => fetchDashboardData(false),
        {
            channelName: 'dashboard-updates-v2',
            tables: ['sales', 'product_lots', 'transactions', 'website_orders'],
            pollMs: 10000
        }
    );

    const fetchDashboardData = async (isInitial = true) => {
        if (isInitial) {
            setLoading(true);
            // Safety timeout: if sync takes > 15s, stop the loader to prevent freeze
            setTimeout(() => {
                setLoading(current => {
                    if (current) {
                        console.warn('Dashboard sync timed out, clearing loader.');
                        return false;
                    }
                    return current;
                });
            }, 15000);
        }
        try {
            const now = new Date();
            const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');
            const monthEndStr = format(endOfMonth(now), 'yyyy-MM-dd');
            const todayStr = format(now, 'yyyy-MM-dd');
            const yearStart = startOfYear(now);

            const [salesRes, productsRes, websiteOrdersRes] = await Promise.all([
                supabase
                    .from('sales')
                    .select('parcel_status, order_date'),
                supabase
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
                    `),
                supabase
                    .from('website_orders')
                    .select('id, status')
                    .or('status.eq.processing,status.eq.pending')
            ]);

            if (salesRes.error) throw salesRes.error;
            if (productsRes.error) throw productsRes.error;

            setWebsiteOrdersCount(websiteOrdersRes.data?.length || 0);

            const globalSales = salesRes.data;
            const productsData = productsRes.data;

            const totalDelivered = globalSales?.filter(s => s.parcel_status === 'delivered').length || 0;
            const totalReturns = globalSales?.filter(s => s.parcel_status === 'returned').length || 0;

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
                    sale:sales!inner(order_date, parcel_status),
                    lot:product_lots(
                        products(sku)
                    )
                `)
                .eq('type', 'sale')
                .gte('sales.order_date', last30StartStr);

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
                const daySales = globalSales?.filter(s => 
                    s.order_date === date && 
                    ['processing', 'sent', 'delivered'].includes(s.parcel_status)
                ) || [];
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
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">
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
                        {/* Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Executive Dashboard</h1>
                                <p className="text-gray-400 font-medium text-xs uppercase tracking-widest">Daily Performance Oversight</p>
                            </div>
                            <div className="flex items-center gap-3 bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm w-full md:w-auto">
                                <div className="h-9 w-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                                    <Clock size={18} />
                                </div>
                                <div>
                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Current Session</p>
                                    <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{format(new Date(), 'EEEE, MMM dd')}</p>
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            <StatCard
                                title="Web Orders"
                                value={websiteOrdersCount.toString()}
                                desc="Pending"
                                icon={<Globe size={16} />}
                                accent="bg-primary"
                                onClick={() => navigate('/admin/website/orders')}
                            />
                            <StatCard
                                title="Delivered"
                                value={stats.totalDelivered.toString()}
                                desc="Global Success"
                                icon={<ShoppingBag size={16} />}
                                accent="bg-emerald-500"
                            />
                            <StatCard
                                title="Returns"
                                value={stats.totalReturns.toString()}
                                desc="Parcel Returns"
                                icon={<ArrowRightLeft size={16} />}
                                accent="bg-rose-500"
                                isWarning={stats.totalReturns > 0}
                            />
                            <StatCard
                                title="Success"
                                value={`${stats.deliverySuccessRate.toFixed(1)}%`}
                                desc="MTD Rate"
                                icon={<TrendingUp size={16} />}
                                accent="bg-emerald-500"
                            />
                            <div className="col-span-2 lg:col-span-1">
                                <PendingCard
                                    title="Pipeline"
                                    total={stats.pendingTotal}
                                    processing={stats.processingCount}
                                    sent={stats.sentCount}
                                    accent="bg-amber-500"
                                />
                            </div>
                        </div>

                        {/* Analytics Sections */}
                        <div className="flex items-center gap-2 px-1 mt-4">
                            <Activity size={14} strokeWidth={1.5} className="text-gray-400" />
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Trend Analysis</h3>
                            <span className="ml-auto text-[10px] font-bold text-gray-300">Live Sync</span>
                        </div>
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Sales Trend</h3>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Order volume over 6 days</p>
                                    </div>
                                    <div className="px-2 py-1 bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 rounded-md text-[9px] font-black uppercase tracking-widest">
                                        Live
                                    </div>
                                </div>
                                <div className="h-[240px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData}>
                                            <defs>
                                                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} dy={10} />
                                            <YAxis hide axisLine={false} tickLine={false} />
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, fontSize: '10px' }}
                                            />
                                            <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
                                <div className="mb-6">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Status Pipeline</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Order Fulfillment Breakdown</p>
                                </div>
                                <div className="h-[200px] w-full relative">
                                    {statusData.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                                            <Package size={32} />
                                            <span className="text-[9px] font-black uppercase">No data</span>
                                        </div>
                                    ) : (
                                        <>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={statusData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={50}
                                                        outerRadius={70}
                                                        paddingAngle={6}
                                                        dataKey="value"
                                                    >
                                                        {statusData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, fontSize: '10px' }}
                                                    />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                                <span className="text-[8px] font-black text-gray-400 uppercase">Total</span>
                                                <span className="text-xl font-black text-gray-900 dark:text-gray-100">
                                                    {statusData.reduce((s, d) => s + d.value, 0)}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    {statusData.map((item, i) => (
                                        <div key={i} className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                                                <span className="text-[9px] font-bold text-gray-500 truncate">{item.name}</span>
                                            </div>
                                            <span className="text-[9px] font-black text-gray-900 dark:text-gray-100 ml-1">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Annual Performance */}
                        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Annual Performance</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Monthly sales vs returns</p>
                                </div>
                            </div>
                            <div className="h-[240px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthlySalesCount}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 800, fontSize: '10px' }}
                                        />
                                        <Bar dataKey="delivered" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} name="Delivered" />
                                        <Bar dataKey="returns" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={12} name="Returns" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Alerts & Health */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-gray-900 rounded-xl p-6 text-white relative overflow-hidden group shadow-lg">
                                <div className="relative z-10 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <div className="h-10 w-10 bg-emerald-500 text-white rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                            <Activity size={20} />
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Return Rate</p>
                                            <p className="text-lg font-black text-emerald-400 leading-none">{stats.returnRate.toFixed(1)}%</p>
                                        </div>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold mb-1">Inventory Health</h2>
                                        <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                                            Systems are active. All {stats.lowStock > 0 ? 'but ' + stats.lowStock : 'primary'} stock configurations are within safety margins.
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => navigate('/admin/inventory')} className="flex-1 py-2.5 bg-white text-gray-900 font-black rounded-lg text-[10px] uppercase tracking-widest active:scale-95 transition-transform">
                                            Ledger
                                        </button>
                                        <button onClick={() => navigate('/admin/stock-in')} className="flex-1 py-2.5 bg-white/10 text-white border border-white/20 font-black rounded-lg text-[10px] uppercase tracking-widest hover:bg-white/20 active:scale-95 transition-all">
                                            Supply
                                        </button>
                                    </div>
                                </div>
                                <div className="absolute top-0 right-0 h-full w-1/4 bg-white/5 skew-x-[-20deg] translate-x-8"></div>
                            </div>

                            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm flex flex-col justify-between">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Critical Alerts</h3>
                                        <p className="text-[10px] text-gray-400 font-medium mt-0.5">Restock actions required.</p>
                                    </div>
                                    <div className="h-9 w-9 bg-rose-50 text-rose-500 rounded-lg flex items-center justify-center">
                                        <AlertTriangle size={18} />
                                    </div>
                                </div>
                                <div className="mt-6 flex items-center justify-around bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl">
                                    <div className="text-center">
                                        <p className="text-xl font-black text-rose-500">{stats.lowStock}</p>
                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">Low Stock</p>
                                    </div>
                                    <div className="h-8 w-px bg-gray-200 dark:bg-gray-700" />
                                    <div className="text-center">
                                        <p className="text-xl font-black text-gray-900 dark:text-gray-100">{stats.outOfStock}</p>
                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">Out of Stock</p>
                                    </div>
                                </div>
                                <button onClick={() => navigate('/admin/inventory')} className="w-full h-10 mt-4 flex items-center justify-center gap-2 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-lg text-[10px] uppercase tracking-widest hover:bg-gray-100 transition-colors">
                                    View Details
                                </button>
                            </div>
                        </div>

                        {/* Top Moving Items */}
                        <div className="flex items-center gap-2 px-1 mt-4">
                            <TrendingUp size={14} strokeWidth={1.5} className="text-gray-400" />
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Inventory Velocity</h3>
                            <span className="ml-auto text-[10px] font-bold text-gray-300">{fastMovingSkus.length} SKUs</span>
                        </div>
                        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
                            <div className="mb-5">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Fast-Moving SKUs</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Last 30 days movement</p>
                            </div>

                            {fastMovingSkus.length === 0 ? (
                                <div className="py-6 text-center text-[10px] text-gray-300 font-black uppercase tracking-widest italic">
                                    No movement recorded
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {fastMovingSkus.map((item, idx) => (
                                        <div key={item.sku} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800/50 px-4 py-3 border border-transparent hover:border-primary/20 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="h-6 w-6 rounded-md bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center">{idx + 1}</span>
                                                <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{item.sku}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs font-black text-gray-900 dark:text-gray-100">{item.qty}</span>
                                                <span className="text-[9px] font-bold text-gray-400 uppercase">units</span>
                                            </div>
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

function StatCard({ title, value, desc, icon, accent, isWarning = false, onClick }: any) {
    return (
        <div 
            onClick={onClick}
            className={`group bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all active:scale-95 ${onClick ? 'cursor-pointer hover:border-primary/30' : ''}`}>
            <div className="flex items-start justify-between mb-2">
                <div className={`h-8 w-8 ${accent} text-white rounded-lg flex items-center justify-center shadow-lg shadow-current/10`}>
                    {cloneElement(icon, { size: 16 })}
                </div>
                {isWarning && <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />}
            </div>
            <div>
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{title}</p>
                <div className="flex items-baseline gap-1">
                    <h4 className="text-lg font-black text-gray-900 dark:text-gray-100">{value}</h4>
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">{desc}</span>
                </div>
            </div>
        </div>
    );
}

function PendingCard({ title, total, processing, sent, accent }: any) {
    return (
        <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm h-full">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className={`h-7 w-7 ${accent} text-white rounded-lg flex items-center justify-center`}>
                        <Package size={14} />
                    </div>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{title}</span>
                </div>
                <span className="text-sm font-black text-gray-900 dark:text-gray-100">{total}</span>
            </div>
            <div className="flex gap-2">
                <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                    <p className="text-[7px] font-bold text-gray-400 uppercase">Process</p>
                    <p className="text-xs font-black text-gray-700 dark:text-gray-200">{processing}</p>
                </div>
                <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                    <p className="text-[7px] font-bold text-gray-400 uppercase">Sent</p>
                    <p className="text-xs font-black text-gray-700 dark:text-gray-200">{sent}</p>
                </div>
            </div>
        </div>
    );
}
