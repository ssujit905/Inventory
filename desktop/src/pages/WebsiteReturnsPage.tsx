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
    order_id: number;
    order_number: string;
    customer_phone: string;
    type: 'return' | 'exchange';
    message: string;
    media: { url: string; type: string }[];
    status: 'pending' | 'approved' | 'rejected' | 'completed';
    created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'New Request', color: 'bg-amber-50 text-amber-600 border-amber-200', icon: <Clock size={12} /> },
    approved: { label: 'Approved', color: 'bg-blue-50 text-blue-600 border-blue-200', icon: <Check size={12} /> },
    rejected: { label: 'Rejected', color: 'bg-rose-50 text-rose-600 border-rose-200', icon: <X size={12} /> },
    completed: { label: 'Resolved', color: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: <Check size={12} /> },
};

export default function WebsiteReturnsPage() {
    const { profile } = useAuthStore();
    const [requests, setRequests] = useState<ReturnRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchRequests();
        
        const channel = supabase
            .channel('website_returns_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'website_order_returns' }, () => {
                fetchRequests();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
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

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {/* Global Toast Notification — Always at the top-right! */}
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
                            <RotateCcw size={22} className="text-primary" /> Return & Exchange Requests
                        </h1>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-1">Manage return and exchange claims from customers</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{requests.length}</p>
                        <p className="text-xs text-gray-400 uppercase tracking-widest">Total Requests</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                ) : requests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 gap-4">
                        <RotateCcw size={48} className="text-gray-200 dark:text-gray-700" />
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No requests found</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {requests.map(request => {
                            const cfg = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
                            const isExpanded = expandedId === request.id;
                            
                            return (
                                <div key={request.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-all">
                                    <div 
                                        className="flex items-center gap-4 p-4 cursor-pointer"
                                        onClick={() => setExpandedId(isExpanded ? null : request.id)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-black text-gray-500 dark:text-gray-400 font-mono">#{request.order_number}</span>
                                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${request.type === 'return' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                    {request.type}
                                                </span>
                                                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black ${cfg.color}`}>
                                                    {cfg.icon} {cfg.label}
                                                </span>
                                            </div>
                                            <p className="font-bold text-gray-900 dark:text-gray-100 text-sm mt-1 truncate">{request.customer_phone}</p>
                                            <p className="text-xs text-gray-400">{format(new Date(request.created_at), 'MMM d, yyyy · h:mm a')}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {request.media?.length > 0 && (
                                                <div className="flex -space-x-2">
                                                    {request.media.slice(0, 3).map((m, i) => (
                                                        <div key={i} className="w-8 h-8 rounded-lg border-2 border-white dark:border-gray-900 overflow-hidden bg-gray-100">
                                                            <img src={m.url} className="w-full h-full object-cover" />
                                                        </div>
                                                    ))}
                                                    {request.media.length > 3 && (
                                                        <div className="w-8 h-8 rounded-lg border-2 border-white dark:border-gray-900 bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                                            +{request.media.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {isExpanded ? <ChevronUp size={18} className="text-gray-400 ml-2" /> : <ChevronDown size={18} className="text-gray-400 ml-2" />}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="border-t border-gray-100 dark:border-gray-800 p-5 space-y-6">
                                            {/* Content */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                                <div className="space-y-4">
                                                    <div>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                            <MessageSquare size={12} /> Reason for {request.type}
                                                        </p>
                                                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                                                            {request.message}
                                                        </div>
                                                    </div>
                                                    
                                                    <div>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                            <Phone size={12} /> Customer Contact
                                                        </p>
                                                        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                                                            <span className="font-bold text-gray-700 dark:text-gray-200">{request.customer_phone}</span>
                                                            <a href={`tel:${request.customer_phone}`} className="p-2 bg-primary text-white rounded-lg hover:opacity-90">
                                                                <Phone size={14} />
                                                            </a>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-4">
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                                        <ImageIcon size={12} /> Evidence Photos
                                                    </p>
                                                    {request.media?.length > 0 ? (
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {request.media.map((m, i) => (
                                                                <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200 dark:border-gray-700 group relative">
                                                                    <img src={m.url} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                        <ExternalLink size={16} className="text-white" />
                                                                    </div>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="h-24 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border-2 border-dashed border-gray-100 dark:border-gray-800 flex items-center justify-center text-gray-400 text-xs font-bold">
                                                            No photos uploaded
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Bar */}
                                            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
                                                <button 
                                                    onClick={() => updateStatus(request.id, 'approved')}
                                                    className="flex-1 min-w-[120px] bg-blue-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <Check size={14} /> Approve Request
                                                </button>
                                                <button 
                                                    onClick={() => updateStatus(request.id, 'completed')}
                                                    className="flex-1 min-w-[120px] bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <Check size={14} /> Mark Resolved
                                                </button>
                                                <button 
                                                    onClick={() => updateStatus(request.id, 'rejected')}
                                                    className="flex-1 min-w-[120px] bg-gray-100 text-gray-600 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <X size={14} /> Reject Request
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
