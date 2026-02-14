import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { Package, AlertTriangle, RotateCcw, Barcode, Hash, Search, ArrowRight } from 'lucide-react';

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
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchInventory();
    }, []);

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
                const stock_in = transactions.filter((t: any) => t.type === 'in').reduce((sum: number, t: any) => sum + t.quantity_changed, 0);
                const sold = transactions.filter((t: any) => t.type === 'sale' && ['processing', 'sent', 'delivered'].includes(t.sales?.parcel_status)).reduce((sum: number, t: any) => sum + Math.abs(t.quantity_changed), 0);
                const returned = transactions.filter((t: any) => t.type === 'sale' && t.sales?.parcel_status === 'returned').reduce((sum: number, t: any) => sum + Math.abs(t.quantity_changed), 0);
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
            setError(err.message || 'Failed to sync data');
        } finally {
            setLoading(false);
        }
    };

    const filteredInventory = inventory.filter(item =>
        item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.lot_number.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="space-y-6">
                {/* Mobile Page Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">Inventory</h1>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Stock Ledger</p>
                    </div>
                    <button
                        onClick={() => fetchInventory()}
                        className={`p-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm active:scale-90 transition-transform ${loading ? 'opacity-50' : ''}`}
                    >
                        <RotateCcw size={20} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Mobile Search Bar */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search product, SKU or batch..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-14 pl-12 pr-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl text-base font-medium focus:ring-4 focus:ring-primary/10 transition-all outline-none"
                    />
                </div>

                {error && (
                    <div className="p-6 bg-red-50 dark:bg-red-500/10 rounded-3xl border border-red-100 dark:border-red-500/20 text-center space-y-3">
                        <AlertTriangle className="mx-auto text-red-500" size={32} />
                        <p className="text-sm font-bold text-red-600">{error}</p>
                        <button onClick={() => fetchInventory()} className="px-6 py-2 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest">Retry</button>
                    </div>
                )}

                {/* Mobile Card List */}
                <div className="space-y-4">
                    {loading && inventory.length === 0 ? (
                        [1, 2, 3].map(i => <div key={i} className="h-44 bg-gray-100 dark:bg-gray-900 animate-pulse rounded-3xl" />)
                    ) : filteredInventory.length === 0 ? (
                        <div className="py-20 text-center opacity-30 select-none">
                            <Package size={64} className="mx-auto mb-4" />
                            <p className="font-black uppercase tracking-widest">No items found</p>
                        </div>
                    ) : (
                        filteredInventory.map((item) => (
                            <div key={item.id} className="bg-white dark:bg-gray-900 p-5 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm space-y-5 active:scale-[0.98] transition-transform">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                                            <Barcode size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-gray-900 dark:text-gray-100 text-lg leading-tight">{item.product_name}</h3>
                                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{item.sku}</p>
                                        </div>
                                    </div>
                                    <StatusPill status={item.status} />
                                </div>

                                <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-full w-fit">
                                    <Hash size={10} />
                                    <span>BATCH: {item.lot_number}</span>
                                </div>

                                <div className="grid grid-cols-4 gap-4 pt-4 border-t border-gray-50 dark:border-gray-800/50">
                                    <StatBox label="STOCK IN" value={item.stock_in} />
                                    <StatBox label="SOLD" value={item.sold} color="text-emerald-500" />
                                    <StatBox label="RET" value={item.returned} color="text-rose-400" />
                                    <StatBox label="BALANCE" value={item.remaining} color="text-primary" isLarge />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}

function StatusPill({ status }: { status: InventoryLot['status'] }) {
    const colors = {
        'Healthy': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        'Low Stock': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        'Out of Stock': 'bg-rose-500/10 text-rose-500 border-rose-500/20'
    };

    return (
        <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${colors[status]}`}>
            {status}
        </span>
    );
}

function StatBox({ label, value, color = "text-gray-600 dark:text-gray-400", isLarge }: { label: string, value: number, color?: string, isLarge?: boolean }) {
    return (
        <div className="space-y-1">
            <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">{label}</p>
            <p className={`font-black tracking-tight ${color} ${isLarge ? 'text-xl' : 'text-base'}`}>{value}</p>
        </div>
    );
}
