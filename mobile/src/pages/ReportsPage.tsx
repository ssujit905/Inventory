import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { IndianRupee, TrendingUp, Package, Wallet, ArrowUpRight, BarChart3 } from 'lucide-react';

type FinanceStats = {
    totalRevenue: number;
    totalCOGS: number;
    grossProfit: number;
    totalExpenses: number;
    totalReturn: number;
    totalInvestment: number;
    totalOperations: number;
    totalStockValue: number;
    netProfit: number;
    cashInHand: number;
    margin: number;
};

export default function ReportsPage() {
    const { profile } = useAuthStore();
    const [stats, setStats] = useState<FinanceStats>({
        totalRevenue: 0,
        totalCOGS: 0,
        grossProfit: 0,
        totalExpenses: 0,
        totalReturn: 0,
        totalInvestment: 0,
        totalOperations: 0,
        totalStockValue: 0,
        netProfit: 0,
        cashInHand: 0,
        margin: 0
    });
    const [monthlyData, setMonthlyData] = useState<any[]>([]);
    const [grossProfitMonthlyData, setGrossProfitMonthlyData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFinanceData();
    }, []);

    useRealtimeRefresh(
        () => fetchFinanceData(false),
        {
            channelName: 'finance-updates-v2',
            tables: ['sales', 'expenses', 'product_lots', 'income_entries', 'transactions'],
            pollMs: 12000
        }
    );

    const fetchFinanceData = async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
            const [incomeRes, transRes, expensesRes, lotSalesRes, lotsRes] = await Promise.all([
                supabase.from('income_entries').select('amount, income_date, category'),
                supabase.from('transactions').select(`
                    quantity_changed,
                    lot:product_lots(cost_price),
                    sale:sales(parcel_status)
                `).eq('type', 'in'),
                supabase.from('expenses').select('id, amount, description, expense_date, category, created_at'),
                supabase.from('transactions').select(`
                    id,
                    sale_id,
                    quantity_changed,
                    lot:product_lots(
                        id,
                        lot_number,
                        cost_price,
                        products(sku)
                    ),
                    sale:sales(id, sold_amount, return_cost, parcel_status, ad_id, order_date, created_at)
                `).eq('type', 'sale'),
                supabase.from('product_lots').select(`
                    id,
                    cost_price,
                    transactions (
                        type,
                        quantity_changed,
                        sales (parcel_status)
                    )
                `)
            ]);

            if (incomeRes.error) throw incomeRes.error;
            if (transRes.error) throw transRes.error;
            if (expensesRes.error) throw expensesRes.error;
            if (lotSalesRes.error) throw lotSalesRes.error;
            if (lotsRes.error) throw lotsRes.error;

            const incomeEntries = incomeRes.data;
            const saleTransactions = transRes.data;
            const expensesData = expensesRes.data;
            const lotSales = lotSalesRes.data;
            const lotsData = lotsRes.data;

            // Calculate Stats
            const deliveredSalesMap = new Map<string, { amount: number, date: string }>();
            (lotSales || []).forEach((t: any) => {
                if (t.sale?.parcel_status === 'delivered' && t.sale?.sold_amount) {
                    deliveredSalesMap.set(t.sale.id, {
                        amount: Number(t.sale.sold_amount),
                        date: t.sale.order_date || t.sale.created_at
                    });
                }
            });

            const salesRevenue = Array.from(deliveredSalesMap.values()).reduce((sum, s) => sum + s.amount, 0);
            const otherIncome = (incomeEntries || [])
                .filter((i: any) => i.category === 'income')
                .reduce((sum, i) => sum + Number(i.amount), 0);

            const totalRevenue = salesRevenue + otherIncome;

            const totalCOGS = (saleTransactions || [])
                .filter((t: any) => t.sale?.parcel_status !== 'cancelled')
                .reduce((sum, t: any) => sum + (Math.abs(t.quantity_changed) * Number(t.lot?.cost_price || 0)), 0);

            const toTimeKey = (value: any) => {
                if (!value) return '';
                if (typeof value === 'string') return value;
                if (value instanceof Date) return value.toISOString();
                return '';
            };

            const adBudgetMap = new Map<string, number>();
            (expensesData || [])
                .filter((e: any) => e.category === 'ads')
                .forEach((e: any) => adBudgetMap.set(e.id, Number(e.amount || 0)));

            const extractPackagingQty = (description: string | null | undefined): number => {
                if (!description) return 0;
                const match = description.match(/qty\s*:\s*(\d+)/i);
                return match ? Number(match[1] || 0) : 0;
            };

            const packagingHistory = (expensesData || [])
                .filter((e: any) => e.category === 'packaging')
                .map((e: any) => ({
                    timeKey: toTimeKey(e.created_at),
                    amount: Number(e.amount || 0),
                    unitCost: (() => {
                        const qty = extractPackagingQty(e.description);
                        if (qty > 0) return Number(e.amount || 0) / qty;
                        return Number(e.amount || 0);
                    })()
                }))
                .filter((p: any) => p.timeKey)
                .sort((a: any, b: any) => a.timeKey.localeCompare(b.timeKey));

            const adSaleIds = new Map<string, Set<string>>();
            (lotSales || []).forEach((t: any) => {
                const adId = t.sale?.ad_id;
                if (!adId || !t.sale_id) return;
                if (!adSaleIds.has(adId)) adSaleIds.set(adId, new Set());
                adSaleIds.get(adId)!.add(t.sale_id);
            });

            const packagingBySale = new Map<string, number>();
            (lotSales || []).forEach((t: any) => {
                if (!t.sale_id || !t.sale) return;
                const saleTimeKey = toTimeKey(t.sale.created_at);
                if (!saleTimeKey) return;
                let selected = 0;
                for (const p of packagingHistory) {
                    if (p.timeKey <= saleTimeKey) selected = p.unitCost;
                    else break;
                }
                packagingBySale.set(t.sale_id, selected);
            });

            const saleRowIndex = new Map<string, number>();
            const grossProfitFromSales = (lotSales || [])
                .filter((t: any) => t.sale_id && t.lot)
                .reduce((sum: number, t: any) => {
                    const qty = Math.abs(Number(t.quantity_changed || 0));
                    const costPrice = Number(t.lot?.cost_price || 0);
                    const adId = t.sale?.ad_id;
                    const budget = adId ? (adBudgetMap.get(adId) || 0) : 0;
                    const count = adId ? (adSaleIds.get(adId)?.size || 1) : 1;
                    const adsSpent = adId ? budget / count : 0;
                    const rowIndex = saleRowIndex.get(t.sale_id) || 0;
                    saleRowIndex.set(t.sale_id, rowIndex + 1);
                    const isFirstRow = rowIndex === 0;
                    const adsSpentRow = isFirstRow ? adsSpent : 0;
                    const packagingSpent = isFirstRow ? (packagingBySale.get(t.sale_id) || 0) : 0;
                    const status = t.sale?.parcel_status;
                    const soldAmount = (isFirstRow && status === 'delivered') ? Number(t.sale?.sold_amount || 0) : 0;
                    const returnCost = (isFirstRow && status === 'returned') ? Number(t.sale?.return_cost || 0) : 0;
                    
                    let profitLoss = 0;
                    if (status === 'returned') {
                        profitLoss = -(returnCost + adsSpentRow + packagingSpent);
                    } else if (status === 'cancelled') {
                        profitLoss = -adsSpentRow;
                    } else {
                        profitLoss = soldAmount - (qty * costPrice + adsSpentRow + packagingSpent);
                    }
                    return sum + profitLoss;
                }, 0);

            const otherExpensesTotal = (expensesData || [])
                .filter((e: any) => e.category === 'other')
                .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

            const grossProfit = grossProfitFromSales - otherExpensesTotal;

            const monthProfitMap = new Map<string, number>();
            const saleRowIndexForMonthly = new Map<string, number>();
            (lotSales || []).forEach((t: any) => {
                const qty = Math.abs(Number(t.quantity_changed || 0));
                const costPrice = Number(t.lot?.cost_price || 0);
                const adId = t.sale?.ad_id;
                const budget = adId ? (adBudgetMap.get(adId) || 0) : 0;
                const count = adId ? (adSaleIds.get(adId)?.size || 1) : 1;
                const adsSpent = adId ? budget / count : 0;
                const rowIndex = saleRowIndexForMonthly.get(t.sale_id) || 0;
                saleRowIndexForMonthly.set(t.sale_id, rowIndex + 1);
                const isFirstRow = rowIndex === 0;
                const adsSpentRow = isFirstRow ? adsSpent : 0;
                const packagingSpent = isFirstRow ? (packagingBySale.get(t.sale_id) || 0) : 0;
                const status = t.sale?.parcel_status;
                const soldAmount = (isFirstRow && status === 'delivered') ? Number(t.sale?.sold_amount || 0) : 0;
                const returnCost = (isFirstRow && status === 'returned') ? Number(t.sale?.return_cost || 0) : 0;
                
                let profitLoss = 0;
                if (status === 'returned') {
                    profitLoss = -(returnCost + adsSpentRow + packagingSpent);
                } else if (status === 'cancelled') {
                    profitLoss = -adsSpentRow;
                } else {
                    profitLoss = soldAmount - (qty * costPrice + adsSpentRow + packagingSpent);
                }

                const saleDate = new Date(t.sale?.created_at || t.sale?.order_date || new Date());
                const monthKey = format(saleDate, 'yyyy-MM');
                monthProfitMap.set(monthKey, (monthProfitMap.get(monthKey) || 0) + profitLoss);
            });

            const monthOpsMap = new Map<string, number>();
            (incomeEntries || [])
                .filter((i: any) => i.category === 'operation')
                .forEach((i: any) => {
                    const date = new Date(i.income_date);
                    const key = format(date, 'yyyy-MM');
                    monthOpsMap.set(key, (monthOpsMap.get(key) || 0) + Number(i.amount));
                });

            const saleRowIndexForReturns = new Map<string, number>();
            const totalReturn = (lotSales || [])
                .reduce((sum: number, t: any) => {
                    const rowIndex = saleRowIndexForReturns.get(t.sale_id) || 0;
                    saleRowIndexForReturns.set(t.sale_id, rowIndex + 1);
                    const isFirstRow = rowIndex === 0;
                    const isReturned = t.sale?.parcel_status === 'returned';
                    const returnCost = (isFirstRow && isReturned) ? Number(t.sale?.return_cost || 0) : 0;
                    return sum + returnCost;
                }, 0);

            const totalExpenses = (expensesData || []).reduce((sum, e) => sum + Number(e.amount), 0);
            const totalInvestment = (incomeEntries || [])
                .filter((i: any) => i.category === 'investment')
                .reduce((sum, i) => sum + Number(i.amount), 0);

            const totalOperations = (incomeEntries || [])
                .filter((i: any) => i.category === 'operation')
                .reduce((sum, i) => sum + Number(i.amount), 0);

            const totalStockValue = (lotsData || [])
                .map((lot: any) => {
                    const txs = lot.transactions || [];
                    const stockIn = txs
                        .filter((t: any) => t.type === 'in')
                        .reduce((sum: number, t: any) => sum + Number(t.quantity_changed || 0), 0);

                    const sold = txs
                        .filter((t: any) => {
                            if (t.type !== 'sale') return false;
                            if (t.sales) {
                                return ['processing', 'sent', 'delivered'].includes(t.sales.parcel_status);
                            }
                            return true;
                        })
                        .reduce((sum: number, t: any) => sum + Math.abs(Number(t.quantity_changed || 0)), 0);

                    const remaining = stockIn - sold;
                    return Math.max(0, remaining) * Number(lot.cost_price || 0);
                })
                .reduce((sum: number, v: number) => sum + v, 0);

            const cashInHand = (totalRevenue + totalInvestment) - (totalCOGS + totalExpenses + totalReturn + totalOperations);
            const netProfit = grossProfit - totalOperations;
            const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

            setStats({
                totalRevenue,
                totalCOGS,
                grossProfit,
                totalExpenses,
                totalReturn,
                totalInvestment,
                totalOperations,
                totalStockValue,
                netProfit,
                cashInHand,
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

                const mSalesRevenue = Array.from(deliveredSalesMap.values())
                    .filter(s => {
                        const d = new Date(s.date);
                        return d >= mStart && d <= mEnd;
                    })
                    .reduce((sum, s) => sum + s.amount, 0);

                const mOtherIncome = (incomeEntries || [])
                    .filter((i: any) => i.category === 'income')
                    .filter((i: any) => {
                        const d = new Date(i.income_date);
                        return d >= mStart && d <= mEnd;
                    })
                    .reduce((sum, i) => sum + Number(i.amount), 0);

                const mRevenue = mSalesRevenue + mOtherIncome;

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
                };
            });

            setMonthlyData(trendData);

            const last12Months = eachMonthOfInterval({
                start: subMonths(now, 11),
                end: now
            });

            const gpTrendData = last12Months.map(month => {
                const key = format(month, 'yyyy-MM');
                const gp = monthProfitMap.get(key) || 0;
                const ops = monthOpsMap.get(key) || 0;
                return {
                    name: format(month, 'MMM'),
                    grossProfit: gp,
                    netProfit: gp - ops
                };
            });

            setGrossProfitMonthlyData(gpTrendData);

        } catch (error: any) {
            console.error('Error fetching finance data:', error.message);
        } finally {
            if (showLoader) setLoading(false);
        }
    };

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
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-24">
                {/* Header */}
                <div className="space-y-1">
                    <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Financial Overview</h1>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Growth & Expenditure Analytics</p>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <FinanceStatCard title="Revenue" value={stats.totalRevenue} color="emerald" icon={<TrendingUp size={14} />} />
                    <FinanceStatCard title="COGS" value={stats.totalCOGS} color="amber" sub="Stock Purchase" icon={<Package size={14} />} />
                    <FinanceStatCard title="Expenses" value={stats.totalExpenses} color="rose" icon={<Wallet size={14} />} />
                    <FinanceStatCard title="Returns" value={stats.totalReturn} color="rose" sub="Logistics Cost" icon={<Package size={14} />} />
                    <FinanceStatCard title="Operations" value={stats.totalOperations} color="amber" icon={<Wallet size={14} />} />
                    <FinanceStatCard title="Gross Profit" value={stats.grossProfit} color="emerald" sub="Before Ops" icon={<ArrowUpRight size={14} />} />
                    <FinanceStatCard title="Net Profit" value={stats.netProfit} color="emerald" sub="After Ops" icon={<BarChart3 size={14} />} />
                    <FinanceStatCard title="Investment" value={stats.totalInvestment} color="blue" sub={`${stats.margin.toFixed(1)}% Margin`} icon={<IndianRupee size={14} />} />
                    <FinanceStatCard title="Inventory" value={stats.totalStockValue} color="indigo" sub="Stock Value" icon={<Package size={14} />} />
                    <FinanceStatCard title="Cash flow" value={stats.cashInHand} color="emerald" sub="Liquid Assets" icon={<Wallet size={14} />} />
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 gap-6">
                    {/* Monthly Comparison */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="mb-6 flex flex-col gap-2">
                            <h3 className="text-base font-black text-gray-900 dark:text-gray-100 tracking-tight">Revenue vs Expenses</h3>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Revenue</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-sm" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Expenses</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-[240px] w-full -ml-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthlyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.2} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                                    />
                                    <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} name="Revenue" />
                                    <Bar dataKey="expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={12} name="Expenses" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Gross Profit Trend */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="mb-6 flex flex-col gap-2">
                            <h3 className="text-base font-black text-gray-900 dark:text-gray-100 tracking-tight">Profit Trends</h3>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Gross Profit</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-sm" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Net Profit</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-[240px] w-full -ml-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={grossProfitMonthlyData}>
                                    <defs>
                                        <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.12} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="netProfitGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.12} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.2} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                                    />
                                    <Area type="monotone" dataKey="grossProfit" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#profitGradient)" name="Gross Profit" />
                                    <Area type="monotone" dataKey="netProfit" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#netProfitGradient)" name="Net Profit" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

function FinanceStatCard({ title, value, color, icon, sub }: any) {
    const accents: any = {
        emerald: "bg-emerald-500",
        amber: "bg-amber-500",
        rose: "bg-rose-500",
        blue: "bg-blue-500",
        indigo: "bg-indigo-500"
    };

    return (
        <div className="group relative bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all active:scale-[0.98]">
            <div className="flex items-start justify-between">
                <div className="min-w-0">
                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-1 truncate">{title}</p>
                    <h4 className="text-sm font-black text-gray-900 dark:text-gray-100 tracking-tight">
                        Rs. {value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </h4>
                    <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-1.5 truncate">
                        {sub}
                    </p>
                </div>
                <div className={`h-8 w-8 flex-shrink-0 ${accents[color] || 'bg-primary'} text-white rounded-lg flex items-center justify-center shadow-lg shadow-current/10 group-hover:scale-110 transition-transform`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}
