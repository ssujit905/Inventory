import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';

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

        const channel = supabase
            .channel('profit-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchProfitData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchProfitData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_lots' }, () => fetchProfitData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchProfitData())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchProfitData = async () => {
        setLoading(true);
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
                .select('amount, created_at')
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

            const packagingHistory = (packagingData || [])
                .map((p: any) => ({
                    timeKey: toTimeKey(p.created_at),
                    amount: Number(p.amount || 0)
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
                        selected = p.amount;
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
                const packagingPerSale = packagingBySale.get(t.sale_id) || 0;
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
                    const adId = t.sale?.ad_id;
                    const budget = adId ? (adBudgetMap.get(adId) || 0) : 0;
                    const count = adId ? (adSaleIds.get(adId)?.size || 1) : 1;
                    const adsSpent = adId ? budget / count : 0;
                    const currentIndex = saleRowIndex.get(t.sale_id) || 0;
                    saleRowIndex.set(t.sale_id, currentIndex + 1);
                    const isFirstRow = currentIndex === 0;
                    const adsSpentRow = isFirstRow ? adsSpent : 0;
                    const packagingForSale = packagingBySale.get(t.sale_id) || 0;
                    const packagingSpent = isFirstRow ? packagingForSale : 0;
                    const status = t.sale?.parcel_status;
                    const saleDate = new Date(t.sale?.created_at || 0);
                    const soldAmount = (isFirstRow && status === 'delivered') ? Number(t.sale?.sold_amount || 0) : 0;
                    const returnCost = (isFirstRow && status === 'returned') ? Number(t.sale?.return_cost || 0) : 0;
                    const profitLoss = status === 'returned'
                        ? -(returnCost + adsSpentRow + packagingSpent)
                        : (soldAmount - (qty * costPrice + adsSpentRow + packagingSpent));
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
            setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="space-y-8 pb-12">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Profit</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Lot-wise and Sale-wise Profit</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-48 items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <>
                        {/* Lot-wise Profit */}
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Lot-wise Profit</h3>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Delivered sales only</p>
                                </div>
                            </div>

                            {lotProfitRows.length === 0 ? (
                                <div className="py-12 text-center text-sm text-gray-400 font-bold uppercase tracking-widest">
                                    No delivered sales with sold amount yet
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[900px]">
                                        <thead>
                                            <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800">
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em]">SKU</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em]">Lot</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Qty Sold</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Cost</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Revenue</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Returned</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Ads</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Packaging</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Profit / Loss</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                            {lotProfitRows.map((row) => (
                                                <tr key={row.lot_id}>
                                                    <td className="p-4 text-sm font-black text-gray-900 dark:text-gray-100">{row.sku}</td>
                                                    <td className="p-4 text-sm font-bold text-gray-600 dark:text-gray-300">#{row.lot_number}</td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">{row.qty_sold}</td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.cost_total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.revenue_allocated.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.return_allocated.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.ads_spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.packaging_spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className={`p-4 text-sm font-black text-right ${row.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        ${row.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Sale-wise Rows */}
                        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 font-outfit">Sale-wise Cost Rows</h3>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Lot, SKU, Qty, Cost, Sold/Return</p>
                                </div>
                            </div>

                            {saleProfitRows.length === 0 ? (
                                <div className="py-12 text-center text-sm text-gray-400 font-bold uppercase tracking-widest">
                                    No sale transactions yet
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[1100px]">
                                        <thead>
                                            <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800">
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em]">Sale ID</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em]">SKU</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em]">Lot</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Qty</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Cost Price</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Cost Total</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Sold Amount</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Return Cost</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Ads Spent</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Packaging</th>
                                                <th className="p-4 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-right">Profit / Loss</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                            {saleProfitRows.map((row, idx) => (
                                                <tr key={`${row.sale_id}-${idx}`}>
                                                    <td className="p-4 text-xs font-bold text-gray-600 dark:text-gray-300">{row.sale_id.slice(0, 8)}...</td>
                                                    <td className="p-4 text-sm font-black text-gray-900 dark:text-gray-100">{row.sku}</td>
                                                    <td className="p-4 text-sm font-bold text-gray-600 dark:text-gray-300">#{row.lot_number}</td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">{row.quantity}</td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.cost_price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.cost_total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.sold_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.return_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.ads_spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-4 text-sm font-black text-gray-700 dark:text-gray-300 text-right">
                                                        ${row.packaging_spent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className={`p-4 text-sm font-black text-right ${row.profit_loss >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        ${row.profit_loss.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
