import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { getVendorId, isVendorMember } from '../lib/vendorHelpers';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { IndianRupee, TrendingUp, Package, Wallet, ArrowUpRight, BarChart3, Calendar, ChevronDown } from 'lucide-react';

type FinanceStats = {
    totalRevenue: number;
    totalCOGS: number;
    grossProfit: number;
    totalExpenses: number;
    totalReturn: number;
    totalInvestment: number;
    totalOperations: number;
    totalStockValue: number;
    ebita: number;
    totalVAT: number;
    totalLoanInterest: number;
    netProfit: number;
    cashInHand: number;
    margin: number;
    ebitaMargin: number;
};

interface RawFinanceData {
    incomeEntries: any[];
    saleTransactions: any[];
    expensesData: any[];
    lotSales: any[];
    lotsData: any[];
}

export default function ReportsPage() {
    const { profile } = useAuthStore();
    const currentYearStr = new Date().getFullYear().toString();
    const [selectedYear, setSelectedYear] = useState<string>(currentYearStr);
    const [availableYears, setAvailableYears] = useState<string[]>([currentYearStr]);
    const [rawData, setRawData] = useState<RawFinanceData | null>(null);

    const [stats, setStats] = useState<FinanceStats>({
        totalRevenue: 0,
        totalCOGS: 0,
        grossProfit: 0,
        totalExpenses: 0,
        totalReturn: 0,
        totalInvestment: 0,
        totalOperations: 0,
        totalStockValue: 0,
        ebita: 0,
        totalVAT: 0,
        totalLoanInterest: 0,
        netProfit: 0,
        cashInHand: 0,
        margin: 0,
        ebitaMargin: 0
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
            const vendorId = getVendorId(profile);
            const profileId = profile?.id;

            let incomeQuery = supabase.from('income_entries').select('amount, income_date, category, profile:profiles(role)');
            let transInQuery = supabase.from('transactions').select(`
                quantity_changed,
                created_at,
                lot:product_lots!inner(cost_price, received_date, products!inner(vendor_id))
            `).eq('type', 'in');
            let expensesQuery = supabase.from('expenses').select('id, amount, description, expense_date, category, created_at, profile:profiles!expenses_recorded_by_fkey(role)');
            let lotSalesQuery = supabase.from('transactions').select(`
                id,
                sale_id,
                quantity_changed,
                lot:product_lots!inner(
                    id,
                    lot_number,
                    cost_price,
                    products!inner(sku, vendor_id)
                ),
                sale:sales(id, sold_amount, return_cost, parcel_status, ad_id, order_date, created_at)
            `).eq('type', 'sale');
            let lotsQuery = supabase.from('product_lots').select(`
                id,
                cost_price,
                products!inner(vendor_id),
                transactions (
                    type,
                    quantity_changed,
                    sales (parcel_status)
                )
            `);

            if (vendorId) {
                const { data: members } = await supabase
                    .from('profiles')
                    .select('id')
                    .or(`id.eq.${vendorId},vendor_id.eq.${vendorId}`);
                const memberIds = (members || []).map((m: any) => m.id);
                if (memberIds.length > 0) {
                    incomeQuery = incomeQuery.in('recorded_by', memberIds);
                } else {
                    incomeQuery = incomeQuery.eq('recorded_by', profileId);
                }
                transInQuery = transInQuery.eq('lot.products.vendor_id', vendorId);
                expensesQuery = expensesQuery.or(`recorded_by.eq.${profileId},vendor_id.eq.${vendorId}`);
                lotSalesQuery = lotSalesQuery.eq('lot.products.vendor_id', vendorId);
                lotsQuery = lotsQuery.eq('products.vendor_id', vendorId);
            } else {
                transInQuery = transInQuery.is('lot.products.vendor_id', null);
                lotSalesQuery = lotSalesQuery.is('lot.products.vendor_id', null);
                lotsQuery = lotsQuery.is('products.vendor_id', null);
            }

            const [incomeRes, transRes, expensesRes, lotSalesRes, lotsRes] = await Promise.all([
                incomeQuery,
                transInQuery,
                expensesQuery,
                lotSalesQuery,
                lotsQuery
            ]);

            if (incomeRes.error) throw incomeRes.error;
            if (transRes.error) throw transRes.error;
            if (expensesRes.error) throw expensesRes.error;
            if (lotSalesRes.error) throw lotSalesRes.error;
            if (lotsRes.error) throw lotsRes.error;

            let incomeEntries = incomeRes.data;
            let expensesData = expensesRes.data;
            if (!vendorId) {
                incomeEntries = (incomeRes.data || []).filter((i: any) => (i.profile?.role ?? null) !== 'vendor');
                expensesData = (expensesRes.data || []).filter((e: any) => (e.profile?.role ?? null) !== 'vendor');
            }
            const saleTransactions = transRes.data;
            const lotSales = lotSalesRes.data;
            const lotsData = lotsRes.data;

            // Extract all years present across data
            const yearSet = new Set<number>();
            yearSet.add(new Date().getFullYear());

            (lotSales || []).forEach((t: any) => {
                const d = t.sale?.order_date || t.sale?.created_at;
                if (d) {
                    const yr = new Date(d).getFullYear();
                    if (!isNaN(yr) && yr > 2000 && yr < 2100) yearSet.add(yr);
                }
            });
            (expensesData || []).forEach((e: any) => {
                const d = e.expense_date || e.created_at;
                if (d) {
                    const yr = new Date(d).getFullYear();
                    if (!isNaN(yr) && yr > 2000 && yr < 2100) yearSet.add(yr);
                }
            });
            (incomeEntries || []).forEach((i: any) => {
                const d = i.income_date;
                if (d) {
                    const yr = new Date(d).getFullYear();
                    if (!isNaN(yr) && yr > 2000 && yr < 2100) yearSet.add(yr);
                }
            });
            (saleTransactions || []).forEach((t: any) => {
                const d = t.created_at || t.lot?.received_date;
                if (d) {
                    const yr = new Date(d).getFullYear();
                    if (!isNaN(yr) && yr > 2000 && yr < 2100) yearSet.add(yr);
                }
            });

            const sortedYears = Array.from(yearSet).sort((a, b) => b - a).map(String);
            setAvailableYears(sortedYears);

            const fetchedData: RawFinanceData = {
                incomeEntries: incomeEntries || [],
                saleTransactions: saleTransactions || [],
                expensesData: expensesData || [],
                lotSales: lotSales || [],
                lotsData: lotsData || []
            };

            setRawData(fetchedData);
            computeFinancials(fetchedData, selectedYear);
        } catch (error: any) {
            console.error('Error fetching finance data:', error.message);
        } finally {
            if (showLoader) setLoading(false);
        }
    };

    const handleYearChange = (year: string) => {
        setSelectedYear(year);
        if (rawData) {
            computeFinancials(rawData, year);
        }
    };

    const computeFinancials = (data: RawFinanceData, year: string) => {
        const { incomeEntries, saleTransactions, expensesData, lotSales, lotsData } = data;
        const isAll = year === 'all';
        const targetYear = isAll ? null : parseInt(year, 10);

        const isInPeriod = (dateVal: any) => {
            if (!targetYear) return true;
            if (!dateVal) return false;
            const d = new Date(dateVal);
            return !isNaN(d.getTime()) && d.getFullYear() === targetYear;
        };

        // 1. Calculate Revenue from Delivered Sales in period
        const deliveredSalesMap = new Map<string, { amount: number, date: string }>();
        (lotSales || []).forEach((t: any) => {
            if (t.sale?.parcel_status === 'delivered' && t.sale?.sold_amount) {
                const saleDate = t.sale.order_date || t.sale.created_at;
                if (isInPeriod(saleDate)) {
                    deliveredSalesMap.set(t.sale.id, {
                        amount: Number(t.sale.sold_amount),
                        date: saleDate
                    });
                }
            }
        });

        const salesRevenue = Array.from(deliveredSalesMap.values()).reduce((sum, s) => sum + s.amount, 0);
        const totalRevenue = salesRevenue;

        // 2. COGS = total cost of ALL stock purchased from suppliers in period
        const totalCOGS = (saleTransactions || [])
            .filter((t: any) => isInPeriod(t.created_at || t.lot?.received_date))
            .reduce((sum: number, t: any) => sum + (Math.abs(t.quantity_changed) * Number(t.lot?.cost_price || 0)), 0);

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

        // 3. Gross Profit from sales in period
        const lotSalesInPeriod = (lotSales || []).filter((t: any) => isInPeriod(t.sale?.order_date || t.sale?.created_at));

        const saleRowIndex = new Map<string, number>();
        const grossProfitFromSales = lotSalesInPeriod
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
                    const totalLoss = returnCost + adsSpentRow + packagingSpent;
                    profitLoss = totalLoss === 0 ? 0 : -totalLoss;
                } else if (status === 'cancelled') {
                    profitLoss = adsSpentRow === 0 ? 0 : -adsSpentRow;
                } else {
                    profitLoss = soldAmount - (qty * costPrice + adsSpentRow + packagingSpent);
                }
                return sum + profitLoss;
            }, 0);

        const expensesInPeriod = (expensesData || []).filter((e: any) => isInPeriod(e.expense_date || e.created_at));
        const otherExpensesTotal = expensesInPeriod
            .filter((e: any) => e.category === 'other')
            .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

        const grossProfit = grossProfitFromSales - otherExpensesTotal;

        // 4. Returns in period
        const saleRowIndexForReturns = new Map<string, number>();
        const totalReturn = lotSalesInPeriod
            .filter((t: any) => t.sale_id && t.lot)
            .reduce((sum: number, t: any) => {
                const rowIndex = saleRowIndexForReturns.get(t.sale_id) || 0;
                saleRowIndexForReturns.set(t.sale_id, rowIndex + 1);
                const isFirstRow = rowIndex === 0;
                const isReturned = t.sale?.parcel_status === 'returned';
                const returnCost = (isFirstRow && isReturned) ? Number(t.sale?.return_cost || 0) : 0;
                return sum + returnCost;
            }, 0);

        const totalExpenses = expensesInPeriod.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

        const incomeInPeriod = (incomeEntries || []).filter((i: any) => isInPeriod(i.income_date));
        const totalInvestment = incomeInPeriod
            .filter((i: any) => i.category === 'investment')
            .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

        const totalOperations = incomeInPeriod
            .filter((i: any) => i.category === 'operation')
            .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

        const totalVAT = incomeInPeriod
            .filter((i: any) => i.category === 'vat')
            .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

        const totalLoanInterest = incomeInPeriod
            .filter((i: any) => i.category === 'loan_interest')
            .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

        // Balance Sheet Inventory Valuation (current stock)
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

        const ebita = grossProfit - totalOperations;
        const ebitaMargin = totalRevenue > 0 ? (ebita / totalRevenue) * 100 : 0;

        const netProfit = ebita - totalVAT - totalLoanInterest;
        const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        const cashInHand = (totalRevenue + totalInvestment) - (totalCOGS + totalExpenses + totalReturn + totalOperations + totalVAT + totalLoanInterest);

        setStats({
            totalRevenue,
            totalCOGS,
            grossProfit,
            totalExpenses,
            totalReturn,
            totalInvestment,
            totalOperations,
            totalStockValue,
            ebita,
            totalVAT,
            totalLoanInterest,
            netProfit,
            cashInHand,
            margin,
            ebitaMargin
        });

        // 5. Monthly Trend Charts
        const now = new Date();
        let monthsToPlot: Date[] = [];
        if (targetYear) {
            monthsToPlot = Array.from({ length: 12 }, (_, m) => new Date(targetYear, m, 1));
        } else {
            const earliestCandidates: Date[] = [];
            (lotSales || []).forEach((t: any) => {
                const d = t.sale?.order_date || t.sale?.created_at;
                if (d) {
                    const dt = new Date(d);
                    if (!isNaN(dt.getTime())) earliestCandidates.push(startOfMonth(dt));
                }
            });
            (incomeEntries || []).forEach((i: any) => {
                const dt = new Date(i.income_date);
                if (!isNaN(dt.getTime())) earliestCandidates.push(startOfMonth(dt));
            });
            (expensesData || []).forEach((e: any) => {
                const dt = new Date(e.expense_date || e.created_at);
                if (!isNaN(dt.getTime())) earliestCandidates.push(startOfMonth(dt));
            });
            const earliestMonth = earliestCandidates.length > 0
                ? earliestCandidates.reduce((a, b) => (a < b ? a : b))
                : startOfMonth(subMonths(now, 11));
            const rangeStart = earliestMonth > now ? startOfMonth(subMonths(now, 11)) : earliestMonth;
            monthsToPlot = eachMonthOfInterval({ start: rangeStart, end: now });
        }

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
                
                let profitLoss = 0;
                if (status === 'returned') {
                    const totalLoss = returnCost + adsSpentRow + packagingSpent;
                    profitLoss = totalLoss === 0 ? 0 : -totalLoss;
                } else if (status === 'cancelled') {
                    profitLoss = adsSpentRow === 0 ? 0 : -adsSpentRow;
                } else {
                    profitLoss = soldAmount - (qty * costPrice + adsSpentRow + packagingSpent);
                }

                // Use order_date (same as KPI card filtering) for consistent month bucketing
                const saleDate = new Date(t.sale?.order_date || t.sale?.created_at || new Date());
                const monthKey = format(saleDate, 'yyyy-MM');
                monthProfitMap.set(monthKey, (monthProfitMap.get(monthKey) || 0) + profitLoss);
            });

        const monthOpsMap = new Map<string, number>();
        const monthVatMap = new Map<string, number>();
        const monthInterestMap = new Map<string, number>();
        (incomeEntries || []).forEach((i: any) => {
            const date = new Date(i.income_date);
            const key = format(date, 'yyyy-MM');
            if (i.category === 'operation') {
                monthOpsMap.set(key, (monthOpsMap.get(key) || 0) + Number(i.amount || 0));
            } else if (i.category === 'vat') {
                monthVatMap.set(key, (monthVatMap.get(key) || 0) + Number(i.amount || 0));
            } else if (i.category === 'loan_interest') {
                monthInterestMap.set(key, (monthInterestMap.get(key) || 0) + Number(i.amount || 0));
            }
        });

        const allDeliveredSales = new Map<string, { amount: number, date: string }>();
        (lotSales || []).forEach((t: any) => {
            if (t.sale?.parcel_status === 'delivered' && t.sale?.sold_amount) {
                allDeliveredSales.set(t.sale.id, {
                    amount: Number(t.sale.sold_amount),
                    date: t.sale.order_date || t.sale.created_at
                });
            }
        });

        const trendData = monthsToPlot.map(month => {
            const mStart = startOfMonth(month);
            const mEnd = endOfMonth(month);
            const mLabel = targetYear ? format(month, 'MMM') : format(month, 'MMM yy');

            const mRevenue = Array.from(allDeliveredSales.values())
                .filter(s => {
                    const d = new Date(s.date);
                    return d >= mStart && d <= mEnd;
                })
                .reduce((sum, s) => sum + s.amount, 0);

            const mExpenses = (expensesData || [])
                .filter(e => {
                    const d = new Date(e.expense_date || e.created_at);
                    return d >= mStart && d <= mEnd;
                })
                .reduce((sum, e) => sum + Number(e.amount || 0), 0);

            return {
                name: mLabel,
                revenue: mRevenue,
                expenses: mExpenses
            };
        });

        setMonthlyData(trendData);

        // Per-month other-expenses map (to match card's grossProfit = grossFromSales - otherExpenses)
        const monthOtherExpensesMap = new Map<string, number>();
        (expensesData || [])
            .filter((e: any) => e.category === 'other')
            .forEach((e: any) => {
                const d = new Date(e.expense_date || e.created_at);
                if (!isNaN(d.getTime())) {
                    const key = format(d, 'yyyy-MM');
                    monthOtherExpensesMap.set(key, (monthOtherExpensesMap.get(key) || 0) + Number(e.amount || 0));
                }
            });

        const gpTrendData = monthsToPlot.map(month => {
            const key = format(month, 'yyyy-MM');
            const gpRaw = monthProfitMap.get(key) || 0;
            const otherExp = monthOtherExpensesMap.get(key) || 0;
            const gp = gpRaw - otherExp;  // matches card: grossProfit = grossFromSales - otherExpenses
            const ops = monthOpsMap.get(key) || 0;
            const vat = monthVatMap.get(key) || 0;
            const interest = monthInterestMap.get(key) || 0;
            const mEbita = gp - ops;
            const mNet = mEbita - vat - interest;
            return {
                name: targetYear ? format(month, 'MMM') : format(month, 'MMM yy'),
                grossProfit: gp,
                ebita: mEbita,
                netProfit: mNet,
                operations: ops
            };
        });

        setGrossProfitMonthlyData(gpTrendData);
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
                <div className="flex items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                        <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">Financial Overview</h1>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Growth & Expenditure Analytics</p>
                    </div>

                    {/* Period / Year Dropdown Selector */}
                    <div className="relative inline-flex items-center flex-shrink-0">
                        <div className="absolute left-3 pointer-events-none text-gray-400">
                            <Calendar size={14} />
                        </div>
                        <select
                            value={selectedYear}
                            onChange={(e) => handleYearChange(e.target.value)}
                            aria-label="Filter financial reports by period"
                            className="appearance-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-xs font-black pl-8 pr-8 py-2 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm hover:border-gray-300 dark:hover:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                        >
                            {availableYears.map(yr => (
                                <option key={yr} value={yr} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-bold py-1">
                                    {yr === currentYearStr ? `${yr} (Current Year)` : yr}
                                </option>
                            ))}
                            <option value="all" className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-bold py-1">
                                All Time
                            </option>
                        </select>
                        <div className="absolute right-2.5 pointer-events-none text-gray-400">
                            <ChevronDown size={13} />
                        </div>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <FinanceStatCard
                        title="Revenue"
                        value={stats.totalRevenue}
                        trend="Delivered Sales"
                        color="emerald"
                        icon={<TrendingUp size={14} />}
                    />
                    <FinanceStatCard
                        title="COGS"
                        value={stats.totalCOGS}
                        trend="All Stock Purchased"
                        sub="From Suppliers"
                        color="amber"
                        icon={<Package size={14} />}
                    />
                    <FinanceStatCard
                        title="Expenses"
                        value={stats.totalExpenses}
                        trend="Ads, Packaging & Other"
                        color="rose"
                        icon={<Wallet size={14} />}
                    />
                    <FinanceStatCard
                        title="Returns"
                        value={stats.totalReturn}
                        trend="Logistics Cost"
                        color="rose"
                        icon={<Package size={14} />}
                    />
                    <FinanceStatCard
                        title="Operations"
                        value={stats.totalOperations}
                        trend="Operational"
                        color="amber"
                        icon={<Wallet size={14} />}
                    />
                    <FinanceStatCard
                        title="Gross Profit"
                        value={stats.grossProfit}
                        trend="Before Ops"
                        color="emerald"
                        icon={<ArrowUpRight size={14} />}
                    />
                    <FinanceStatCard
                        title="EBITA"
                        value={stats.ebita}
                        trend={`${stats.ebitaMargin.toFixed(1)}% of Revenue`}
                        sub="Operating Profit · After Ops"
                        color="purple"
                        icon={<BarChart3 size={14} />}
                    />
                    <FinanceStatCard
                        title="VAT"
                        value={stats.totalVAT}
                        trend="Tax Recorded"
                        sub="Income Ledger"
                        color="rose"
                        icon={<IndianRupee size={14} />}
                    />
                    <FinanceStatCard
                        title="Loan Interest"
                        value={stats.totalLoanInterest}
                        trend="Interest Recorded"
                        sub="Income Ledger"
                        color="amber"
                        icon={<IndianRupee size={14} />}
                    />
                    <FinanceStatCard
                        title="Net Profit"
                        value={stats.netProfit}
                        trend={`${stats.margin.toFixed(1)}% Margin`}
                        sub="After Tax & Interest"
                        color="emerald"
                        icon={<BarChart3 size={14} />}
                    />
                    <FinanceStatCard
                        title="Investment"
                        value={stats.totalInvestment}
                        trend="Capital Injected"
                        color="blue"
                        icon={<IndianRupee size={14} />}
                    />
                    <FinanceStatCard
                        title="Inventory"
                        value={stats.totalStockValue}
                        trend="Stock Value"
                        color="indigo"
                        icon={<Package size={14} />}
                    />
                    <FinanceStatCard
                        title="Cash flow"
                        value={stats.cashInHand}
                        trend="Available"
                        sub="Liquid Assets"
                        color="emerald"
                        icon={<Wallet size={14} />}
                    />
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
                        <div className="overflow-x-auto pb-2">
                            <div style={{ width: '100%', minWidth: `${Math.max(monthlyData.length * 56, 320)}px`, height: 240 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthlyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.2} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} dy={10} />
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
                    </div>

                    {/* Gross Profit Trend */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="mb-6 flex flex-col gap-2">
                            <h3 className="text-base font-black text-gray-900 dark:text-gray-100 tracking-tight">Profit Trends</h3>
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Gross Profit</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-purple-600 shadow-sm" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">EBITA</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 shadow-sm" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Net Profit</span>
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto pb-2">
                            <div style={{ width: '100%', minWidth: `${Math.max(grossProfitMonthlyData.length * 56, 320)}px`, height: 240 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={grossProfitMonthlyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.2} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                                    />
                                    <Bar dataKey="grossProfit" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} name="Gross Profit" />
                                    <Bar dataKey="ebita" fill="#9333ea" radius={[4, 4, 0, 0]} barSize={10} name="EBITA" />
                                    <Bar dataKey="netProfit" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={10} name="Net Profit" />
                                </BarChart>
                            </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Operational Expenses Trend */}
                    <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="mb-6 flex flex-col gap-2">
                            <h3 className="text-base font-black text-gray-900 dark:text-gray-100 tracking-tight">Operational Cost Trend</h3>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-sm" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Op Cost</span>
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto pb-2">
                            <div style={{ width: '100%', minWidth: `${Math.max(grossProfitMonthlyData.length * 56, 320)}px`, height: 240 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={grossProfitMonthlyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.2} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#94A3B8' }} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px' }}
                                    />
                                    <Bar dataKey="operations" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={12} name="Op Cost" />
                                </BarChart>
                            </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

function FinanceStatCard({ title, value, color, icon, trend, sub }: any) {
    const accents: any = {
        emerald: "bg-emerald-500",
        amber: "bg-amber-500",
        rose: "bg-rose-500",
        blue: "bg-blue-500",
        indigo: "bg-indigo-500",
        purple: "bg-purple-600"
    };

    return (
        <div className="group relative bg-white dark:bg-gray-900 p-3.5 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-all active:scale-[0.98] flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 truncate">{title}</p>
                    <h4 className={`text-sm sm:text-base font-black tracking-tight truncate ${value < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        Rs. {Math.round(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </h4>
                </div>
                <div className={`h-8 w-8 flex-shrink-0 ${accents[color] || 'bg-primary'} text-white rounded-lg flex items-center justify-center shadow-lg shadow-current/10 group-hover:scale-110 transition-transform`}>
                    {icon || <IndianRupee size={14} />}
                </div>
            </div>
            {(trend || sub) && (
                <div className="pt-2 mt-2 border-t border-gray-100/80 dark:border-gray-800/60 space-y-0.5">
                    {trend && (
                        <p className="text-[9px] text-gray-700 dark:text-gray-300 font-black uppercase tracking-wider truncate">
                            {trend}
                        </p>
                    )}
                    {sub && (
                        <p className="text-[8px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider truncate">
                            {sub}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
