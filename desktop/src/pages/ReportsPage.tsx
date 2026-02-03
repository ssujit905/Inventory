import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Briefcase } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

type FinanceStats = {
    totalRevenue: number;
    totalCOGS: number;
    totalExpenses: number;
    netProfit: number;
    margin: number;
};

export default function ReportsPage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState<FinanceStats>({
        totalRevenue: 0,
        totalCOGS: 0,
        totalExpenses: 0,
        netProfit: 0,
        margin: 0
    });
    const [monthlyData, setMonthlyData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFinanceData();

        // Real-time updates for finance data
        const channel = supabase
            .channel('finance-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchFinanceData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchFinanceData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_lots' }, () => fetchFinanceData())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchFinanceData = async () => {
        setLoading(true);
        try {
            // 1. Fetch all delivered sales for Revenue
            const { data: deliveredSales, error: salesError } = await supabase
                .from('sales')
                .select('id, cod_amount, order_date')
                .eq('parcel_status', 'delivered');

            if (salesError) throw salesError;

            // 2. Fetch all sale transactions linked to delivered sales for COGS
            const { data: saleTransactions, error: transError } = await supabase
                .from('transactions')
                .select(`
                    quantity_changed,
                    lot:product_lots(cost_price),
                    sale:sales(parcel_status)
                `)
                .eq('type', 'sale');

            if (transError) throw transError;

            // 3. Fetch all expenses
            const { data: expensesData, error: expError } = await supabase
                .from('expenses')
                .select('amount, expense_date');

            if (expError) throw expError;

            // Calculate Stats
            const totalRevenue = (deliveredSales || []).reduce((sum, s) => sum + Number(s.cod_amount), 0);

            // Calculate COGS only for delivered items
            const totalCOGS = (saleTransactions || [])
                .filter((t: any) => t.sale?.parcel_status === 'delivered')
                .reduce((sum, t: any) => sum + (Math.abs(t.quantity_changed) * Number(t.lot?.cost_price || 0)), 0);

            const totalExpenses = (expensesData || []).reduce((sum, e) => sum + Number(e.amount), 0);

            const netProfit = totalRevenue - totalCOGS - totalExpenses;
            const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

            setStats({
                totalRevenue,
                totalCOGS,
                totalExpenses,
                netProfit,
                margin
            });

            // Calculate Monthly Trends (Last 6 months)
            const now = new Date();
            const last6Months = eachMonthOfInterval({
                start: subMonths(now, 5),
                end: now
            });

            const trendData = last6Months.map(month => {
                const mStart = startOfMonth(month);
                const mEnd = endOfMonth(month);
                const mLabel = format(month, 'MMM');

                const mRevenue = (deliveredSales || [])
                    .filter(s => {
                        const d = new Date(s.order_date);
                        return d >= mStart && d <= mEnd;
                    })
                    .reduce((sum, s) => sum + Number(s.cod_amount), 0);

                const mExpenses = (expensesData || [])
                    .filter(e => {
                        const d = new Date(e.expense_date);
                        return d >= mStart && d <= mEnd;
                    })
                    .reduce((sum, e) => sum + Number(e.amount), 0);

                return {
                    name: mLabel,
                    revenue: mRevenue,
                    expenses: mExpenses,
                    profit: mRevenue - mExpenses
                };
            });

            setMonthlyData(trendData);

        } catch (error: any) {
            console.error('Error fetching finance data:', error.message);
        } finally {
            setLoading(false);
        }
    };

    const { profile } = useAuthStore();

    if (loading) {
        return (
            <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
                <div className="flex h-[60vh] items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="space-y-8 pb-12">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Financial Performance</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Revenue, Profit & Expenditure Analytics</p>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <FinanceStatCard
                        title="Total Revenue"
                        value={stats.totalRevenue}
                        icon={<DollarSign className="text-emerald-500" />}
                        trend="+12.5%"
                        color="emerald"
                    />
                    <FinanceStatCard
                        title="Cost of Goods"
                        value={stats.totalCOGS}
                        icon={<PieChart className="text-amber-500" />}
                        trend="+5.2%"
                        color="amber"
                        sub="Stock Purchase Cost"
                    />
                    <FinanceStatCard
                        title="Total Expenses"
                        value={stats.totalExpenses}
                        icon={<Briefcase className="text-rose-500" />}
                        trend="+2.1%"
                        color="rose"
                    />
                    <FinanceStatCard
                        title="Net Profit"
                        value={stats.netProfit}
                        icon={stats.netProfit >= 0 ? <TrendingUp className="text-primary" /> : <TrendingDown className="text-rose-500" />}
                        trend={`${stats.margin.toFixed(1)}% Margin`}
                        color={stats.netProfit >= 0 ? "blue" : "rose"}
                        isProfit
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Monthly Comparison */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                        <div className="mb-8">
                            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Monthly Revenue vs Expenses</h3>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Cash flow comparison</p>
                        </div>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthlyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} name="Revenue" />
                                    <Bar dataKey="expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} name="Expenses" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Profit Trend */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                        <div className="mb-8">
                            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Profit Trajectory</h3>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Net gain over time</p>
                        </div>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthlyData}>
                                    <defs>
                                        <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Area type="monotone" dataKey="profit" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#profitGradient)" name="Net Profit" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

function FinanceStatCard({ title, value, icon, trend, color, isProfit, sub }: any) {
    const colors: any = {
        emerald: "bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 border-emerald-100 dark:border-emerald-800",
        amber: "bg-amber-50 dark:bg-amber-900/10 text-amber-600 border-amber-100 dark:border-amber-800",
        rose: "bg-rose-50 dark:bg-rose-900/10 text-rose-600 border-rose-100 dark:border-rose-800",
        blue: "bg-blue-50 dark:bg-blue-900/10 text-blue-600 border-blue-100 dark:border-blue-800"
    };

    return (
        <div className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all">
            <div className="flex items-center justify-between mb-6">
                <div className={`p-4 rounded-2xl ${colors[color]} border transition-transform group-hover:scale-110 duration-500`}>
                    {icon}
                </div>
                <div className="flex flex-col items-end">
                    <div className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest ${isProfit ? 'text-primary' : 'text-gray-400'}`}>
                        {trend}
                    </div>
                    {sub && <span className="text-[9px] font-bold text-gray-400 uppercase mt-1">{sub}</span>}
                </div>
            </div>

            <div className="space-y-1">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">{title}</h3>
                <div className="text-3xl font-black text-gray-900 dark:text-gray-100 font-mono tracking-tighter">
                    ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>

            <div className="absolute -bottom-6 -right-6 h-24 w-24 bg-gray-50 dark:bg-gray-800/20 rounded-full group-hover:scale-150 transition-transform duration-700 pointer-events-none opacity-50"></div>
        </div>
    );
}
