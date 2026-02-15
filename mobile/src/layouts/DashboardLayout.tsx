import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, LayoutDashboard, ShoppingCart, Users, FileText, LogOut, Bell, ArrowDownCircle, DollarSign, TrendingUp, Activity, Menu, X, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';

export default function DashboardLayout({ children, role }: { children: React.ReactNode, role: 'admin' | 'staff' }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { signOut } = useAuthStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [pendingCostCount, setPendingCostCount] = useState(0);

    useEffect(() => {
        setIsMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (role !== 'admin') return;

        const fetchPendingCosts = async () => {
            const { count } = await supabase
                .from('product_lots')
                .select('id', { count: 'exact', head: true })
                .eq('cost_price', 0);
            setPendingCostCount(count || 0);
        };

        fetchPendingCosts();
    }, [role]);

    const handleLogout = () => {
        signOut();
        navigate('/', { replace: true });
    };

    return (
        <div className="flex flex-col h-screen w-full bg-gray-50 dark:bg-gray-950 font-sans text-gray-900 dark:text-gray-100 overflow-hidden">
            {/* MOBILE TOP BAR */}
            <header className="h-16 flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-5 sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary rounded-xl text-white shadow-lg shadow-primary/20">
                        <Package size={20} strokeWidth={2.5} />
                    </div>
                    <span className="text-xl font-bold tracking-tight">InvPro</span>
                </div>

                <div className="flex items-center gap-2">
                    <button className="p-2.5 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl relative">
                        <Bell size={20} />
                        <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-red-500 border-2 border-white dark:border-gray-900"></span>
                    </button>
                    <button
                        onClick={() => setIsMenuOpen(true)}
                        className="p-2.5 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl"
                    >
                        <Menu size={20} />
                    </button>
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950 pb-6">
                <div className="p-5 max-w-md mx-auto">
                    {children}
                </div>
            </main>

            {/* MOBILE FULL-SCREEN MENU DRAWER */}
            {isMenuOpen && (
                <div className="fixed inset-0 z-[100] bg-white dark:bg-gray-950 flex flex-col animate-in slide-in-from-right duration-300">
                    <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
                        <span className="text-lg font-bold">More Options</span>
                        <button onClick={() => setIsMenuOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-900 rounded-full">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
                        <section>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-3 block">Main Operations</label>
                            <div className="space-y-1">
                                <MenuLink icon={<LayoutDashboard className="text-cyan-500" />} label="Dashboard" path="/admin/dashboard" />
                                <MenuLink icon={<Package className="text-indigo-500" />} label="Inventory" path="/admin/inventory" />
                                <MenuLink icon={<ArrowDownCircle className="text-blue-500" />} label="Stock In" path="/admin/stock-in" badge={pendingCostCount} />
                                <MenuLink icon={<ShoppingCart className="text-emerald-500" />} label="Sales" path="/admin/sales" />
                                <MenuLink icon={<DollarSign className="text-amber-500" />} label="Expenses" path="/admin/expenses" />
                                {role === 'admin' && (
                                    <MenuLink icon={<Users className="text-purple-500" />} label="Staff Management" path="/admin/users" />
                                )}
                            </div>
                        </section>

                        {role === 'admin' && (
                            <section>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-4 mb-3 block">Analytics & Reports</label>
                                <div className="space-y-1">
                                    <MenuLink icon={<TrendingUp className="text-emerald-500" />} label="Income Overview" path="/admin/income" />
                                    <MenuLink icon={<FileText className="text-orange-500" />} label="Profit Analysis" path="/admin/profit" />
                                    <MenuLink icon={<Activity className="text-rose-500" />} label="Financial Summary" path="/admin/reports" />
                                </div>
                            </section>
                        )}

                        <section className="pt-6 border-t border-gray-100 dark:border-gray-900">
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center justify-between px-4 py-4 rounded-2xl bg-red-50 dark:bg-red-500/10 text-red-600 font-bold active:scale-[0.98] transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    <LogOut size={20} />
                                    <span>Logout</span>
                                </div>
                                <ChevronRight size={18} />
                            </button>
                        </section>
                    </div>

                    <div className="p-8 text-center">
                        <p className="text-xs text-gray-400 font-medium tracking-wide">InvPro v1.0.0 (Mobile Edition)</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function MenuLink({ icon, label, path, badge }: { icon: React.ReactNode, label: string, path: string, badge?: number }) {
    const navigate = useNavigate();
    return (
        <button
            onClick={() => navigate(path)}
            className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-900 active:bg-gray-100 dark:active:bg-gray-800 transition-colors group"
        >
            <div className="flex items-center gap-4">
                <div className="p-2.5 bg-gray-50 dark:bg-gray-900 rounded-xl group-hover:bg-white dark:group-hover:bg-gray-800 transition-colors">
                    {icon}
                </div>
                <span className="font-bold text-gray-700 dark:text-gray-300">{label}</span>
            </div>
            <div className="flex items-center gap-3">
                {badge ? (
                    <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-black rounded-full">{badge}</span>
                ) : null}
                <ChevronRight size={18} className="text-gray-300" />
            </div>
        </button>
    );
}
