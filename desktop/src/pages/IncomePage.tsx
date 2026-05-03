import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { Plus, TrendingUp, AlertCircle, X, ArrowRight, IndianRupee, Check } from 'lucide-react';
import { format } from 'date-fns';

type IncomeEntry = {
    id: string;
    description: string;
    amount: number;
    income_date: string;
    category: 'income' | 'investment' | 'operation';
    created_at: string;
};

export default function IncomePage() {
    const { user, profile } = useAuthStore();
    const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const isReadOnly = profile?.permissions === 'read_only';
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [incomeDate, setIncomeDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [category, setCategory] = useState<'income' | 'investment' | 'operation'>('income');

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('income_entry_draft');
        const savedFormOpen = localStorage.getItem('income_entry_form_open');

        if (savedFormOpen === 'true') setIsFormOpen(true);
        if (savedDraft) {
            try {
                const d = JSON.parse(savedDraft);
                setDescription(d.description || '');
                setAmount(d.amount || 0);
                setIncomeDate(d.incomeDate || format(new Date(), 'yyyy-MM-dd'));
                setCategory(d.category || 'income');
            } catch (e) { console.error('Income draft restore failed'); }
        }
    }, []);

    useEffect(() => {
        if (isFormOpen) {
            const draft = { description, amount, incomeDate, category };
            localStorage.setItem('income_entry_draft', JSON.stringify(draft));
            localStorage.setItem('income_entry_form_open', 'true');
        } else {
            localStorage.removeItem('income_entry_form_open');
        }
    }, [description, amount, incomeDate, category, isFormOpen]);

    const clearDraft = () => {
        localStorage.removeItem('income_entry_draft');
        localStorage.removeItem('income_entry_form_open');
    };

    useEffect(() => {
        fetchIncomeEntries();
    }, []);

    useRealtimeRefresh(
        () => fetchIncomeEntries(),
        {
            channelName: 'income-changes-v2',
            tables: ['income_entries'],
            pollMs: 10000
        }
    );

    const fetchIncomeEntries = async () => {
        const { data } = await supabase
            .from('income_entries')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (data) setIncomeEntries(data as IncomeEntry[]);
    };

    const openEntryForm = () => {
        setDescription('');
        setAmount(0);
        setIncomeDate(format(new Date(), 'yyyy-MM-dd'));
        setCategory('income');
        setIsFormOpen(true);
        setMessage(null);
    };

    const handleAddIncome = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            const { error } = await supabase.from('income_entries').insert([{
                description,
                amount,
                income_date: incomeDate,
                category,
                recorded_by: user.id
            }]);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Income recorded successfully!' });
            clearDraft();
            fetchIncomeEntries();

            setTimeout(() => {
                setIsFormOpen(false);
            }, 800);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-6xl mx-auto space-y-8 pb-24 relative min-h-[80vh]">

                {/* Header Section */}
                <div className="flex items-center justify-between border-b dark:border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Income & Investments</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Inbound Cashflow Ledger</p>
                    </div>

                    <button
                        onClick={() => !isReadOnly && openEntryForm()}
                        disabled={isReadOnly}
                        className={`group relative flex items-center gap-3 px-8 py-4 font-black rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-95 overflow-hidden ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white shadow-green-600/20'}`}
                    >
                        {!isReadOnly && <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>}
                        <Plus size={24} className="relative z-10" />
                        <span className="relative z-10">{isReadOnly ? 'Read Only Mode' : 'Add Income Entry'}</span>
                    </button>
                </div>

                {/* History Section */}
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                <TrendingUp size={20} className="text-gray-500" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-gray-100 font-outfit">Recent Records</h3>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {incomeEntries.length === 0 ? (
                            <div className="py-24 flex flex-col items-center justify-center border-2 border-dashed dark:border-gray-800 rounded-[2rem] bg-gray-50/50 dark:bg-gray-900/20">
                                <TrendingUp size={48} className="text-gray-200 dark:text-gray-800 mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No income records found</p>
                                <button onClick={openEntryForm} className="mt-4 text-green-600 font-black flex items-center gap-2 hover:underline">
                                    Record First Income <ArrowRight size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="hidden md:grid grid-cols-12 gap-5 px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <div className="col-span-3">Date</div>
                                    <div className="col-span-5">Description</div>
                                    <div className="col-span-2 text-right">Amount</div>
                                    <div className="col-span-2 text-right">Type</div>
                                </div>
                                {incomeEntries.map((entry, index) => {
                                    const displayIndex = incomeEntries.length - index;
                                    return (
                                        <div key={entry.id} className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all">
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 px-6 py-4 items-center">
                                                <div className="md:col-span-3 flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-full bg-green-50 dark:bg-green-900/10 text-green-600 flex items-center justify-center text-xs font-black">
                                                        {displayIndex}
                                                    </div>
                                                    <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                        {format(new Date(entry.income_date), 'MMM dd, yyyy')}
                                                    </span>
                                                </div>
                                                <div className="md:col-span-5 min-w-0 pr-2">
                                                    <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                                                        {entry.description}
                                                    </div>
                                                </div>
                                                <div className="md:col-span-2 text-right text-sm font-black text-green-600 font-mono tracking-tight">
                                                    Rs. {Number(entry.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </div>
                                                <div className="md:col-span-2 text-right">
                                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${entry.category === 'investment'
                                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                        : entry.category === 'operation'
                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                            : 'bg-green-50 text-green-700 border-green-200'
                                                        }`}>
                                                        {entry.category}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>

                {/* Form Modal (Matches Stock In Design) */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800">
                            <div className="px-8 py-6 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Record Income</h2>
                                    <p className="text-xs text-gray-400 font-medium">Log inbound cash entry</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-10 w-10 rounded-xl bg-white dark:bg-gray-900 flex items-center justify-center text-gray-400 hover:text-green-500 transition-all shadow-sm border border-gray-100 dark:border-gray-800">
                                    <X size={20} strokeWidth={1.5} />
                                </button>
                            </div>

                            <form onSubmit={handleAddIncome} className="p-8 space-y-6">
                                {message && (
                                    <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                        <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                                            {message.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertCircle size={14} strokeWidth={3} />}
                                        </div>
                                        {message.text}
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
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-green-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Category</label>
                                        <select
                                            required
                                            value={category}
                                            onChange={e => setCategory(e.target.value as any)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-green-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        >
                                            <option value="income">Income</option>
                                            <option value="investment">Investment</option>
                                            <option value="operation">Operation</option>
                                        </select>
                                    </div>

                                    <div className="col-span-full space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Amount (Rs.)</label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-green-600 transition-colors">
                                                <IndianRupee size={16} strokeWidth={1.5} />
                                            </div>
                                            <input
                                                required
                                                type="number"
                                                step="1"
                                                min="1"
                                                value={amount || ''}
                                                onChange={e => setAmount(Number(e.target.value))}
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-green-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 outline-none transition-all"
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
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-green-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                            placeholder="Describe the income or investment..."
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
                                        className="flex-[2] py-3 px-6 bg-green-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-green-600/20 hover:bg-green-700 transition-all active:scale-[0.98] disabled:opacity-50"
                                    >
                                        {loading ? 'Processing...' : 'Confirm Income'}
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
