import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase, supabaseWithTimeout } from '../lib/supabase';
import { getVendorId } from '../lib/vendorHelpers';
import { format } from 'date-fns';
import {
    Bell, Loader2, Check, X, Clock, AlertTriangle, Phone, ChevronDown, ChevronUp
} from 'lucide-react';

interface NotifyRequest {
    id: number;
    product_id: number;
    variant_id: string | null;
    color: string;
    size: string;
    customer_name: string;
    phone: string;
    address: string;
    status: 'pending' | 'notified' | 'cancelled';
    created_at: string;
    website_products?: { id: number; title: string; vendor_id: string | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'New', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: <Clock size={12} /> },
    notified: { label: 'Notified', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <Check size={12} /> },
    cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: <X size={12} /> },
};

export default function WebsiteNotifyPage() {
    const { profile } = useAuthStore();
    const [requests, setRequests] = useState<NotifyRequest[]>([]);
    const [skuMap, setSkuMap] = useState<Map<string, string>>(new Map());
    const [expandedSku, setExpandedSku] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchRequests();

        const channel = supabase
            .channel('product_notify_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_notify_requests' }, () => {
                fetchRequests();
            })
            .subscribe();

        return () => {
            try {
                supabase.removeChannel(channel);
            } catch (e) {
                // Ignore
            }
        };
    }, []);

    // Opening the Notify tab marks everything as seen, so the sidebar
    // alert clears. New requests arriving afterwards badge again.
    useEffect(() => {
        if (!loading) {
            try {
                localStorage.setItem(`notify_last_seen_${profile?.id || 'anon'}`, new Date().toISOString());
            } catch {
                // Storage unavailable — badge simply won't clear
            }
        }
    }, [loading, requests, profile?.id]);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const vendorId = getVendorId(profile);
            let query = supabase
                .from('product_notify_requests')
                .select('*, website_products!inner(id,title,vendor_id)');
            // Vendors see only their own products' requests; main-store
            // admin/staff see only own-store (non-vendor) requests.
            if (vendorId) {
                query = query.eq('website_products.vendor_id', vendorId);
            } else {
                query = query.is('website_products.vendor_id', null);
            }
            const { data, error } = await supabaseWithTimeout(
                query.order('created_at', { ascending: false })
            );
            if (error) throw error;
            const rows = (data as NotifyRequest[]) || [];
            setRequests(rows);

            // Resolve variant SKUs for the grouped summary table
            const variantIds = [...new Set(rows.map(r => r.variant_id).filter((v): v is string => !!v))];
            if (variantIds.length > 0) {
                const { data: stockRows } = await supabaseWithTimeout(
                    supabase.from('website_variant_stock_view').select('variant_id, sku').in('variant_id', variantIds)
                );
                setSkuMap(new Map(((stockRows as any[]) || []).map(s => [s.variant_id, s.sku || ''])));
            } else {
                setSkuMap(new Map());
            }
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    // Group requests by SKU (variant) for the expandable summary table —
    // e.g. 2 notifies for the same SKU collapse into one row with count 2.
    const skuGroups = useMemo(() => {
        const map = new Map<string, { sku: string; title: string; variation: string; items: NotifyRequest[] }>();
        for (const r of requests) {
            const key = r.variant_id || `p-${r.product_id}`;
            const sku = (r.variant_id && skuMap.get(r.variant_id)) || '';
            const variation = [r.color, r.size].filter(Boolean).join(' / ') || 'Standard';
            if (!map.has(key)) {
                map.set(key, {
                    sku: sku || variation,
                    title: r.website_products?.title || `Product #${r.product_id}`,
                    variation,
                    items: []
                });
            }
            map.get(key)!.items.push(r);
        }
        return [...map.entries()].map(([key, g]) => ({ key, ...g }));
    }, [requests, skuMap]);

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {/* Global Toast Notification */}
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="max-w-5xl mx-auto space-y-6 pb-12">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Bell size={22} className="text-primary" /> Notify Requests
                        </h1>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-1">Customers waiting for out-of-stock variations</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{requests.length}</p>
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Requests</p>
                    </div>
                </div>

                {/* SKU Summary Table (expandable) — the full view */}
                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                ) : requests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 gap-4">
                        <Bell size={48} className="text-gray-200 dark:text-gray-700" />
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No notify requests found</p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                            <span className="flex-1">SKU / Product</span>
                            <span className="w-16 text-center">Notify</span>
                            <span className="w-6" />
                        </div>
                        {skuGroups.map(g => {
                            const isOpen = expandedSku === g.key;
                            return (
                                <div key={g.key} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                                    <div
                                        className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                        onClick={() => setExpandedSku(isOpen ? null : g.key)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-mono font-bold text-gray-900 dark:text-gray-100 text-sm truncate">{g.sku}</p>
                                            <p className="text-xs text-gray-400 truncate">{g.title} · {g.variation}</p>
                                        </div>
                                        <span className="w-16 text-center">
                                            <span className={`inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-sm font-black ${g.items.length > 1 ? 'bg-rose-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                                                {g.items.length}
                                            </span>
                                        </span>
                                        <span className="w-6 flex justify-center">
                                            {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                                        </span>
                                    </div>
                                    {isOpen && (
                                        <div className="px-4 pb-3 pt-1 space-y-2 bg-gray-50/60 dark:bg-gray-800/30">
                                            {g.items.map(item => {
                                                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                                                return (
                                                    <div key={item.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-3 text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-gray-900 dark:text-gray-100">{item.customer_name}</span>
                                                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black ${cfg.color}`}>
                                                                {cfg.icon} {cfg.label}
                                                            </span>
                                                            <span className="ml-auto text-xs text-gray-400">{format(new Date(item.created_at), 'MMM d · h:mm a')}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1.5 text-xs">
                                                            <a href={`tel:${item.phone}`} className="font-bold text-emerald-600 hover:underline inline-flex items-center gap-1">
                                                                <Phone size={13} /> {item.phone}
                                                            </a>
                                                            <span className="text-gray-500 truncate">{item.address}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
