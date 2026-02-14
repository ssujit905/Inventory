import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, LayoutDashboard, ShoppingCart, Users, FileText, LogOut, Search, Bell, ArrowDownCircle, DollarSign, User, Phone, TrendingUp, Activity, Menu, X } from 'lucide-react';
import { useSearchStore } from '../hooks/useSearchStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh';

export default function DashboardLayout({ children, role }: { children: React.ReactNode, role: 'admin' | 'staff' }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { query, setQuery } = useSearchStore();
    const { signOut } = useAuthStore();
    const [suggestions, setSuggestions] = useState<{ text: string, type: 'name' | 'phone' }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [pendingCostCount, setPendingCostCount] = useState(0);

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (query.length < 1) {
                setSuggestions([]);
                return;
            }

            const { data } = await supabase
                .from('sales')
                .select('customer_name, phone1')
                .or(`customer_name.ilike.%${query}%,phone1.ilike.%${query}%`)
                .limit(10);

            if (data) {
                const unique = new Set<string>();
                const results: { text: string, type: 'name' | 'phone' }[] = [];

                data.forEach(item => {
                    const name = item.customer_name;
                    const phone = item.phone1;

                    if (name.toLowerCase().includes(query.toLowerCase()) && !unique.has('n:' + name)) {
                        unique.add('n:' + name);
                        results.push({ text: name, type: 'name' });
                    }
                    if (phone.includes(query) && !unique.has('p:' + phone)) {
                        unique.add('p:' + phone);
                        results.push({ text: phone, type: 'phone' });
                    }
                });

                setSuggestions(results.slice(0, 6));
            }
        };

        const timer = setTimeout(fetchSuggestions, 150);
        return () => clearTimeout(timer);
    }, [query]);

    const fetchPendingCosts = async () => {
        if (role !== 'admin') {
            setPendingCostCount(0);
            return;
        }

        const { count } = await supabase
            .from('product_lots')
            .select('id', { count: 'exact', head: true })
            .eq('cost_price', 0);

        setPendingCostCount(count || 0);
    };

    useEffect(() => {
        fetchPendingCosts();
    }, [role]);

    useRealtimeRefresh(
        fetchPendingCosts,
        {
            channelName: 'pending-cost-badge-v2',
            tables: ['product_lots'],
            pollMs: 10000,
            enabled: role === 'admin'
        }
    );

    const handleLogout = () => {
        signOut();
        navigate('/', { replace: true });
    };

    const handleSelectSuggestion = (text: string) => {
        setQuery(text);
        setShowSuggestions(false);
        navigate('/admin/sales');
    };

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        // Close mobile menu on route change
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    return (
        <div className="flex h-screen w-full bg-gray-50 dark:bg-gray-950 overflow-hidden">
            {/* Mobile Sidebar Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col transition-transform duration-300 transform
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:relative lg:translate-x-0 lg:flex-shrink-0
            `}>
                <div className="h-16 flex items-center justify-between px-6 flex-shrink-0">
                    <div className="flex items-center gap-2.5 text-gray-900 dark:text-white font-bold tracking-tight">
                        <div className="p-1.5 bg-primary rounded-lg text-white">
                            <Package size={16} strokeWidth={2.5} />
                        </div>
                        <span className="text-lg font-jakarta">InvPro</span>
                    </div>
                    {/* Close button for mobile */}
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="lg:hidden p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
                    <NavItem icon={<LayoutDashboard size={18} strokeWidth={1.5} />} label="Dashboard" path="/admin/dashboard" active={location.pathname === '/admin/dashboard'} />
                    <NavItem icon={<Package size={18} strokeWidth={1.5} />} label="Inventory" path="/admin/inventory" active={location.pathname === '/admin/inventory'} />
                    <NavItem
                        icon={<ArrowDownCircle size={18} strokeWidth={1.5} />}
                        label="Stock In"
                        path="/admin/stock-in"
                        active={location.pathname === '/admin/stock-in'}
                        badge={role === 'admin' && pendingCostCount > 0 ? pendingCostCount : undefined}
                    />
                    <NavItem icon={<DollarSign size={18} strokeWidth={1.5} />} label="Expenses" path="/admin/expenses" active={location.pathname === '/admin/expenses'} />
                    <NavItem icon={<ShoppingCart size={18} strokeWidth={1.5} />} label="Sales" path="/admin/sales" active={location.pathname === '/admin/sales'} />
                    {role === 'admin' && (
                        <>
                            <div className="pt-6 pb-2">
                                <p className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Analytics</p>
                            </div>
                            <NavItem icon={<TrendingUp size={18} strokeWidth={1.5} />} label="Income" path="/admin/income" active={location.pathname === '/admin/income'} />
                            <NavItem icon={<FileText size={18} strokeWidth={1.5} />} label="Profit" path="/admin/profit" active={location.pathname === '/admin/profit'} />
                            <NavItem icon={<Activity size={18} strokeWidth={1.5} />} label="Finance" path="/admin/reports" active={location.pathname === '/admin/reports'} />
                            <NavItem icon={<Users size={18} strokeWidth={1.5} />} label="Staff Management" path="/admin/users" active={location.pathname === '/admin/users'} />
                        </>
                    )}
                </nav>

                <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                    >
                        <LogOut size={18} strokeWidth={1.5} />
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden w-full">
                {/* Header */}
                <header className="h-16 flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 lg:px-8">
                    <div className="flex items-center gap-2 lg:gap-4 flex-1 pr-2">
                        {/* Mobile Hamburger Menu Button */}
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            <Menu size={20} />
                        </button>

                        <div className="relative w-full max-w-sm lg:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                value={query}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setShowSuggestions(true);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        setShowSuggestions(false);
                                        navigate('/admin/sales');
                                    }
                                }}
                                placeholder="Search..."
                                className="w-full h-10 pl-10 pr-4 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-gray-900 dark:text-gray-100 truncate"
                            />

                            {/* Suggestions Dropdown */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-12 left-0 w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden z-[60] py-2">
                                    <div className="px-4 py-2 border-b border-gray-50 dark:border-gray-800">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Suggestions</p>
                                    </div>
                                    {suggestions.map((s, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleSelectSuggestion(s.text)}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <div className={`p-1.5 rounded-lg ${s.type === 'name' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                                                {s.type === 'name' ? <User size={14} /> : <Phone size={14} />}
                                            </div>
                                            <span className="font-bold text-gray-700 dark:text-gray-300">{s.text}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 lg:gap-4 flex-shrink-0">
                        <button className="hidden sm:block relative p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <Bell size={20} />
                            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"></span>
                        </button>
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {role === 'admin' ? 'A' : 'S'}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-4 lg:p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}

function NavItem({ icon, label, path, active = false, badge }: { icon: React.ReactNode, label: string, path: string, active?: boolean, badge?: number }) {
    const navigate = useNavigate();
    return (
        <button
            onClick={() => navigate(path)}
            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${active
                ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}>
            {icon}
            <span className="flex-1 text-left">{label}</span>
            {badge !== undefined && (
                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-primary text-white">
                    {badge}
                </span>
            )}
        </button>
    )
}
