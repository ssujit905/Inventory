import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import {
    RotateCcw, Loader2, ChevronDown, ChevronUp,
    Check, X, Clock, AlertTriangle, Phone, ExternalLink, Image as ImageIcon, MessageSquare, Search
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
    pending: { label: 'New Request', color: 'bg-amber-500 text-white border-amber-600', icon: <Clock size={12} /> },
    approved: { label: 'Approved', color: 'bg-blue-500 text-white border-blue-600', icon: <Check size={12} /> },
    rejected: { label: 'Rejected', color: 'bg-rose-500 text-white border-rose-600', icon: <X size={12} /> },
    completed: { label: 'Resolved', color: 'bg-emerald-500 text-white border-emerald-600', icon: <Check size={12} /> },
};

export default function WebsiteReturnsPage() {
    const { profile } = useAuthStore();
    const [requests, setRequests] = useState<ReturnRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

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

    const filteredRequests = requests.filter(r => 
        r.order_number.toLowerCase().includes(searchQuery.toLowerCase()) || 
        r.customer_phone.includes(searchQuery)
    );

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {toast && (
                <div className={`fixed top-4 left-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    {toast.msg}
                </div>
            )}

            <div className="space-y-6 pb-20">
                <div className="flex flex-col gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                             Return Center
                        </h1>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Website Order Claims</p>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by Order ID or Phone..." 
                            className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                ) : filteredRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 gap-4">
                        <RotateCcw size={48} className="text-gray-200 dark:text-gray-700" />
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest text-sm">No return requests found</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredRequests.map(request => {
                            const cfg = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending;
                            const isExpanded = expandedId === request.id;
                            
                            return (
                                <div key={request.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm transition-all">
                                    <div 
                                        className="p-4 cursor-pointer"
                                        onClick={() => setExpandedId(isExpanded ? null : request.id)}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${cfg.color}`}>
                                                        {cfg.label}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase ${request.type === 'return' ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600'}`}>
                                                        {request.type}
                                                    </span>
                                                </div>
                                                <p className="font-black text-gray-900 dark:text-gray-100 text-sm">#{request.order_number}</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">{format(new Date(request.created_at), 'MMM dd, yyyy')}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                {request.media?.length > 0 && (
                                                    <div className="flex -space-x-2">
                                                        {request.media.slice(0, 3).map((m, i) => (
                                                            <div key={i} className="w-8 h-8 rounded-lg border-2 border-white dark:border-gray-950 overflow-hidden bg-gray-100">
                                                                <img src={m.url} className="w-full h-full object-cover" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {isExpanded ? <ChevronUp size={18} className="text-gray-300" /> : <ChevronDown size={18} className="text-gray-300" />}
                                            </div>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="border-t border-gray-100 dark:border-gray-800 p-5 space-y-6 bg-gray-50/50 dark:bg-gray-900/50">
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Customer Message</label>
                                                    <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-100 dark:border-gray-800 leading-relaxed shadow-sm">
                                                        {request.message}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-2xl border border-gray-100 dark:border-gray-800">
                                                    <div className="flex flex-col">
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Phone</span>
                                                        <span className="font-black text-sm text-gray-700 dark:text-gray-200">{request.customer_phone}</span>
                                                    </div>
                                                    <a href={`tel:${request.customer_phone}`} className="h-10 w-10 bg-primary text-white rounded-xl flex items-center justify-center">
                                                        <Phone size={16} />
                                                    </a>
                                                </div>
                                                
                                                {request.media?.length > 0 && (
                                                    <div>
                                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Photos</label>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {request.media.map((m, i) => (
                                                                <a key={i} href={m.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-xl overflow-hidden bg-white border border-gray-100 dark:border-gray-800">
                                                                    <img src={m.url} className="w-full h-full object-cover" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
                                                <div className="flex gap-2">
                                                    <button onClick={() => updateStatus(request.id, 'approved')} className="flex-1 h-12 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Approve</button>
                                                    <button onClick={() => updateStatus(request.id, 'completed')} className="flex-1 h-12 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Resolve</button>
                                                </div>
                                                <button onClick={() => updateStatus(request.id, 'rejected')} className="w-full h-12 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl text-[10px] font-black uppercase tracking-widest">Reject Claim</button>
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
