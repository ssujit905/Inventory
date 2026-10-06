import { useState, useEffect, useMemo } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase, supabaseWithTimeout } from '../lib/supabase';
import { getVendorId } from '../lib/vendorHelpers';
import { format } from 'date-fns';
import {
    Bell, Loader2, Check, X, Clock, AlertTriangle, Phone, ChevronDown,
    Search, MessageCircle, MapPin, Package, RotateCcw, Layers, ListFilter
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

const STATUS_CONFIG: Record<string, { label: string; color: string; border: string; bg: string; icon: React.ReactNode }> = {
    pending: { label: 'New', color: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800/60', bg: 'bg-amber-50 dark:bg-amber-950/40', icon: <Clock size={12} /> },
    notified: { label: 'Notified', color: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/60', bg: 'bg-emerald-50 dark:bg-emerald-950/40', icon: <Check size={12} /> },
    cancelled: { label: 'Cancelled', color: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-800', bg: 'bg-gray-100 dark:bg-gray-800/60', icon: <X size={12} /> },
};

export default function WebsiteNotifyPage() {
    const { profile } = useAuthStore();
    const [requests, setRequests] = useState<NotifyRequest[]>([]);
    const [skuMap, setSkuMap] = useState<Map<string, string>>(new Map());
    const [expandedSku, setExpandedSku] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'notified' | 'cancelled'>('all');
    const [viewMode, setViewMode] = useState<'grouped' | 'feed'>('grouped');
    const [updatingId, setUpdatingId] = useState<number | null>(null);
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
            } catch {
                // Ignore
            }
        };
    }, []);

    // Clear notification badge when opened
    useEffect(() => {
        if (!loading) {
            try {
                localStorage.setItem(`notify_last_seen_${profile?.id || 'anon'}`, new Date().toISOString());
            } catch {
                // Storage unavailable
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

            // Resolve variant SKUs for the grouped view
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

    const updateStatus = async (id: number, newStatus: 'pending' | 'notified' | 'cancelled') => {
        setUpdatingId(id);
        try {
            const { error } = await supabase
                .from('product_notify_requests')
                .update({ status: newStatus })
                .eq('id', id);
            if (error) throw error;

            setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
            showToast(`Marked as ${newStatus === 'notified' ? 'Notified' : newStatus === 'cancelled' ? 'Cancelled' : 'New'}`);
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setUpdatingId(null);
        }
    };

    const getWhatsAppUrl = (phone: string, title: string, variation: string) => {
        const clean = phone.replace(/\D/g, '');
        const intl = clean.startsWith('977') ? clean : `977${clean}`;
        const text = encodeURIComponent(`Namaste! The product "${title}" (${variation}) you requested is now back in stock at Shopy Nepal. You can order it now!`);
        return `https://wa.me/${intl}?text=${text}`;
    };

    // Filter requests by status and search text
    const filteredRequests = useMemo(() => {
        return requests.filter(r => {
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            const sku = (r.variant_id && skuMap.get(r.variant_id)) || '';
            const title = r.website_products?.title || '';
            const variation = `${r.color} ${r.size}`.toLowerCase();
            return (
                r.customer_name.toLowerCase().includes(q) ||
                r.phone.includes(q) ||
                r.address.toLowerCase().includes(q) ||
                title.toLowerCase().includes(q) ||
                sku.toLowerCase().includes(q) ||
                variation.includes(q)
            );
        });
    }, [requests, statusFilter, searchQuery, skuMap]);

    // Group filtered requests by SKU / Variant
    const skuGroups = useMemo(() => {
        const map = new Map<string, { sku: string; title: string; variation: string; items: NotifyRequest[] }>();
        for (const r of filteredRequests) {
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
    }, [filteredRequests, skuMap]);

    const counts = useMemo(() => {
        return {
            all: requests.length,
            pending: requests.filter(r => r.status === 'pending').length,
            notified: requests.filter(r => r.status === 'notified').length,
            cancelled: requests.filter(r => r.status === 'cancelled').length,
        };
    }, [requests]);

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {/* Global Toast */}
            {toast && (
                <div className={`fixed top-4 left-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white text-xs font-bold animate-in slide-in-from-top duration-300 ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                    <div className="h-5 w-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                        {toast.type === 'success' ? <Check size={12} strokeWidth={3} /> : <AlertTriangle size={12} strokeWidth={3} />}
                    </div>
                    <span className="flex-1">{toast.msg}</span>
                </div>
            )}

            <div className="space-y-3.5 pb-20">
                {/* Mobile Header */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                <Bell size={20} />
                            </div>
                            <div>
                                <h1 className="text-lg font-black text-gray-900 dark:text-gray-100 tracking-tight">
                                    Notify Requests
                                </h1>
                                <p className="text-[11px] text-gray-400 font-medium">
                                    {counts.pending} waiting for restock
                                </p>
                            </div>
                        </div>

                        {/* View Mode Toggle */}
                        <div className="flex items-center p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                            <button
                                onClick={() => setViewMode('grouped')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${viewMode === 'grouped' ? 'bg-white dark:bg-gray-900 text-primary shadow-sm' : 'text-gray-400'}`}
                                title="Group by SKU"
                            >
                                <Layers size={14} />
                                <span className="hidden sm:inline">SKU</span>
                            </button>
                            <button
                                onClick={() => setViewMode('feed')}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${viewMode === 'feed' ? 'bg-white dark:bg-gray-900 text-primary shadow-sm' : 'text-gray-400'}`}
                                title="Recent Feed"
                            >
                                <ListFilter size={14} />
                                <span className="hidden sm:inline">Feed</span>
                            </button>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative mt-3">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search customer, phone, SKU or product..."
                            className="w-full bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 rounded-xl pl-9 pr-8 py-2.5 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Status Filter Horizontal Scrollable Pills */}
                    <div className="flex items-center gap-2 overflow-x-auto pt-3 no-scrollbar text-xs">
                        <button
                            onClick={() => setStatusFilter('all')}
                            className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition flex items-center gap-1.5 ${statusFilter === 'all' ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
                        >
                            All ({counts.all})
                        </button>
                        <button
                            onClick={() => setStatusFilter('pending')}
                            className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition flex items-center gap-1.5 ${statusFilter === 'pending' ? 'bg-amber-500 text-white shadow-sm' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'}`}
                        >
                            <Clock size={12} /> New ({counts.pending})
                        </button>
                        <button
                            onClick={() => setStatusFilter('notified')}
                            className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition flex items-center gap-1.5 ${statusFilter === 'notified' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'}`}
                        >
                            <Check size={12} /> Notified ({counts.notified})
                        </button>
                        <button
                            onClick={() => setStatusFilter('cancelled')}
                            className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition flex items-center gap-1.5 ${statusFilter === 'cancelled' ? 'bg-gray-600 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
                        >
                            <X size={12} /> Cancelled ({counts.cancelled})
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                        <Loader2 size={32} className="animate-spin text-primary" />
                        <span className="text-xs font-semibold">Loading requests...</span>
                    </div>
                ) : filteredRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 text-center p-6 gap-2">
                        <div className="h-12 w-12 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600 flex items-center justify-center mb-1">
                            <Bell size={24} />
                        </div>
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300">No requests found</p>
                        <p className="text-xs text-gray-400 max-w-xs">
                            {searchQuery ? 'Try clearing your search query.' : 'There are currently no product notify requests matching this filter.'}
                        </p>
                    </div>
                ) : viewMode === 'grouped' ? (
                    /* Grouped by SKU / Variant View */
                    <div className="space-y-2.5">
                        {skuGroups.map(g => {
                            const isOpen = expandedSku === g.key;
                            const pendingCount = g.items.filter(i => i.status === 'pending').length;

                            return (
                                <div
                                    key={g.key}
                                    className={`bg-white dark:bg-gray-900 rounded-2xl border transition-all overflow-hidden shadow-sm ${isOpen ? 'border-primary/40 ring-1 ring-primary/20' : 'border-gray-100 dark:border-gray-800'}`}
                                >
                                    {/* SKU Header Card */}
                                    <div
                                        onClick={() => setExpandedSku(isOpen ? null : g.key)}
                                        className="p-3.5 cursor-pointer active:bg-gray-50 dark:active:bg-gray-800/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                                <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <Package size={18} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-mono font-bold text-xs text-gray-900 dark:text-gray-100 truncate">
                                                        {g.sku}
                                                    </p>
                                                    <p className="text-xs text-gray-600 dark:text-gray-300 font-medium truncate mt-0.5">
                                                        {g.title}
                                                    </p>
                                                    <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                                        {g.variation}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className={`inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full text-xs font-black ${pendingCount > 0 ? 'bg-rose-500 text-white shadow-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                                                    {g.items.length}
                                                </span>
                                                <div className={`p-1 rounded-lg text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`}>
                                                    <ChevronDown size={18} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Customer List */}
                                    {isOpen && (
                                        <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/30 space-y-2.5">
                                            {g.items.map(item => (
                                                <CustomerRequestCard
                                                    key={item.id}
                                                    item={item}
                                                    productTitle={g.title}
                                                    variation={g.variation}
                                                    updatingId={updatingId}
                                                    onUpdateStatus={updateStatus}
                                                    getWhatsAppUrl={getWhatsAppUrl}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* Feed View (Chronological flat cards) */
                    <div className="space-y-2.5">
                        {filteredRequests.map(item => {
                            const variation = [item.color, item.size].filter(Boolean).join(' / ') || 'Standard';
                            const title = item.website_products?.title || `Product #${item.product_id}`;
                            const sku = (item.variant_id && skuMap.get(item.variant_id)) || variation;

                            return (
                                <div key={item.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-3.5 shadow-sm space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-mono font-bold text-primary truncate">{sku}</p>
                                            <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate mt-0.5">{title}</p>
                                            <span className="text-[10px] text-gray-400 font-medium">{variation}</span>
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                                            {format(new Date(item.created_at), 'MMM dd, h:mm a')}
                                        </span>
                                    </div>

                                    <CustomerRequestCard
                                        item={item}
                                        productTitle={title}
                                        variation={variation}
                                        updatingId={updatingId}
                                        onUpdateStatus={updateStatus}
                                        getWhatsAppUrl={getWhatsAppUrl}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

// Subcomponent: Individual Customer Request Card with Touch Actions
function CustomerRequestCard({
    item,
    productTitle,
    variation,
    updatingId,
    onUpdateStatus,
    getWhatsAppUrl
}: {
    item: NotifyRequest;
    productTitle: string;
    variation: string;
    updatingId: number | null;
    onUpdateStatus: (id: number, status: 'pending' | 'notified' | 'cancelled') => void;
    getWhatsAppUrl: (phone: string, title: string, variation: string) => string;
}) {
    const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    const isUpdating = updatingId === item.id;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-3 space-y-2.5 shadow-sm">
            {/* Customer Details Row */}
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">
                        {item.customer_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        <MapPin size={11} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate">{item.address || 'No address provided'}</span>
                    </div>
                </div>

                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                    {cfg.icon}
                    <span>{cfg.label}</span>
                </span>
            </div>

            {/* Quick Action Touch Targets (Call, WhatsApp, Status) */}
            <div className="pt-2 border-t border-gray-50 dark:border-gray-800/80 flex items-center gap-2">
                {/* 1-Tap Call Button */}
                <a
                    href={`tel:${item.phone}`}
                    className="flex-1 min-h-[38px] px-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                    <Phone size={13} />
                    <span className="truncate">{item.phone}</span>
                </a>

                {/* 1-Tap WhatsApp Button */}
                <a
                    href={getWhatsAppUrl(item.phone, productTitle, variation)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-[38px] w-[38px] bg-green-500 text-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm shadow-green-500/20 active:scale-95 transition hover:bg-green-600"
                    title="Send WhatsApp Message"
                >
                    <MessageCircle size={16} />
                </a>

                {/* Status Toggle Actions */}
                {isUpdating ? (
                    <div className="h-[38px] px-3 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                        <Loader2 size={15} className="animate-spin text-gray-500" />
                    </div>
                ) : item.status === 'pending' ? (
                    <button
                        onClick={() => onUpdateStatus(item.id, 'notified')}
                        className="min-h-[38px] px-3 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm shadow-primary/20 active:scale-95 transition flex items-center gap-1 hover:bg-primary/90"
                    >
                        <Check size={14} />
                        <span>Done</span>
                    </button>
                ) : (
                    <button
                        onClick={() => onUpdateStatus(item.id, 'pending')}
                        className="min-h-[38px] px-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-bold active:scale-95 transition flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="Re-open request"
                    >
                        <RotateCcw size={13} />
                        <span className="text-[10px]">Reopen</span>
                    </button>
                )}
            </div>
        </div>
    );
}
