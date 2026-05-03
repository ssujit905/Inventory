import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';
import { Plus, IndianRupee, AlertCircle, X, History, ArrowRight } from 'lucide-react';
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
    const isReadOnly = profile?.permissions === 'read_only';

    // UI State
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [expenses, setExpenses] = useState<Expense[]>([]);

    // Form Fields
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState<number>(0);
    const [expenseDate, setExpenseDate] = useState('');
    const [category, setCategory] = useState<'ads' | 'packaging' | 'other'>('other');
    const [packagingQuantity, setPackagingQuantity] = useState<number>(0);

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('mobile_expense_draft');
        const savedFormOpen = localStorage.getItem('mobile_expense_form_open');

        if (savedFormOpen === 'true') setIsFormOpen(true);
        if (savedDraft) {
            try {
                const d = JSON.parse(savedDraft);
                setDescription(d.description || '');
                setAmount(d.amount || 0);
                setExpenseDate(d.expenseDate || '');
                setCategory(d.category || 'other');
                setPackagingQuantity(d.packagingQuantity || 0);
            } catch (e) { console.error('Mobile Expenses draft restore failed'); }
        }
    }, []);

    useEffect(() => {
        if (isFormOpen) {
            const draft = { description, amount, expenseDate, category, packagingQuantity };
            localStorage.setItem('mobile_expense_draft', JSON.stringify(draft));
            localStorage.setItem('mobile_expense_form_open', 'true');
        } else {
            localStorage.removeItem('mobile_expense_form_open');
        }
    }, [description, amount, expenseDate, category, packagingQuantity, isFormOpen]);

    const clearDraft = () => {
        localStorage.removeItem('mobile_expense_draft');
        localStorage.removeItem('mobile_expense_form_open');
    };

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
        setPackagingQuantity(0);
        setIsFormOpen(true);
        setMessage(null);
    };

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);

        try {
            if (category === 'packaging' && packagingQuantity < 1) {
                setMessage({ type: 'error', text: 'Please enter packaging quantity.' });
                setLoading(false);
                return;
            }

            const finalDescription = category === 'packaging'
                ? `Qty: ${packagingQuantity} | ${description}`
                : description;

            const { error } = await supabase.from('expenses').insert([{
                description: finalDescription,
                amount,
                expense_date: expenseDate,
                category,
                recorded_by: user.id
            }]);

            if (error) throw error;

            setMessage({ type: 'success', text: 'Expense recorded successfully!' });
            clearDraft();

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
            <div className="px-5 max-w-6xl mx-auto space-y-8 pb-24 relative min-h-[80vh]">

                {/* Header Section */}
                <div className="flex flex-col gap-4 border-b dark:border-gray-800 pb-6">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tight">Business Expenses</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1 uppercase tracking-widest">Operational Expenditure Ledger</p>
                    </div>

                    <button
                        onClick={() => !isReadOnly && openEntryForm()}
                        disabled={isReadOnly}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 w-full sm:w-auto ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                    >
                        <Plus size={16} strokeWidth={2.5} />
                        {isReadOnly ? 'Read Only Mode' : 'Add New Expense'}
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
                                <IndianRupee size={48} className="text-gray-200 dark:text-gray-800 mb-4" />
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No expense records found</p>
                                <button onClick={openEntryForm} className="mt-4 text-red-600 font-black flex items-center gap-2 hover:underline">
                                    Record First Expense <ArrowRight size={16} />
                                </button>
                            </div>
                        ) : (
                            <>
                                {expenses.map((exp, index) => {
                                    const displayIndex = expenses.length - index;
                                    return (
                                        <div key={exp.id} className="group relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-lg transition-all">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-red-50 dark:bg-red-900/10 text-red-600 flex items-center justify-center text-xs font-black">
                                                {displayIndex}
                                            </div>
                                            <div className="flex flex-col gap-2 pl-12 pr-4 py-4">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] font-black text-gray-600 dark:text-gray-300">
                                                        {format(new Date(exp.expense_date), 'MMM dd, yyyy')}
                                                    </span>
                                                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${exp.category === 'ads'
                                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                        : exp.category === 'packaging'
                                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                            : 'bg-slate-50 text-slate-700 border-slate-200'
                                                        }`}>
                                                        {exp.category}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-relaxed">
                                                    {exp.description}
                                                </div>
                                                <div className="text-left text-sm font-black text-red-600 font-mono tracking-tight">
                                                    Rs. {Number(exp.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Record Expense</h2>
                                    <p className="text-xs text-gray-400 font-medium">Log financial outflow record</p>
                                </div>
                                <button onClick={() => setIsFormOpen(false)} className="h-10 w-10 rounded-xl bg-white dark:bg-gray-900 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all shadow-sm border border-gray-100 dark:border-gray-800">
                                    <X size={20} strokeWidth={1.5} />
                                </button>
                            </div>

                            <form onSubmit={handleAddExpense} className="p-8 space-y-6">
                                {message && (
                                    <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${message.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                        <AlertCircle size={16} /> {message.text}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Expense Date</label>
                                        <input
                                            required
                                            type="date"
                                            value={expenseDate}
                                            onChange={e => setExpenseDate(e.target.value)}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-red-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Category</label>
                                        <select
                                            required
                                            value={category}
                                            onChange={e => {
                                                const next = e.target.value as 'ads' | 'packaging' | 'other';
                                                setCategory(next);
                                                if (next !== 'packaging') setPackagingQuantity(0);
                                            }}
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-red-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                        >
                                            <option value="other">Other</option>
                                            <option value="ads">Ads</option>
                                            <option value="packaging">Packaging</option>
                                        </select>
                                    </div>

                                    {category === 'packaging' && (
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Quantity</label>
                                            <input
                                                required
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={packagingQuantity || ''}
                                                onChange={e => setPackagingQuantity(Number(e.target.value))}
                                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-red-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-bold text-red-600 outline-none transition-all"
                                                placeholder="0"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Amount (Rs.)</label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-red-600 transition-colors">
                                                <IndianRupee size={16} strokeWidth={1.5} />
                                            </div>
                                            <input
                                                required
                                                type="number"
                                                step="1"
                                                min="1"
                                                value={amount || ''}
                                                onChange={e => setAmount(Number(e.target.value))}
                                                className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-red-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-bold text-gray-900 dark:text-gray-100 outline-none transition-all"
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
                                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border border-transparent focus:border-red-600/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none transition-all"
                                            placeholder="What was this expense for?"
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
                                        className="flex-[2] py-3 px-6 bg-red-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-50"
                                    >
                                        {loading ? 'Processing...' : 'Confirm Expense'}
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
