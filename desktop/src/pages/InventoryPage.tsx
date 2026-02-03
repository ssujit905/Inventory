import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { Package, AlertTriangle, Hash, Barcode, ArrowUpDown } from 'lucide-react';

type InventoryLot = {
    id: string;
    lot_number: string;
    sku: string;
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

    useEffect(() => {
        fetchInventory();

        const channel = supabase
            .channel('inventory-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => fetchInventory(false))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_lots' }, () => fetchInventory(false))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => fetchInventory(false))
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchInventory = async (isInitial = true) => {
        if (isInitial) setLoading(true);
        try {
            // 1. Fetch lots with their transactions AND linked sales status
            const { data: lotsData, error: lotsError } = await supabase
                .from('product_lots')
                .select(`
                    id,
                    lot_number,
                    quantity_remaining,
                    product_id,
                    products (sku, min_stock_alert),
                    transactions (
                        type, 
                        quantity_changed,
                        sale_id,
                        sales (parcel_status)
                    )
                `);

            if (lotsError) throw lotsError;

            // 2. Process each lot individually
            const processedData: InventoryLot[] = (lotsData || []).map((lot: any) => {
                const transactions = lot.transactions || [];

                // Stock In: Sum of all 'in' type transactions for this specific lot
                const stock_in = transactions
                    .filter((t: any) => t.type === 'in')
                    .reduce((sum: number, t: any) => sum + t.quantity_changed, 0);

                // Sold: Processing, Sent, or Delivered (or legacy sales with no link)
                const sold = transactions
                    .filter((t: any) => {
                        if (t.type !== 'sale') return false;
                        // If we have a linked sale, check its status
                        if (t.sales) {
                            return ['processing', 'sent', 'delivered'].includes(t.sales.parcel_status);
                        }
                        // Default for legacy transactions with no sale_id link
                        return true;
                    })
                    .reduce((sum: number, t: any) => sum + Math.abs(t.quantity_changed), 0);

                // Returned: Only count if explicitly marked as 'returned' in sales table
                const returned = transactions
                    .filter((t: any) => t.type === 'sale' && t.sales?.parcel_status === 'returned')
                    .reduce((sum: number, t: any) => sum + Math.abs(t.quantity_changed), 0);

                // Formula: Remaining = Stock In - Sold
                const remaining = stock_in - sold;
                const minStock = 5;

                let status: InventoryLot['status'] = 'Healthy';
                if (remaining <= 0) status = 'Out of Stock';
                else if (remaining <= minStock) status = 'Low Stock';

                return {
                    id: lot.id,
                    lot_number: lot.lot_number,
                    sku: lot.products?.sku || 'N/A',
                    stock_in,
                    sold,
                    returned,
                    remaining,
                    status
                };
            });

            setInventory(processedData);
        } catch (error: any) {
            console.error('Error fetching inventory:', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="space-y-8 pb-12">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Inventory Ledger</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Real-time Batch Tracking</p>
                    </div>
                    <button
                        onClick={() => fetchInventory()}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-bold text-sm hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
                    >
                        <ArrowUpDown size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh Data
                    </button>
                </div>

                {loading ? (
                    <div className="flex h-96 items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                            <span className="text-sm font-black text-gray-400 uppercase tracking-widest">Synchronizing Stock...</span>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[2.5rem] overflow-hidden shadow-xl shadow-gray-200/50 dark:shadow-none">
                        <div className="overflow-x-auto overflow-y-hidden custom-scrollbar">
                            <table className="w-full text-left border-collapse min-w-[1000px]">
                                <thead>
                                    <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800">
                                        <th className="p-6 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em]">Product ID</th>
                                        <th className="p-6 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em]">Batch / Lot #</th>
                                        <th className="p-6 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-center">Stock In</th>
                                        <th className="p-6 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-center">Sold</th>
                                        <th className="p-6 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-center">Returned</th>
                                        <th className="p-6 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em] text-center">Remaining</th>
                                        <th className="p-6 font-black text-[10px] text-gray-400 uppercase tracking-[0.2em]">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                    {inventory.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-24 text-center">
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-3xl">
                                                        <Package size={48} className="text-gray-200" />
                                                    </div>
                                                    <p className="font-bold text-gray-400 uppercase tracking-widest text-sm">No inventory records found</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        inventory.map((item) => (
                                            <tr key={item.id} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-all">
                                                <td className="p-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-primary/5 rounded-lg">
                                                            <Barcode size={18} className="text-primary" />
                                                        </div>
                                                        <span className="font-black text-gray-900 dark:text-gray-100 font-mono tracking-tighter">{item.sku}</span>
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                                            <Hash size={18} className="text-gray-500" />
                                                        </div>
                                                        <span className="font-bold text-gray-700 dark:text-gray-300">#{item.lot_number}</span>
                                                    </div>
                                                </td>
                                                <td className="p-6 text-center">
                                                    <span className="font-black text-lg text-gray-900 dark:text-gray-100 font-mono">{item.stock_in}</span>
                                                </td>
                                                <td className="p-6 text-center">
                                                    <span className="font-black text-lg text-rose-500 font-mono">{item.sold}</span>
                                                </td>
                                                <td className="p-6 text-center">
                                                    <span className="font-black text-lg text-blue-500 font-mono">{item.returned}</span>
                                                </td>
                                                <td className="p-6 text-center">
                                                    <div className="inline-flex flex-col items-center">
                                                        <span className={`text-2xl font-black font-mono ${item.remaining <= 5 ? 'text-amber-500' : 'text-primary'}`}>
                                                            {item.remaining}
                                                        </span>
                                                        <div className="w-12 h-1 bg-gray-100 dark:bg-gray-800 rounded-full mt-1 overflow-hidden">
                                                            <div
                                                                className="h-full bg-primary"
                                                                style={{ width: `${Math.min(100, (item.remaining / (item.stock_in || 1)) * 100)}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    {item.status === 'Healthy' ? (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase bg-green-100 text-green-700 border border-green-200 tracking-widest outline outline-4 outline-green-500/10">
                                                            Healthy
                                                        </span>
                                                    ) : item.status === 'Low Stock' ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200 tracking-widest animate-pulse">
                                                            <AlertTriangle size={12} /> Low Stock
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200 tracking-widest">
                                                            Out of Stock
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
