import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { DollarSign } from 'lucide-react';

type FinanceStats = {
    totalRevenue: number;
    totalCOGS: number;
    grossProfit: number;
    totalExpenses: number;
    totalReturn: number;
    totalInvestment: number;
    totalStockValue: number;
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
        totalStockValue: 0,
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
            // 1. Fetch income entries for Revenue
            const { data: incomeEntries, error: incomeError } = await supabase
                .from('income_entries')
                .select('amount, income_date, category');

            if (incomeError) throw incomeError;

            // 2. Fetch all stock-in transactions for COGS
            const { data: saleTransactions, error: transError } = await supabase
                .from('transactions')
                .select(`
                    quantity_changed,
                    lot:product_lots(cost_price),
                    sale:sales(parcel_status)
                `)
                .eq('type', 'in');

            if (transError) throw transError;

            // 3. Fetch all expenses
            const { data: expensesData, error: expError } = await supabase
                .from('expenses')
                .select('id, amount, description, expense_date, category, created_at');

            if (expError) throw expError;

            // 4. Fetch lot-level sales transactions for profit allocation
            const { data: lotSales, error: lotSalesError } = await supabase
                .from('transactions')
                .select(`
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
                `)
                .eq('type', 'sale');

            if (lotSalesError) throw lotSalesError;

            // 4. Fetch lots with transactions to compute remaining (Inventory logic)
            const { data: lotsData, error: lotsError } = await supabase
                .from('product_lots')
                .select(`
                    id,
                    cost_price,
                    transactions (
                        type,
                        quantity_changed,
                        sales (parcel_status)
                    )
                `);

            if (lotsError) throw lotsError;

            // Calculate Stats
            // 5. Calculate Revenue from Delivered Sales (Avoiding double-counting lots)
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

            // Manual income entries can also be added if needed, but per request we focus on sold amounts
            const otherIncome = (incomeEntries || [])
                .filter((i: any) => i.category === 'income')
                .reduce((sum, i) => sum + Number(i.amount), 0);

            const totalRevenue = salesRevenue + otherIncome;

            // Calculate Stock Purchase Value (Requested as COGS by user)
            const totalCOGS = (saleTransactions || [])
                .reduce((sum, t: any) => sum + (Math.abs(t.quantity_changed) * Number(t.lot?.cost_price || 0)), 0);
            // Gross Profit synced with Profit page sale-wise Profit/Loss total
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
                    const profitLoss = status === 'returned'
                        ? -(returnCost + adsSpentRow + packagingSpent)
                        : (soldAmount - (qty * costPrice + adsSpentRow + packagingSpent));
                    return sum + profitLoss;
                }, 0);

            const otherExpensesTotal = (expensesData || [])
                .filter((e: any) => e.category === 'other')
                .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

            const grossProfit = grossProfitFromSales - otherExpensesTotal;

            const monthProfitMap = new Map<string, number>();
            const saleRowIndexForMonthly = new Map<string, number>();
            (lotSales || [])
                .filter((t: any) => t.sale_id && t.lot)
                .forEach((t: any) => {
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
                    const profitLoss = status === 'returned'
                        ? -(returnCost + adsSpentRow + packagingSpent)
                        : (soldAmount - (qty * costPrice + adsSpentRow + packagingSpent));

                    const saleDate = new Date(t.sale?.created_at || t.sale?.order_date || new Date());
                    const monthKey = format(saleDate, 'yyyy-MM');
                    monthProfitMap.set(monthKey, (monthProfitMap.get(monthKey) || 0) + profitLoss);
                });

            const saleRowIndexForReturns = new Map<string, number>();
            const totalReturn = (lotSales || [])
                .filter((t: any) => t.sale_id && t.lot)
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

            const cashInHand = (totalRevenue + totalInvestment) - (totalCOGS + totalExpenses + totalReturn);
            const netProfit = totalRevenue - totalCOGS - totalExpenses;
            const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

            setStats({
                totalRevenue,
                totalCOGS,
                grossProfit,
                totalExpenses,
                totalReturn,
                totalInvestment,
                totalStockValue,
                cashInHand,
                margin
            });

            const deliveredSales = new Map<string, number>();
            deliveredSalesMap.forEach((val, key) => deliveredSales.set(key, val.amount));

            // Group lot sales by sale_id for allocation
            const saleTotals = new Map<string, number>();
            (lotSales || []).forEach((t: any) => {
                if (t.type !== 'sale') return;
                if (!t.sale_id) return;
                const qty = Math.abs(Number(t.quantity_changed || 0));
                saleTotals.set(t.sale_id, (saleTotals.get(t.sale_id) || 0) + qty);
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

                const mInvestment = (incomeEntries || [])
                    .filter((i: any) => i.category === 'investment')
                    .filter((i: any) => {
                        const d = new Date(i.income_date);
                        return d >= mStart && d <= mEnd;
                    })
                    .reduce((sum, i) => sum + Number(i.amount), 0);

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
                    investment: mInvestment
                };
            });

            setMonthlyData(trendData);

            const last12Months = eachMonthOfInterval({
                start: subMonths(now, 11),
                end: now
            });

            const gpTrendData = last12Months.map(month => {
                const key = format(month, 'yyyy-MM');
                return {
                    name: format(month, 'MMM'),
                    grossProfit: monthProfitMap.get(key) || 0
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
            <div className="space-y-8 pb-12">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Financial Dashboard</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Revenue, Investment & Expenditure Analytics</p>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <FinanceStatCard
                        title="Total Revenue"
                        value={stats.totalRevenue}
                        trend="+12.5%"
                        color="emerald"
                    />
                    <FinanceStatCard
                        title="Cost of Goods"
                        value={stats.totalCOGS}
                        trend="+5.2%"
                        color="amber"
                        sub="Stock Purchase Cost"
                    />
                    <FinanceStatCard
                        title="Total Expenses"
                        value={stats.totalExpenses}
                        trend="+2.1%"
                        color="rose"
                    />
                    <FinanceStatCard
                        title="Total Return"
                        value={stats.totalReturn}
                        trend="Courier Return Cost"
                        color="rose"
                    />
                    <FinanceStatCard
                        title="Gross Profit"
                        value={stats.grossProfit}
                        trend="Revenue - COGS"
                        color="emerald"
                    />
                    <FinanceStatCard
                        title="Total Investment"
                        value={stats.totalInvestment}
                        trend={`${stats.margin.toFixed(1)}% Margin`}
                        color="blue"
                    />
                    <FinanceStatCard
                        title="Remaining Stock Value"
                        value={stats.totalStockValue}
                        trend="Inventory"
                        color="indigo"
                    />
                    <FinanceStatCard
                        title="Cash in Hand"
                        value={stats.cashInHand}
                        trend="Available"
                        color="emerald"
                        sub="Liquid Assets"
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

                    {/* Gross Profit Trend */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                        <div className="mb-8">
                            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Gross Profit Trend</h3>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Last 12 months (monthly)</p>
                        </div>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={grossProfitMonthlyData}>
                                    <defs>
                                        <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.12} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Area type="monotone" dataKey="grossProfit" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#profitGradient)" name="Gross Profit" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

            </div>
        </DashboardLayout>
    );
}

function FinanceStatCard({ title, value, trend, color, sub }: any) {
    const accents: any = {
        emerald: "bg-emerald-500",
        amber: "bg-amber-500",
        rose: "bg-rose-500",
        blue: "bg-blue-500",
        indigo: "bg-indigo-500"
    };

    return (
        <div className="group relative bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all hover:shadow-md hover:translate-y-[-2px]">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">{title}</p>
                    <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                        ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </h4>
                    <p className="text-[10px] text-gray-400 font-medium mt-1.5">
                        {sub || trend}
                    </p>
                </div>
                <div className={`h-10 w-10 ${accents[color] || 'bg-primary'} text-white rounded-lg flex items-center justify-center shadow-lg shadow-current/10 transition-transform group-hover:scale-110`}>
                    <DollarSign size={18} strokeWidth={1.5} />
                </div>
            </div>
        </div>
    );
}
