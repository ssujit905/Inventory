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
            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Income & Investments</h1>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Inbound Cashflow Ledger</p>
                    </div>

                    <button
                        onClick={() => !isReadOnly && openEntryForm()}
                        disabled={isReadOnly}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 w-full sm:w-auto ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                    >
                        <Plus size={16} strokeWidth={2.5} />
                        {isReadOnly ? 'Read Only Mode' : 'Record Income'}
                    </button>
                </div>

                {/* History Section */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 px-1">
                        <TrendingUp size={14} strokeWidth={1.5} className="text-gray-400" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Recent Records</h3>
                        <span className="ml-auto text-[10px] font-bold text-gray-300">{incomeEntries.length} records</span>
                    </div>

                    <div className="space-y-2.5">
                        {incomeEntries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800">
                                <div className="flex flex-col items-center gap-3 opacity-30">
                                    <TrendingUp size={40} strokeWidth={1.5} />
                                    <p className="text-xs font-bold uppercase tracking-widest text-center">No income records found</p>
                                </div>
                                <button onClick={openEntryForm} className="mt-4 text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2 hover:underline">
                                    Record First Entry <ArrowRight size={14} />
                                </button>
                            </div>
                        ) : (
                            <>
                                {incomeEntries.map((entry, index) => {
                                    const displayIndex = incomeEntries.length - index;
                                    return (
                                        <div key={entry.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden active:scale-[0.99] transition-all">
                                            <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center text-[10px] font-black flex-shrink-0">
                                                        {displayIndex}
                                                    </span>
                                                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                                        {format(new Date(entry.income_date), 'MMM dd, yyyy')}
                                                    </span>
                                                </div>
                                                <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${entry.category === 'investment'
                                                    ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/10 dark:border-blue-800'
                                                    : entry.category === 'operation'
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800'
                                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-800'
                                                    }`}>
                                                    {entry.category}
                                                </span>
                                            </div>

                                            <div className="px-3.5 pb-3 flex items-center justify-between gap-4">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                                                        {entry.description}
                                                    </p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Amount</p>
                                                    <p className="text-sm font-black text-emerald-600 font-mono tracking-tight">
                                                        Rs. {Number(entry.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </p>
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
                    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-gray-950/40 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-100 dark:border-gray-800 max-h-[92svh] flex flex-col">
                            <div className="px-5 py-4 sm:px-8 sm:py-6 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50 flex-shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Income Entry</h2>
                                    <p className="text-xs text-gray-400 font-medium">Record inbound cashflow</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-10 w-10 rounded-xl bg-white dark:bg-gray-900 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all shadow-sm border border-gray-100 dark:border-gray-800">
                                    <X size={20} strokeWidth={1.5} />
                                </button>
                            </div>

                            <form onSubmit={handleAddIncome} className="p-5 sm:p-8 space-y-5 sm:space-y-6 overflow-y-auto custom-scrollbar flex-1">
                                {message && (
                                    <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-3 animate-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                        {message.type === 'success' ? <Check size={16} strokeWidth={3} /> : <AlertCircle size={16} strokeWidth={1.5} />}
                                        {message.text}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Entry Date</label>
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
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-emerald-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            <option value="income">Income</option>
                                            <option value="investment">Investment</option>
                                            <option value="operation">Operation</option>
                                        </select>
                                    </div>

                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Details</label>
                                        <textarea
                                            required
                                            rows={2}
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-emerald-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                            placeholder="Source of income, investment details..."
                                        />
                                    </div>

                                    <div className="col-span-2 space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Amount (Rs.)</label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-emerald-600 transition-colors">
                                                <IndianRupee size={18} strokeWidth={1.5} />
                                            </div>
                                            <input
                                                required
                                                type="number"
                                                value={amount || ''}
                                                onChange={e => setAmount(Number(e.target.value))}
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-emerald-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-lg font-black text-emerald-600 outline-none transition-all"
                                                placeholder="0"
                                            />
                                        </div>
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
                                        {loading ? 'Recording...' : 'Confirm Entry'}
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
