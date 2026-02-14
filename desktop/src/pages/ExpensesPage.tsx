import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { Plus, DollarSign, AlertCircle, X, History, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

type Expense = {
    id: string;
    description: string;
    amount: number;
    expense_date: string;
    category: 'ads' | 'packaging' | 'other';
    created_at: string;
};

export default function ExpensesPage() {
    const { user, profile } = useAuthStore();

    // UI State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [expenses, setExpenses] = useState<Expense[]>([]);

    // Form Fields
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [expenseDate, setExpenseDate] = useState('');
    const [category, setCategory] = useState<'ads' | 'packaging' | 'other'>('other');

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetchExpenses();
    }, []);

    useRealtimeRefresh(
        () => fetchExpenses(),
        {
            channelName: 'expenses-changes-v2',
            tables: ['expenses'],
            pollMs: 10000
        }
    );

    const fetchExpenses = async () => {
        const { data } = await supabase
            .from('expenses')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(15);

        if (data) setExpenses(data);
    };

    const openEntryForm = () => {
        setDescription('');
        setAmount(0);
        setExpenseDate(format(new Date(), 'yyyy-MM-dd'));
        setCategory('other');
        setIsFormOpen(true);
        setMessage(null);
    };

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            const { error } = await supabase.from('expenses').insert([{
                description,
                amount,
                expense_date: expenseDate,
                category,
                recorded_by: user.id
            }]);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Expense recorded successfully!' });

            // Immediate UI update
            fetchExpenses();

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
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Business Expenses</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Operational Expenditure Ledger</p>
                    </div>

                    <button
                        onClick={openEntryForm}
                        className="group relative flex items-center gap-3 px-8 py-4 bg-red-600 text-white font-black rounded-2xl shadow-xl shadow-red-600/25 transition-all hover:scale-[1.02] active:scale-95 overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <Plus size={24} className="relative z-10" />
                        <span className="relative z-10">Add New Expense</span>
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
                        {expenses.length === 0 ? (
                            <div className="py-24 flex flex-col items-center justify-center border-2 border-dashed dark:border-gray-800 rounded-[2rem] bg-gray-50/50 dark:bg-gray-900/20">
                                <DollarSign size={48} className="text-gray-200 dark:text-gray-800 mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No expense records found</p>
                                <button onClick={openEntryForm} className="mt-4 text-red-600 font-black flex items-center gap-2 hover:underline">
                                    Record First Expense <ArrowRight size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <div className="col-span-3">Date</div>
                                    <div className="col-span-6">Description</div>
                                    <div className="col-span-2 text-right">Amount</div>
                                    <div className="col-span-1 text-right">Type</div>
                                </div>
                                {expenses.map((exp, index) => {
                                    const displayIndex = expenses.length - index;
                                    return (
                                        <div key={exp.id} className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all">
                                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 items-center">
                                                <div className="md:col-span-3 flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-full bg-red-50 dark:bg-red-900/10 text-red-600 flex items-center justify-center text-xs font-black">
                                                        {displayIndex}
                                                    </div>
                                                    <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                        {format(new Date(exp.expense_date), 'MMM dd, yyyy')}
                                                    </span>
                                                </div>
                                                <div className="md:col-span-6 min-w-0">
                                                    <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                                                        {exp.description}
                                                    </div>
                                                </div>
                                                <div className="md:col-span-2 text-right text-sm font-black text-red-600 font-mono tracking-tight">
                                                    ${Number(exp.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </div>
                                                <div className="md:col-span-1 text-right">
                                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${exp.category === 'ads'
                                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                        : exp.category === 'packaging'
                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                            : 'bg-slate-50 text-slate-700 border-slate-200'
                                                        }`}>
                                                        {exp.category}
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

                {/* Form Modal */}
                {isFormOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-white/5 max-h-[85vh] flex flex-col">
                            <div className="p-10 border-b dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-red-600/10 to-transparent">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 dark:text-gray-100 font-outfit flex items-center gap-3">
                                        <div className="p-2 bg-red-600 text-white rounded-xl shadow-lg shadow-red-600/30">
                                            <Plus size={20} />
                                        </div>
                                        Record Expense
                                    </h2>
                                    <p className="text-xs text-gray-500 font-bold uppercase tracking-[0.2em] mt-2">Financial Outflow Entry</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-12 w-12 flex items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-500 hover:text-red-500 transition-all">
                                    <X size={24} />
                                </button>
                            </div>

                            <form onSubmit={handleAddExpense} className="p-10 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                                {message && (
                                    <div className={`p-5 rounded-2xl text-sm font-black flex items-center gap-3 animate-in slide-in-from-left-4 ${message.type === 'success' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                                        <AlertCircle size={20} /> {message.text}
                                    </div>
                                )}

                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Expense Date <span className="text-red-500">*</span></label>
                                        <input
                                            required
                                            type="date"
                                            value={expenseDate}
                                            onChange={e => setExpenseDate(e.target.value)}
                                            className="w-full h-14 px-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-red-600/50 font-black text-gray-900 dark:text-gray-100"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Expense Details <span className="text-red-500">*</span></label>
                                        <textarea
                                            required
                                            rows={3}
                                            value={description}
                                            onChange={e => setDescription(e.target.value)}
                                            className="w-full p-5 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-red-600/50 font-medium transition-all text-gray-900 dark:text-gray-100"
                                            placeholder="What was this expense for?"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Expense Type <span className="text-red-500">*</span></label>
                                        <select
                                            required
                                            value={category}
                                            onChange={e => setCategory(e.target.value as 'ads' | 'packaging' | 'other')}
                                            className="w-full h-14 px-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-red-600/50 font-black text-gray-900 dark:text-gray-100"
                                        >
                                            <option value="other">Other</option>
                                            <option value="ads">Ads</option>
                                            <option value="packaging">Packaging</option>
                                        </select>
                                    </div>

                                    <div className="space-y-3">
                                        <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.1em]">Amount ($) <span className="text-red-500">*</span></label>
                                        <div className="relative">
                                            <DollarSign className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-300" />
                                            <input
                                                required
                                                type="number"
                                                step="1"
                                                min="1"
                                                value={amount || ''}
                                                onChange={e => setAmount(Number(e.target.value))}
                                                className="w-full h-16 pl-14 pr-6 bg-gray-50 dark:bg-gray-800 border-2 dark:border-gray-800 rounded-2xl outline-none focus:border-red-600/50 font-black text-2xl text-red-600 transition-all text-gray-900 dark:text-gray-100"
                                                placeholder="0"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 flex gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="h-16 px-10 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-black rounded-2xl transition-all hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="flex-1 h-16 bg-red-600 text-white font-black rounded-2xl shadow-xl shadow-red-600/30 transition-all hover:scale-[1.01] hover:bg-red-700 active:scale-95 disabled:opacity-50"
                                    >
                                        {loading ? 'Recording...' : 'Confirm Expense'}
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
