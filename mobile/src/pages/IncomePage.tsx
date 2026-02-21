import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { Plus, TrendingUp, AlertCircle, X, ArrowRight, IndianRupee } from 'lucide-react';
import { format } from 'date-fns';

type IncomeEntry = {
    id: string;
    description: string;
    amount: number;
    income_date: string;
    category: 'income' | 'investment';
    created_at: string;
};

export default function IncomePage() {
    const { user, profile } = useAuthStore();
    const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [incomeDate, setIncomeDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [category, setCategory] = useState<'income' | 'investment'>('income');

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
            <div className="max-w-6xl mx-auto space-y-8 pb-24 relative min-h-[80vh]">

                {/* Header Section */}
                <div className="flex flex-col gap-4 border-b dark:border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Income & Investments</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Inbound Cashflow Ledger</p>
                    </div>

                    <button
                        onClick={openEntryForm}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition-all shadow-sm active:scale-95 w-full sm:w-auto"
                    >
                        <Plus size={16} strokeWidth={2.5} />
                        Add Income Entry
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
                                {incomeEntries.map((entry, index) => {
                                    const displayIndex = incomeEntries.length - index;
                                    return (
                                        <div key={entry.id} className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-green-50 dark:bg-green-900/10 text-green-600 flex items-center justify-center text-xs font-black">
                                                {displayIndex}
                                            </div>
                                            <div className="flex flex-col gap-2 pl-12 pr-4 py-4">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                        {format(new Date(entry.income_date), 'MMM dd, yyyy')}
                                                    </span>
                                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${entry.category === 'investment'
                                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                        : 'bg-green-50 text-green-700 border-green-200'
                                                        }`}>
                                                        {entry.category}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                                                    {entry.description}
                                                </div>
                                                <div className="text-left text-sm font-black text-green-600 font-mono tracking-tight">
                                                    Rs. {Number(entry.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-2 sm:p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/5 flex flex-col max-h-[92svh]">
                            <div className="p-5 sm:p-8 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-green-600/10 to-transparent flex-shrink-0">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 font-outfit flex items-center gap-3">
                                        <div className="p-2 bg-green-600 text-white rounded-xl shadow-lg shadow-green-600/30">
                                            <Plus size={20} />
                                        </div>
                                        Record Income
                                    </h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mt-2">Inbound Cash Entry</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-12 w-12 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-500 hover:text-red-500 transition-all">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleAddIncome} className="p-5 sm:p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                                {message && (
                                    <div className={`p-5 rounded-2xl text-sm font-black flex items-center gap-3 animate-in slide-in-from-left-4 ${message.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                                        <AlertCircle size={20} /> {message.text}
                                    </div>
                                )}

                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Income Date <span className="text-red-500">*</span></label>
                                        <input
                                            required
                                            type="date"
                                            value={incomeDate}
                                            onChange={e => setIncomeDate(e.target.value)}
                                            className="w-full h-14 px-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-green-600/50 font-black text-gray-900 dark:text-gray-100"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Type <span className="text-red-500">*</span></label>
                                        <select
                                            required
                                            value={category}
                                            onChange={e => setCategory(e.target.value as any)}
                                            className="w-full h-14 px-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-green-600/50 font-black text-gray-900 dark:text-gray-100"
                                        >
                                            <option value="income">Income</option>
                                            <option value="investment">Investment</option>
                                        </select>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Details <span className="text-red-500">*</span></label>
                                        <textarea
                                            required
                                            rows={3}
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            className="w-full p-5 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-green-600/50 font-medium transition-all text-gray-900 dark:text-gray-100"
                                            placeholder="Describe the income or investment..."
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Amount (Rs.) <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <IndianRupee className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-300" />
                                            <input
                                                required
                                                type="number"
                                                step="1"
                                                min="1"
                                                value={amount || ''}
                                                onChange={e => setAmount(Number(e.target.value))}
                                                className="w-full h-16 pl-14 pr-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-green-600/50 font-black text-2xl text-green-600 transition-all text-gray-900 dark:text-gray-100"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 flex flex-col gap-4">
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="h-14 bg-green-600 text-white font-black rounded-2xl shadow-xl shadow-green-600/30 transition-all hover:scale-[1.01] hover:bg-green-700 active:scale-95 disabled:opacity-50"
                                    >
                                        {loading ? 'Recording...' : 'Confirm Income'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="h-14 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-black rounded-2xl transition-all hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95"
                                    >
                                        Cancel
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
