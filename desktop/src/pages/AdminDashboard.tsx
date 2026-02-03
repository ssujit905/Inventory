import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom"
import DashboardLayout from "../layouts/DashboardLayout"
import { Package, Activity, AlertTriangle, TrendingUp, ShoppingBag, ArrowRightLeft, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../hooks/useAuthStore';
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
        thisMonthDelivered: 0,
        thisMonthReturns: 0,
        lowStock: 0
    });

    const [chartData, setChartData] = useState<{ date: string; sales: number }[]>([]);
    const [monthlySalesCount, setMonthlySalesCount] = useState<{ month: string; delivered: number; returns: number }[]>([]);
    const [statusData, setStatusData] = useState<{ name: string; value: number; color: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();

        // Subscribe to changes in sales and product_lots
        const channel = supabase
            .channel('dashboard-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
                fetchDashboardData(false);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_lots' }, () => {
                fetchDashboardData(false);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchDashboardData = async (isInitial = true) => {
        if (isInitial) setLoading(true);
        try {
            const now = new Date();
            const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');
            const monthEndStr = format(endOfMonth(now), 'yyyy-MM-dd');
            const yearStart = startOfYear(now);

            // 1. Get Global Sales Data for calculations
            const { data: globalSales } = await supabase
                .from('sales')
                .select('parcel_status, order_date');

            const totalDelivered = globalSales?.filter(s => s.parcel_status === 'delivered').length || 0;
            const totalReturns = globalSales?.filter(s => s.parcel_status === 'returned').length || 0;

            // 2. Low Stock Alerts
            const { data: productsData } = await supabase
                .from('products')
                .select('id, min_stock_alert, product_lots(quantity_remaining)');

            const lowStockCount = productsData?.filter(p => {
                const totalSlats = (p.product_lots as any[]).reduce((sum, l) => sum + l.quantity_remaining, 0);
                return totalSlats <= 5;
            }).length || 0;

            // 3. Current Month Stats
            const monthSales = globalSales?.filter(s =>
                s.order_date >= monthStartStr && s.order_date <= monthEndStr
            ) || [];

            const thisMonthDelivered = monthSales.filter(s => s.parcel_status === 'delivered').length || 0;
            const thisMonthReturns = monthSales.filter(s => s.parcel_status === 'returned').length || 0;

            // 4. Trend Data (Last 6 Days)
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

            // 5. Yearly Monthly Breakdown
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

            // 6. Status Breakdown
            const statuses = ['processing', 'sent', 'delivered', 'returned'];
            const colors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444'];

            const statusBreakdown = statuses.map((status, i) => ({
                name: status.charAt(0).toUpperCase() + status.slice(1),
                value: globalSales?.filter(s => s.parcel_status === status).length || 0,
                color: colors[i]
            })).filter(s => s.value > 0);

            setStats({
                totalDelivered,
                totalReturns,
                thisMonthDelivered,
                thisMonthReturns,
                lowStock: lowStockCount
            });
            setChartData(trendData);
            setMonthlySalesCount(yearlyData);
            setStatusData(statusBreakdown);

        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const { profile } = useAuthStore();

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto space-y-10 pb-20">

                {/* Hero Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Executive Dashboard</h1>
                        <p className="text-gray-500 font-bold uppercase tracking-[0.3em] text-[10px] ml-1">Daily Performance Oversight</p>
                    </div>

                    <div className="flex items-center gap-3 bg-white dark:bg-gray-900 p-2 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                        <div className="h-10 w-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                            <Clock size={20} />
                        </div>
                        <div className="pr-4">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Current Session</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{format(new Date(), 'EEEE, MMM dd')}</p>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-96 items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                            <span className="text-sm font-black text-gray-400 uppercase tracking-widest">Compiling Analytics...</span>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard
                                title="Total Delivered"
                                value={stats.totalDelivered.toString()}
                                desc="Global successful orders"
                                icon={<ShoppingBag size={24} />}
                                accent="bg-emerald-500"
                            />
                            <StatCard
                                title="Total Returns"
                                value={stats.totalReturns.toString()}
                                desc="Global parcel returns"
                                icon={<ArrowRightLeft size={24} />}
                                accent="bg-rose-500"
                                isWarning={stats.totalReturns > 0}
                            />
                            <StatCard
                                title="This Month Delivered"
                                value={stats.thisMonthDelivered.toString()}
                                desc="Delivered this month"
                                icon={<TrendingUp size={24} />}
                                accent="bg-blue-500"
                            />
                            <StatCard
                                title="This Month Returns"
                                value={stats.thisMonthReturns.toString()}
                                desc="Returns this month"
                                icon={<Activity size={24} />}
                                accent="bg-amber-500"
                            />
                        </div>

                        {/* Charts Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                            {/* Revenue Trend (Area Chart) */}
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

                            {/* Delivery Status (Pie) */}
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

                        {/* Lower Grid (Actionable Alerts) */}
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
                                    <div className="bg-white/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 flex flex-col items-center">
                                        <div className="h-16 w-16 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 mb-4">
                                            <Activity size={32} />
                                        </div>
                                        <span className="text-3xl font-black">98.2%</span>
                                        <span className="text-[10px] font-black uppercase text-emerald-400 tracking-[0.2em] mt-2">Accuracy Rate</span>
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
                                    <button onClick={() => navigate('/admin/inventory')} className="w-full h-12 mt-6 flex items-center justify-center gap-2 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-black rounded-xl text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors">
                                        View Alerts
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

            </div>
        </DashboardLayout>
    )
}

function StatCard({ title, value, desc, icon, accent, isWarning = false }: any) {
    return (
        <div className={`group relative bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:shadow-2xl hover:scale-[1.02] ${isWarning ? 'ring-2 ring-rose-500/20 shadow-rose-500/5' : ''}`}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{title}</p>
                    <h4 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-mono tracking-tighter">{value}</h4>
                    <p className="text-[11px] text-gray-500 font-medium mt-2 flex items-center gap-1.5">
                        {desc}
                    </p>
                </div>
                <div className={`h-14 w-14 ${accent} text-white rounded-[1.25rem] flex items-center justify-center shadow-lg shadow-current/20 transition-transform group-hover:rotate-12`}>
                    {icon}
                </div>
            </div>

            <div className={`absolute bottom-6 left-8 right-8 h-1 rounded-full ${accent} opacity-10`}></div>
        </div>
    )
}
