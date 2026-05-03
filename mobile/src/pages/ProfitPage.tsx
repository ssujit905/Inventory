import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';

type LotProfitRow = {
    lot_id: string;
    lot_number: string;
    sku: string;
    qty_sold: number;
    cost_total: number;
    revenue_allocated: number;
    return_allocated: number;
    ads_spent: number;
    packaging_spent: number;
    profit: number;
};

type SaleProfitRow = {
    sale_id: string;
    lot_number: string;
    sku: string;
    quantity: number;
    cost_price: number;
    cost_total: number;
    sold_amount: number;
    return_cost: number;
    ads_spent: number;
    packaging_spent: number;
    profit_loss: number;
};

export default function ProfitPage() {
    const { profile } = useAuthStore();
    const [lotProfitRows, setLotProfitRows] = useState<LotProfitRow[]>([]);
    const [saleProfitRows, setSaleProfitRows] = useState<SaleProfitRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProfitData();
    }, []);

    useRealtimeRefresh(
        () => fetchProfitData(false),
        {
            channelName: 'profit-updates-v2',
            tables: ['transactions', 'sales', 'product_lots', 'expenses'],
            pollMs: 12000
        }
    );

    const fetchProfitData = async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
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

            const deliveredSales = new Map<string, number>();
            (lotSales || []).forEach((t: any) => {
                if (t.sale?.parcel_status === 'delivered' && t.sale?.sold_amount) {
                    deliveredSales.set(t.sale.id, Number(t.sale.sold_amount));
                }
            });

            const saleTotals = new Map<string, number>();
            (lotSales || []).forEach((t: any) => {
                if (!t.sale_id) return;
                const qty = Math.abs(Number(t.quantity_changed || 0));
                saleTotals.set(t.sale_id, (saleTotals.get(t.sale_id) || 0) + qty);
            });

            const { data: adsData } = await supabase
                .from('expenses')
                .select('id, amount')
                .eq('category', 'ads');

            const { data: packagingData } = await supabase
                .from('expenses')
                .select('amount, description, created_at, expense_date')
                .eq('category', 'packaging')
                .order('created_at', { ascending: true });

            const adBudgetMap = new Map<string, number>();
            (adsData || []).forEach((a: any) => adBudgetMap.set(a.id, Number(a.amount || 0)));

            const toTimeKey = (value: any) => {
                if (!value) return '';
                if (typeof value === 'string') return value;
                if (value instanceof Date) {
                    return value.toISOString();
                }
                return '';
            };

            const extractPackagingQty = (description: string | null | undefined): number => {
                if (!description) return 0;
                const match = description.match(/qty\s*[:|]\s*(\d+)/i);
                return match ? Number(match[1] || 0) : 0;
            };

            const packagingHistory = (packagingData || [])
                .map((p: any) => ({
                    timeKey: toTimeKey(p.expense_date || p.created_at),
                    amount: Number(p.amount || 0),
                    unitCost: (() => {
                        const qty = extractPackagingQty(p.description);
                        if (qty > 0) return Number(p.amount || 0) / qty;
                        return 0; // If no qty, we can't determine unit cost reliably
                    })()
                }))
                .filter((p: any) => p.timeKey && p.unitCost > 0)
                .sort((a: any, b: any) => a.timeKey.localeCompare(b.timeKey));

            const adSaleIds = new Map<string, Set<string>>();
            (lotSales || []).forEach((t: any) => {
                const adId = t.sale?.ad_id;
                if (!adId || !t.sale_id) return;
                if (!adSaleIds.has(adId)) adSaleIds.set(adId, new Set());
                adSaleIds.get(adId)!.add(t.sale_id);
            });

            const adSpentBySale = new Map<string, number>();
            (lotSales || []).forEach((t: any) => {
                if (!t.sale_id) return;
                const adId = t.sale?.ad_id;
                if (!adId) {
                    adSpentBySale.set(t.sale_id, 0);
                    return;
                }
                const budget = adBudgetMap.get(adId) || 0;
                const count = adSaleIds.get(adId)?.size || 1;
                adSpentBySale.set(t.sale_id, budget / count);
            });

            const packagingBySale = new Map<string, number>();
            (lotSales || []).forEach((t: any) => {
                if (!t.sale_id || !t.sale) return;
                const saleTimeKey = toTimeKey(t.sale.created_at);
                if (!saleTimeKey) return;
                let selected = 0;
                for (const p of packagingHistory) {
                    if (p.timeKey <= saleTimeKey) {
                        selected = p.unitCost;
                    } else {
                        break;
                    }
                }
                packagingBySale.set(t.sale_id, selected);
            });

            const lotAgg = new Map<string, LotProfitRow>();
            (lotSales || []).forEach((t: any) => {
                if (!t.sale_id || !t.lot) return;

                const qty = Math.abs(Number(t.quantity_changed || 0));
                const totalQtyInSale = saleTotals.get(t.sale_id) || 0;
                if (totalQtyInSale <= 0) return;

                const lotId = t.lot?.id || 'unknown';
                const lotNumber = t.lot?.lot_number || 'N/A';
                const sku = t.lot?.products?.sku || 'SKU';
                const costPrice = Number(t.lot?.cost_price || 0);
                const isDelivered = t.sale?.parcel_status === 'delivered';
                const saleRevenue = isDelivered ? (deliveredSales.get(t.sale_id) || 0) : 0;
                const revenueAllocated = isDelivered ? (qty / totalQtyInSale) * saleRevenue : 0;
                const deliveredQty = isDelivered ? qty : 0;
                const costTotal = deliveredQty * costPrice;
                const isReturned = t.sale?.parcel_status === 'returned';
                const returnCost = isReturned ? Number(t.sale?.return_cost || 0) : 0;
                const returnAllocated = isReturned ? (qty / totalQtyInSale) * returnCost : 0;
                const adsSpentPerSale = adSpentBySale.get(t.sale_id) || 0;
                const adsAllocated = (qty / totalQtyInSale) * adsSpentPerSale;
                const isCancelled = t.sale?.parcel_status === 'cancelled';
                const packagingPerSale = isCancelled ? 0 : (packagingBySale.get(t.sale_id) || 0);
                const packagingAllocated = (qty / totalQtyInSale) * packagingPerSale;

                const existing = lotAgg.get(lotId);
                if (existing) {
                    existing.qty_sold += deliveredQty;
                    existing.cost_total += costTotal;
                    existing.revenue_allocated += revenueAllocated;
                    existing.return_allocated += returnAllocated;
                    existing.ads_spent += adsAllocated;
                    existing.packaging_spent += packagingAllocated;
                    existing.profit += (revenueAllocated - (costTotal + adsAllocated + packagingAllocated + returnAllocated));
                } else {
                    lotAgg.set(lotId, {
                        lot_id: lotId,
                        lot_number: lotNumber,
                        sku,
                        qty_sold: deliveredQty,
                        cost_total: costTotal,
                        revenue_allocated: revenueAllocated,
                        return_allocated: returnAllocated,
                        ads_spent: adsAllocated,
                        packaging_spent: packagingAllocated,
                        profit: revenueAllocated - (costTotal + adsAllocated + packagingAllocated + returnAllocated)
                    });
                }
            });

            setLotProfitRows(
                Array.from(lotAgg.values()).sort((a, b) => b.profit - a.profit)
            );

            const saleRowIndex = new Map<string, number>();

            const saleRows: SaleProfitRow[] = (lotSales || [])
                .filter((t: any) => t.sale_id && t.lot)
                .map((t: any) => {
                    const qty = Math.abs(Number(t.quantity_changed || 0));
                    const costPrice = Number(t.lot?.cost_price || 0);
                    const totalQtyInSale = saleTotals.get(t.sale_id) || 1; // Prevent division by zero
                    
                    const adId = t.sale?.ad_id;
                    const budget = adId ? (adBudgetMap.get(adId) || 0) : 0;
                    const count = adId ? (adSaleIds.get(adId)?.size || 1) : 1;
                    const totalAdsSpentForSale = adId ? budget / count : 0;
                    const adsSpentRow = (qty / totalQtyInSale) * totalAdsSpentForSale;
                    
                    const totalPackagingForSale = packagingBySale.get(t.sale_id) || 0;
                    const packagingSpent = (qty / totalQtyInSale) * totalPackagingForSale;
                    
                    const status = t.sale?.parcel_status;
                    const saleDate = new Date(t.sale?.created_at || 0);
                    
                    const totalSoldAmount = status === 'delivered' ? Number(t.sale?.sold_amount || 0) : 0;
                    const soldAmount = (qty / totalQtyInSale) * totalSoldAmount;
                    
                    const totalReturnCost = status === 'returned' ? Number(t.sale?.return_cost || 0) : 0;
                    const returnCost = (qty / totalQtyInSale) * totalReturnCost;
                    
                    let profitLoss = 0;
                    if (status === 'returned') {
                        const totalLoss = returnCost + adsSpentRow + packagingSpent;
                        profitLoss = totalLoss === 0 ? 0 : -totalLoss;
                    } else if (status === 'cancelled') {
                        profitLoss = adsSpentRow === 0 ? 0 : -adsSpentRow;
                    } else {
                        profitLoss = soldAmount - (qty * costPrice + adsSpentRow + packagingSpent);
                    }
                    return {
                        sale_id: t.sale_id,
                        lot_number: t.lot?.lot_number || 'N/A',
                        sku: t.lot?.products?.sku || 'SKU',
                        quantity: qty,
                        cost_price: costPrice,
                        cost_total: qty * costPrice,
                        sold_amount: soldAmount,
                        return_cost: returnCost,
                        ads_spent: adsSpentRow,
                        packaging_spent: packagingSpent,
                        profit_loss: profitLoss
                    } as SaleProfitRow & { _saleDate?: Date };
                })
                .sort((a: any, b: any) => {
                    const aTime = a._saleDate ? a._saleDate.getTime() : 0;
                    const bTime = b._saleDate ? b._saleDate.getTime() : 0;
                    return bTime - aTime;
                })
                .map(({ _saleDate, ...row }) => row);

            setSaleProfitRows(saleRows);
        } catch (error) {
            console.error('Error fetching profit data:', error);
        } finally {
            if (showLoader) setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">
                
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Profit & Loss Analysis</h1>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Financial Performance Metrics</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Calculating margins...</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Summary Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Profit</p>
                                <p className={`text-lg font-black ${lotProfitRows.reduce((acc, r) => acc + r.profit, 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    Rs. {lotProfitRows.reduce((acc, r) => acc + r.profit, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Revenue</p>
                                <p className="text-lg font-black text-gray-900 dark:text-gray-100">
                                    Rs. {lotProfitRows.reduce((acc, r) => acc + r.revenue_allocated, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                            <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Delivered Qty</p>
                                <p className="text-lg font-black text-primary">
                                    {lotProfitRows.reduce((acc, r) => acc + r.qty_sold, 0)} <span className="text-[10px] opacity-40">units</span>
                                </p>
                            </div>
                            <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Ads</p>
                                <p className="text-lg font-black text-blue-600">
                                    Rs. {lotProfitRows.reduce((acc, r) => acc + r.ads_spent, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </p>
                            </div>
                        </div>
                        {/* Lot-wise Profit */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-1">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Lot-wise Performance</h3>
                                <span className="ml-auto text-[10px] font-bold text-gray-300">Delivered sales only</span>
                            </div>

                            {lotProfitRows.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-300">No delivered sales data</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {lotProfitRows.map((row) => (
                                        <div key={row.lot_id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden active:scale-[0.99] transition-all">
                                            <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800 flex justify-between items-center bg-gray-50/30 dark:bg-gray-800/20">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-black text-gray-900 dark:text-gray-100">{row.sku}</span>
                                                    <span className="text-[10px] font-bold text-gray-400">#{row.lot_number}</span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[11px] font-black text-gray-900 dark:text-gray-100">
                                                        {row.qty_sold} <span className="text-[9px] text-gray-400">sold</span>
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="p-4 grid grid-cols-3 gap-4">
                                                <div className="space-y-0.5">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Revenue</p>
                                                    <p className="text-xs font-black text-gray-900 dark:text-gray-100">Rs. {row.revenue_allocated.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                                </div>
                                                <div className="space-y-0.5">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Returns</p>
                                                    <p className="text-xs font-black text-rose-600">Rs. {row.return_allocated.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                                </div>
                                                <div className="space-y-0.5 text-right">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Ads/Pack</p>
                                                    <p className="text-xs font-black text-blue-600">Rs. {(row.ads_spent + row.packaging_spent).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                                </div>
                                            </div>

                                            <div className="px-4 py-2.5 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-50 dark:border-gray-800 flex justify-between items-center">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Net Profit</span>
                                                <span className={`text-sm font-black ${row.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    Rs. {row.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sale-wise Rows */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 px-1">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Sale-wise Cost Allocation</h3>
                                <span className="ml-auto text-[10px] font-bold text-gray-300">All transactions</span>
                            </div>

                            {saleProfitRows.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                                    <p className="text-xs font-bold uppercase tracking-widest text-gray-300">No sale transactions</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {saleProfitRows.map((row, idx) => (
                                        <div key={`${row.sale_id}-${idx}`} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden active:scale-[0.99] transition-all">
                                            <div className="px-4 py-3 border-b border-gray-50 dark:border-gray-800 flex justify-between items-center bg-gray-50/30 dark:bg-gray-800/20">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] font-black text-gray-400">{row.sale_id.slice(0, 8)}</span>
                                                    <span className="text-[11px] font-black text-gray-900 dark:text-gray-100">{row.sku}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-500">
                                                    Qty: {row.quantity}
                                                </span>
                                            </div>

                                            <div className="p-4 grid grid-cols-2 gap-y-4 gap-x-6">
                                                <div className="space-y-0.5">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Cost Impact</p>
                                                    <p className="text-xs font-black text-gray-900 dark:text-gray-100">Rs. {row.cost_total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                                </div>
                                                <div className="space-y-0.5 text-right">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Ads/Pack</p>
                                                    <p className="text-xs font-black text-blue-600">Rs. {(row.ads_spent + row.packaging_spent).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                                </div>
                                                <div className="space-y-0.5">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Revenue Impact</p>
                                                    <p className="text-xs font-black text-emerald-600">Rs. {row.sold_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                                </div>
                                                <div className="space-y-0.5 text-right">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Return Impact</p>
                                                    <p className="text-xs font-black text-rose-600">Rs. {row.return_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                                </div>
                                            </div>

                                            <div className="px-4 py-2.5 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-50 dark:border-gray-800 flex justify-between items-center">
                                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Profit/Loss</span>
                                                <span className={`text-sm font-black ${row.profit_loss >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    Rs. {row.profit_loss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </span>
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
