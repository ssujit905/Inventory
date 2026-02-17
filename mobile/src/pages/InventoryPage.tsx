import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useSearchStore } from '../hooks/useSearchStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { Package, AlertTriangle, RotateCcw } from 'lucide-react';

type InventoryLot = {
    id: string;
    lot_number: string;
    sku: string;
    product_name: string;
    stock_in: number;
    sold: number;
    returned: number;
    remaining: number;
    status: 'Healthy' | 'Low Stock' | 'Out of Stock';
};

export default function InventoryPage() {
    const { profile } = useAuthStore();
    const { query } = useSearchStore();
    const [inventory, setInventory] = useState<InventoryLot[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchInventory();
    }, []);

    useRealtimeRefresh(
        () => fetchInventory(false),
        {
            channelName: 'inventory-updates-v2',
            tables: ['sales', 'product_lots', 'transactions'],
            pollMs: 10000
        }
    );

    const fetchInventory = async (isInitial = true) => {
        if (isInitial) setLoading(true);
        try {
            const { data: lotsData, error: lotsError } = await supabase
                .from('product_lots')
                .select(`
                    id,
                    lot_number,
                    quantity_remaining,
                    product_id,
                    products (name, sku, min_stock_alert),
                    transactions (
                        type, 
                        quantity_changed,
                        sales (parcel_status)
                    )
                `);

            if (lotsError) throw lotsError;

            const processedData: InventoryLot[] = (lotsData || []).map((lot: any) => {
                const transactions = lot.transactions || [];

                const stock_in = transactions
                    .filter((t: any) => t.type === 'in')
                    .reduce((sum: number, t: any) => sum + t.quantity_changed, 0);

                const sold = transactions
                    .filter((t: any) => {
                        if (t.type !== 'sale') return false;
                        if (t.sales) {
                            return ['processing', 'sent', 'delivered'].includes(t.sales.parcel_status);
                        }
                        return true;
                    })
                    .reduce((sum: number, t: any) => sum + Math.abs(t.quantity_changed), 0);

                const returned = transactions
                    .filter((t: any) => t.type === 'sale' && t.sales?.parcel_status === 'returned')
                    .reduce((sum: number, t: any) => sum + Math.abs(t.quantity_changed), 0);

                const remaining = stock_in - sold;
                const minStock = lot.products?.min_stock_alert || 5;

                let status: InventoryLot['status'] = 'Healthy';
                if (remaining <= 0) status = 'Out of Stock';
                else if (remaining <= minStock) status = 'Low Stock';

                return {
                    id: lot.id,
                    lot_number: lot.lot_number,
                    sku: lot.products?.sku || 'N/A',
                    product_name: lot.products?.name || 'Unknown Product',
                    stock_in,
                    sold,
                    returned,
                    remaining,
                    status
                };
            });

            setInventory(processedData);
            setError(null);
        } catch (err: any) {
            console.error('Error fetching inventory:', err);
            setError(err.message || 'Failed to sync inventory data');
        } finally {
            setLoading(false);
        }
    };

    const filteredInventory = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return inventory;
        return inventory.filter((item) =>
            item.sku.toLowerCase().includes(q) ||
            item.product_name.toLowerCase().includes(q) ||
            item.lot_number.toLowerCase().includes(q)
        );
    }, [inventory, query]);
    const isSearchMode = query.trim().length > 0;

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto space-y-6 pb-24 lg:pb-12">
                {!isSearchMode && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Inventory Ledger</h1>
                            <p className="text-gray-400 font-medium text-xs">Real-time batch movement and stock status tracking.</p>
                        </div>
                        <button
                            onClick={() => fetchInventory()}
                            disabled={loading}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shadow-sm disabled:opacity-50 min-h-[44px] sm:min-h-0"
                        >
                            <RotateCcw size={14} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
                            Refresh Data
                        </button>
                    </div>
                )}

                {error ? (
                    <div className="p-10 bg-rose-50 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-2xl flex flex-col items-center gap-4 text-center">
                        <div className="p-3 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-xl">
                            <AlertTriangle size={24} strokeWidth={1.5} />
                        </div>
                        <div className="space-y-1">
                            <h2 className="text-sm font-bold text-rose-800 dark:text-rose-400 uppercase tracking-widest">Sync Disrupted</h2>
                            <p className="text-xs text-rose-600/80 dark:text-rose-400/60 font-medium max-w-sm">{error}</p>
                        </div>
                        <button
                            onClick={() => fetchInventory()}
                            className="px-4 py-2 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors"
                        >
                            Retry Sync
                        </button>
                    </div>
                ) : loading && inventory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-4">
                        <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Scanning Databases...</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredInventory.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                                <div className="flex flex-col items-center gap-3 opacity-30">
                                    <Package size={40} strokeWidth={1.5} />
                                    <p className="text-xs font-bold uppercase tracking-widest">No active records</p>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl overflow-hidden border-2 border-gray-300 dark:border-gray-600 shadow-md bg-white dark:bg-gray-900">
                                {/* Excel-style table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse" style={{ minWidth: '360px' }}>
                                        <thead>
                                            <tr className="bg-[#217346] text-white text-[10px] font-bold uppercase tracking-wide">
                                                <th className="border border-[#1a5c37] px-2 py-2.5 text-left" style={{ width: '22%' }}>Product</th>
                                                <th className="border border-[#1a5c37] px-2 py-2.5 text-left" style={{ width: '18%' }}>Batch</th>
                                                <th className="border border-[#1a5c37] px-1.5 py-2.5 text-center" style={{ width: '12%' }}>In</th>
                                                <th className="border border-[#1a5c37] px-1.5 py-2.5 text-center" style={{ width: '12%' }}>Sold</th>
                                                <th className="border border-[#1a5c37] px-1.5 py-2.5 text-center" style={{ width: '10%' }}>Ret</th>
                                                <th className="border border-[#1a5c37] px-1.5 py-2.5 text-center" style={{ width: '12%' }}>Bal</th>
                                                <th className="border border-[#1a5c37] px-1.5 py-2.5 text-center" style={{ width: '14%' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredInventory.map((item, index) => (
                                                <tr
                                                    key={item.id}
                                                    className={`text-[11px] ${index % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-[#e8f5e9] dark:bg-gray-800/50'} hover:bg-[#c8e6c9] dark:hover:bg-gray-700 transition-colors`}
                                                >
                                                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2">
                                                        <div className="leading-tight">
                                                            <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{item.sku}</p>
                                                            <p className="text-[9px] text-gray-500 truncate">{item.product_name}</p>
                                                        </div>
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2 font-medium text-gray-700 dark:text-gray-300 text-[10px]">
                                                        {item.lot_number}
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-center font-bold text-gray-800 dark:text-gray-200">
                                                        {item.stock_in}
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-center font-bold text-[#217346]">
                                                        {item.sold}
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-center font-bold text-rose-500">
                                                        {item.returned}
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2 text-center font-black">
                                                        <span className={item.remaining <= 5 ? 'text-amber-600' : 'text-blue-600 dark:text-blue-400'}>
                                                            {item.remaining}
                                                        </span>
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-2 text-center">
                                                        <ExcelStatusCell status={item.status} />
                                                    </td>
                                                </tr>
                                            ))}
                                            {!isSearchMode && (
                                                <tr className="bg-[#d5e8d4] dark:bg-gray-800 font-black text-[11px] border-t-2 border-[#217346]">
                                                    <td className="border border-gray-300 dark:border-gray-600 px-2 py-2.5 text-gray-700 dark:text-gray-200" colSpan={2}>
                                                        TOTAL ({filteredInventory.length} items)
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2.5 text-center text-gray-800 dark:text-gray-200">
                                                        {filteredInventory.reduce((sum, i) => sum + i.stock_in, 0)}
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2.5 text-center text-[#217346]">
                                                        {filteredInventory.reduce((sum, i) => sum + i.sold, 0)}
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2.5 text-center text-rose-500">
                                                        {filteredInventory.reduce((sum, i) => sum + i.returned, 0)}
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1.5 py-2.5 text-center text-blue-600 dark:text-blue-400">
                                                        {filteredInventory.reduce((sum, i) => sum + i.remaining, 0)}
                                                    </td>
                                                    <td className="border border-gray-300 dark:border-gray-600 px-1 py-2.5 text-center text-[10px] text-gray-500">—</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

function ExcelStatusCell({ status }: { status: InventoryLot['status'] }) {
    if (status === 'Healthy') {
        return (
            <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase bg-[#c6efce] text-[#006100] rounded-sm border border-[#a9d18e]">
                OK
            </span>
        );
    }
    if (status === 'Low Stock') {
        return (
            <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase bg-[#ffeb9c] text-[#9c6500] rounded-sm border border-[#dfc27d]">
                LOW
            </span>
        );
    }
    return (
        <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase bg-[#ffc7ce] text-[#9c0006] rounded-sm border border-[#e6a0a8]">
            OUT
        </span>
    );
}
