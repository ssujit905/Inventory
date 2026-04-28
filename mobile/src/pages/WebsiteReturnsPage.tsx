import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import {
    RotateCcw, Loader2, ChevronDown, ChevronUp,
    Check, X, Clock, AlertTriangle, Phone, ExternalLink, Image as ImageIcon, MessageSquare
} from 'lucide-react';

interface ReturnRequest {
    id: number;
    order_id?: number | null;
    order_number?: string | null;
    customer_phone: string;
    type: 'return' | 'exchange' | 'message';
    message: string;
    media?: { url: string; type: string }[] | null;
    status: 'pending' | 'approved' | 'rejected' | 'completed';
    created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'New', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: <Clock size={12} /> },
    approved: { label: 'Processed', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: <Check size={12} /> },
    rejected: { label: 'Rejected', color: 'bg-rose-50 text-rose-600 border-rose-200', icon: <X size={12} /> },
    completed: { label: 'Completed', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <Check size={12} /> },
};

export default function WebsiteReturnsPage() {
    const { profile } = useAuthStore();
    const [requests, setRequests] = useState<ReturnRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [activeTab, setActiveTab] = useState<'all' | 'return' | 'exchange' | 'message'>('all');
    const isReadOnly = profile?.permissions === 'read_only';

    useEffect(() => {
        fetchRequests();
        
        const channel = supabase
            .channel('website_returns_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'website_order_returns' }, () => {
                fetchRequests();
            })
            .subscribe();

        return () => {
            setTimeout(() => {
                if (channel && (channel as any).state !== 'joining') {
                    supabase.removeChannel(channel).catch(() => {});
                }
            }, 100);
        };
    }, []);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('website_order_returns')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setRequests(data || []);
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (id: number, status: string) => {
        const { error } = await supabase
            .from('website_order_returns')
            .update({ status })
            .eq('id', id);
        
        if (error) return showToast(error.message, 'error');
        setRequests(rs => rs.map(r => r.id === id ? { ...r, status: status as any } : r));
        showToast(`Request ${status}!`);
    };

    const filteredRequests = activeTab === 'all' 
        ? requests 
        : requests.filter(r => r.type === activeTab);

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-[11px] font-black uppercase tracking-widest animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Customer Requests</h1>
                        <p className="text-gray-400 font-medium text-xs uppercase tracking-widest">Manage return, exchange, and contact messages.</p>
                    </div>
                    <div className="flex items-center gap-3 bg-white dark:bg-gray-900 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm w-full md:w-auto">
                        <div className="h-9 w-9 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                            <RotateCcw size={18} />
                        </div>
                        <div>
                            <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none mb-1">Active Requests</p>
                            <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300">{requests.length} Submissions</p>
                        </div>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                    {(['all', 'return', 'exchange', 'message'] as const).map((tab) => {
                        const isActive = activeTab === tab;
                        const count = tab === 'all' ? requests.length : requests.filter(r => r.type === tab).length;
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-shrink-0 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${isActive ? 'bg-primary text-white shadow-md' : 'bg-white dark:bg-gray-900 text-gray-400 border border-gray-100 dark:border-gray-800'}`}
                            >
                                {tab} <span className="opacity-60">({count})</span>
                            </button>
                        );
                    })}
                </div>

                {/* Request Feed */}
                <div className="flex items-center gap-2 px-1">
                    <RotateCcw size={14} strokeWidth={1.5} className="text-gray-400" />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Request Feed</h3>
                    <span className="ml-auto text-[10px] font-bold text-gray-300">{filteredRequests.length} visible</span>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Syncing Records...</p>
                    </div>
                ) : filteredRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                        <div className="flex flex-col items-center gap-3 opacity-30">
                            <RotateCcw size={40} strokeWidth={1.5} />
                            <p className="text-xs font-bold uppercase tracking-widest">No matching requests</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredRequests.map((request, idx) => {
                            const cfg = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
                            const isExpanded = expandedId === request.id;
                            const displayIndex = filteredRequests.length - idx;
                            
                            const typeColors = {
                                return: 'bg-rose-50 text-rose-600 border-rose-100',
                                exchange: 'bg-blue-50 text-blue-600 border-blue-100',
                                message: 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            };

                            return (
                                <div 
                                    key={request.id} 
                                    className={`bg-white dark:bg-gray-900 rounded-xl border transition-all overflow-hidden shadow-sm active:scale-[0.99] ${isExpanded ? 'border-primary/30 ring-1 ring-primary/10' : 'border-gray-100 dark:border-gray-800'}`}
                                >
                                    <div 
                                        className="p-4 cursor-pointer"
                                        onClick={() => setExpandedId(isExpanded ? null : request.id)}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black">
                                                    {displayIndex}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wider ${typeColors[request.type]}`}>
                                                    {request.type}
                                                </span>
                                            </div>
                                            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${cfg.color}`}>
                                                {cfg.icon} {cfg.label}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{request.customer_phone}</p>
                                                <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                                    {format(new Date(request.created_at), 'MMM dd, h:mm a')}
                                                    {request.order_number && <span className="ml-2 text-gray-300 font-mono">#{request.order_number}</span>}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {(request.media || []).length > 0 && (
                                                    <div className="flex -space-x-1.5">
                                                        {request.media!.slice(0, 2).map((m, i) => (
                                                            <div key={i} className="w-6 h-6 rounded-md border border-white dark:border-gray-900 overflow-hidden bg-gray-100 shadow-sm">
                                                                <img src={m.url} className="w-full h-full object-cover" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className={`p-1.5 rounded-lg transition-transform duration-300 ${isExpanded ? 'rotate-180 bg-primary/10 text-primary' : 'text-gray-300'}`}>
                                                    <ChevronDown size={16} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-4 pb-5 space-y-5 animate-in slide-in-from-top-4 duration-300 border-t border-gray-50 dark:border-gray-800 pt-5">
                                            {/* Content Layout */}
                                            <div className="space-y-4">
                                                <div className="p-4 bg-gray-50/50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                        <MessageSquare size={12} className="text-primary" /> Submission Context
                                                    </p>
                                                    <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap italic">
                                                        "{request.message}"
                                                    </p>
                                                </div>

                                                <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                                            <Phone size={14} />
                                                        </div>
                                                        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200">{request.customer_phone}</span>
                                                    </div>
                                                    <a href={`tel:${request.customer_phone}`} className="px-3 py-1.5 bg-primary text-white rounded-lg text-[9px] font-black uppercase tracking-widest active:scale-95 transition-transform">
                                                        Call Now
                                                    </a>
                                                </div>

                                                {/* Media Evidence */}
                                                {(request.media || []).length > 0 && (
                                                    <div className="space-y-2">
                                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest ml-1">Evidence Payload</p>
                                                        <div className="grid grid-cols-4 gap-2">
                                                            {request.media!.map((m, i) => (
                                                                <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 bg-gray-50 relative group">
                                                                    <img src={m.url} className="w-full h-full object-cover" />
                                                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                        <ExternalLink size={12} className="text-white" />
                                                                    </div>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Bar */}
                                            <div className="flex gap-2 pt-2">
                                                <button 
                                                    onClick={() => !isReadOnly && updateStatus(request.id, 'approved')}
                                                    disabled={isReadOnly}
                                                    className={`flex-1 py-3 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-blue-600 shadow-blue-600/20'}`}
                                                >
                                                    <Check size={14} /> {isReadOnly ? 'Read Only' : (request.type === 'message' ? 'Process' : 'Approve')}
                                                </button>
                                                <button 
                                                    onClick={() => !isReadOnly && updateStatus(request.id, 'completed')}
                                                    disabled={isReadOnly}
                                                    className={`flex-1 py-3 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-emerald-600 shadow-emerald-600/20'}`}
                                                >
                                                    <Check size={14} /> {isReadOnly ? 'R-ONLY' : 'Resolve'}
                                                </button>
                                                <button 
                                                    onClick={() => !isReadOnly && updateStatus(request.id, 'rejected')}
                                                    disabled={isReadOnly}
                                                    className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center ${isReadOnly ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
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
