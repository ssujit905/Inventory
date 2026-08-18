import { useState, useEffect, useRef } from 'react';
import { supabase, supabaseWithTimeout } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { getVendorId } from '../lib/vendorHelpers';
import { Plus, IndianRupee, AlertCircle, X, History, ArrowRight, TrendingUp, Pencil } from 'lucide-react';
import { format } from 'date-fns';

type IncomeEntry = {
    id: string;
    description: string;
    amount: number;
    income_date: string;
    category: 'income' | 'investment' | 'operation';
    created_at: string;
    recorded_by?: string;
};

export default function IncomePage() {
    const { user, profile } = useAuthStore();
    const isReadOnly = profile?.permissions === 'read_only';
    const isStaff = profile?.role === 'staff';

    // UI State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);

    // Form Fields
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [incomeDate, setIncomeDate] = useState('');
    const [category, setCategory] = useState<'income' | 'investment' | 'operation'>('income');

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const canEditEntry = (entry: IncomeEntry) =>
        !isReadOnly && profile?.role === 'vendor';

    // When the WebView is backgrounded, in-flight requests can hang forever.
    // Abort any pending submit as soon as the user returns so the button never spins indefinitely.
    const activeSubmitRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const handleResume = () => {
            activeSubmitRef.current?.abort();
            activeSubmitRef.current = null;
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') handleResume();
        };
        window.addEventListener('focus', handleResume);
        window.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('focus', handleResume);
            window.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('vendor_income_draft');
        const savedFormOpen = localStorage.getItem('vendor_income_form_open');

        if (savedFormOpen === 'true') setIsFormOpen(true);
        if (savedDraft) {
            try {
                const d = JSON.parse(savedDraft);
                setDescription(d.description || '');
                setAmount(d.amount || 0);
                setIncomeDate(d.incomeDate || '');
                setCategory(d.category || 'income');
            } catch (e) { console.error('Vendor Income draft restore failed'); }
        }
    }, []);

    useEffect(() => {
        if (isFormOpen) {
            const draft = { description, amount, incomeDate, category };
            localStorage.setItem('vendor_income_draft', JSON.stringify(draft));
            localStorage.setItem('vendor_income_form_open', 'true');
        } else {
            localStorage.removeItem('vendor_income_form_open');
        }
    }, [description, amount, incomeDate, category, isFormOpen]);

    const clearDraft = () => {
        localStorage.removeItem('vendor_income_draft');
        localStorage.removeItem('vendor_income_form_open');
    };

    useEffect(() => {
        fetchIncomeEntries();
    }, []);

    useRealtimeRefresh(
        () => fetchIncomeEntries(),
        {
            channelName: 'vendor-income-changes-v2',
            tables: ['income_entries'],
            pollMs: 10000
        }
    );

    const fetchIncomeEntries = async () => {
        let query = supabase.from('income_entries').select('*');
        const vendorId = getVendorId(profile);
        if (vendorId) {
            const { data: members } = await supabase
                .from('profiles')
                .select('id')
                .or(`id.eq.${vendorId},vendor_id.eq.${vendorId}`);
            const memberIds = (members || []).map((m: any) => m.id);
            if (memberIds.length > 0) {
                query = query.in('recorded_by', memberIds);
            } else {
                query = query.eq('recorded_by', profile?.id);
            }
        }
        if (isStaff) {
            query = query.eq('category', 'income');
        }
        const { data, error } = await supabaseWithTimeout(query
            .order('created_at', { ascending: false })
            .limit(15));

        if (error) {
            console.error('Error fetching income entries:', error);
            return;
        }

        if (data) setIncomeEntries(data);
    };

    const openEntryForm = () => {
        setEditingId(null);
        setDescription('');
        setAmount(0);
        setIncomeDate(format(new Date(), 'yyyy-MM-dd'));
        setCategory('income');
        setIsFormOpen(true);
        setMessage(null);
    };

    const openEditEntry = (entry: IncomeEntry) => {
        setEditingId(entry.id);
        setDescription(entry.description);
        setAmount(entry.amount);
        setIncomeDate((entry.income_date || '').slice(0, 10) || format(new Date(), 'yyyy-MM-dd'));
        setCategory(entry.category);
        setIsFormOpen(true);
        setMessage(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        const controller = new AbortController();
        activeSubmitRef.current = controller;

        try {
            if (editingId) {
                const { error } = await supabaseWithTimeout(
                    supabase
                        .from('income_entries')
                        .update({ description, amount, income_date: incomeDate, category })
                        .eq('id', editingId)
                        .abortSignal(controller.signal)
                );
                if (error) throw error;
                setMessage({ type: 'success', text: 'Income entry updated successfully!' });
            } else {
                const { error } = await supabaseWithTimeout(
                    supabase.from('income_entries').insert([{
                        description,
                        amount,
                        income_date: incomeDate,
                        category,
                        recorded_by: user.id
                    }])
                    .abortSignal(controller.signal)
                );
                if (error) throw error;
                setMessage({ type: 'success', text: 'Income recorded successfully!' });
            }

            clearDraft();

            // Immediate UI update
            await supabaseWithTimeout(fetchIncomeEntries());

            setTimeout(() => {
                setIsFormOpen(false);
            }, 800);

        } catch (error: any) {
            if (error?.name === 'AbortError') {
                setMessage({ type: 'error', text: 'Submission interrupted when you left the app. Please try again.' });
            } else if (error?.message === 'NETWORK_TIMEOUT') {
                setMessage({ type: 'error', text: 'Network timeout. Check your connection and try again.' });
            } else {
                setMessage({ type: 'error', text: error.message });
            }
        } finally {
            if (activeSubmitRef.current === controller) activeSubmitRef.current = null;
            setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'vendor' ? 'admin' : 'staff'}>
            <div className="px-5 max-w-6xl mx-auto space-y-8 pb-24 relative min-h-[80vh]">

                {/* Header Section */}
                <div className="flex flex-col gap-4 border-b dark:border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Income & Investments</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Inbound Cashflow Ledger</p>
                    </div>

                    <button
                        onClick={() => !isReadOnly && openEntryForm()}
                        disabled={isReadOnly}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 w-full sm:w-auto ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                    >
                        <Plus size={16} strokeWidth={2.5} />
                        {isReadOnly ? 'Read Only Mode' : 'Add Income Entry'}
                    </button>
                </div>

                {/* History Section */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                <History size={20} className="text-gray-500" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 font-outfit">Recent Records</h3>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {incomeEntries.length === 0 ? (
                            <div className="py-24 flex flex-col items-center justify-center border-2 border-dashed dark:border-gray-800 rounded-[2rem] bg-gray-50/50 dark:bg-gray-900/20">
                                <TrendingUp size={48} className="text-gray-200 dark:text-gray-800 mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No income records found</p>
                                <button onClick={openEntryForm} className="mt-4 text-emerald-600 font-black flex items-center gap-2 hover:underline">
                                    Record First Income <ArrowRight size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                {incomeEntries.map((entry, index) => {
                                    const displayIndex = incomeEntries.length - index;
                                    return (
                                        <div key={entry.id} className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 flex items-center justify-center text-xs font-black">
                                                {displayIndex}
                                            </div>
                                            <div className="flex flex-col gap-2 pl-12 pr-4 py-4">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                        {format(new Date(entry.income_date), 'MMM dd, yyyy')}
                                                    </span>
                                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${entry.category === 'investment'
                                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                        : entry.category === 'operation'
                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        }`}>
                                                        {entry.category}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                                                    {entry.description}
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-left text-sm font-black text-emerald-600 font-mono tracking-tight">
                                                        Rs. {Number(entry.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </div>
                                                    {canEditEntry(entry) && (
                                                        <button
                                                            onClick={() => openEditEntry(entry)}
                                                            title="Edit entry"
                                                            className="h-7 w-7 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-emerald-600 hover:border-emerald-300 transition-all opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Pencil size={12} strokeWidth={1.5} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>

                {/* Form Modal */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800">
                            <div className="px-8 py-6 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editingId ? 'Edit Income Entry' : 'Record Income'}</h2>
                                    <p className="text-xs text-gray-400 font-medium">Log inbound cashflow record</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-10 w-10 rounded-xl bg-white dark:bg-gray-900 flex items-center justify-center text-gray-400 hover:text-emerald-500 transition-all shadow-sm border border-gray-100 dark:border-gray-800">
                                    <X size={20} strokeWidth={1.5} />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                                {message && (
                                    <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                        <AlertCircle size={16} /> {message.text}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Income Date</label>
                                        <input
                                            required
                                            type="date"
                                            value={incomeDate}
                                            onChange={e => setIncomeDate(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-emerald-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Category</label>
                                        <select
                                            required
                                            value={category}
                                            onChange={e => setCategory(e.target.value as any)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-emerald-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        >
                                            <option value="income">Income</option>
                                            {!isStaff && <option value="investment">Investment</option>}
                                            {!isStaff && <option value="operation">Operation</option>}
                                        </select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Amount (Rs.)</label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-600 transition-colors">
                                                <IndianRupee size={16} strokeWidth={1.5} />
                                            </div>
                                            <input
                                                required
                                                type="number"
                                                step="1"
                                                min="1"
                                                value={amount || ''}
                                                onChange={e => setAmount(Number(e.target.value))}
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-emerald-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 outline-none transition-all"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>

                                    <div className="col-span-full space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Details</label>
                                        <textarea
                                            required
                                            rows={2}
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-emerald-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                            placeholder="Describe the income..."
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="flex-1 py-3 px-6 bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-500 rounded-xl text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-[2] py-3 px-6 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-[0.98] disabled:opacity-50"
                                    >
                                        {loading ? 'Processing...' : editingId ? 'Save Changes' : 'Confirm Income'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>
        </DashboardLayout>
    );
}