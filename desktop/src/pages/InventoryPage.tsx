import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { Package, AlertTriangle, RotateCcw, Barcode, Hash } from 'lucide-react';

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

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-7xl mx-auto space-y-6 pb-24 lg:pb-12">
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
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-50/50 dark:bg-gray-800/30 border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase tracking-widest font-bold text-gray-400">
                                            <th className="px-6 py-4">Product Info</th>
                                            <th className="px-6 py-4">Batch #</th>
                                            <th className="px-6 py-4 text-center">In</th>
                                            <th className="px-6 py-4 text-center">Sold</th>
                                            <th className="px-6 py-4 text-center">Ret</th>
                                            <th className="px-6 py-4 text-center">Remaining</th>
                                            <th className="px-6 py-4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                        {inventory.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-6 py-20 text-center">
                                                    <div className="flex flex-col items-center gap-3 opacity-30">
                                                        <Package size={40} strokeWidth={1.5} />
                                                        <p className="text-xs font-bold uppercase tracking-widest">No active records</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            inventory.map((item) => (
                                                <tr key={item.id} className="text-sm hover:bg-gray-50/50 dark:hover:bg-gray-800 transition-colors group">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center text-gray-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                                <Barcode size={16} strokeWidth={1.5} />
                                                            </div>
                                                            <div>
                                                                <p className="font-semibold text-gray-900 dark:text-gray-100">{item.product_name}</p>
                                                                <p className="text-[10px] text-gray-400 font-medium">{item.sku}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2 text-gray-500 font-medium">
                                                            <Hash size={12} strokeWidth={1.5} />
                                                            <span>{item.lot_number}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold text-gray-700 dark:text-gray-300">{item.stock_in}</td>
                                                    <td className="px-6 py-4 text-center font-bold text-emerald-500">{item.sold}</td>
                                                    <td className="px-6 py-4 text-center font-bold text-rose-400">{item.returned}</td>
                                                    <td className="px-6 py-4 text-center font-bold">
                                                        <span className={`px-2 py-1 rounded-md ${item.remaining <= 5 ? 'bg-amber-50 dark:bg-amber-900/10 text-amber-600' : 'text-primary'}`}>
                                                            {item.remaining}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <StatusBadge status={item.status} />
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

function StatusBadge({ status }: { status: InventoryLot['status'] }) {
    if (status === 'Healthy') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 border border-emerald-100 dark:border-emerald-900/30">
                Healthy
            </span>
        );
    }
    if (status === 'Low Stock') {
        return (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight bg-amber-50 dark:bg-amber-900/10 text-amber-600 border border-amber-100 dark:border-amber-900/30">
                Low Stock
            </span>
        );
    }
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-tight bg-rose-50 dark:bg-rose-900/10 text-rose-600 border border-rose-100 dark:border-rose-900/30">
            Out of Stock
        </span>
    );
}
