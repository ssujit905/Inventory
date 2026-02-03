import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, LayoutDashboard, ShoppingCart, Users, FileText, Settings, LogOut, Search, Bell, ArrowDownCircle, DollarSign, User, Phone } from 'lucide-react';
import { useSearchStore } from '../hooks/useSearchStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';

export default function DashboardLayout({ children, role }: { children: React.ReactNode, role: 'admin' | 'staff' }) {
    const navigate = useNavigate();
    const { query, setQuery } = useSearchStore();
    const { signOut } = useAuthStore();
    const [suggestions, setSuggestions] = useState<{ text: string, type: 'name' | 'phone' }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

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

    const handleLogout = async () => {
        await signOut();
        navigate('/');
    };

    const handleSelectSuggestion = (text: string) => {
        setQuery(text);
        setShowSuggestions(false);
        navigate('/admin/sales');
    };

    return (
        <div className="flex h-screen w-full bg-gray-50 dark:bg-gray-950">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
                <div className="h-16 flex items-center px-6 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2 text-primary font-bold text-xl">
                        <Package className="h-6 w-6" />
                        <span>InvPro</span>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
                    <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" path="/admin/dashboard" active={window.location.pathname.includes('dashboard')} />
                    <NavItem icon={<Package size={20} />} label="Inventory" path="/admin/inventory" active={window.location.pathname.includes('inventory')} />
                    <NavItem icon={<ArrowDownCircle size={20} />} label="Stock In" path="/admin/stock-in" active={window.location.pathname.includes('stock-in')} />
                    <NavItem icon={<DollarSign size={20} />} label="Expenses" path="/admin/expenses" active={window.location.pathname.includes('expenses')} />
                    <NavItem icon={<ShoppingCart size={20} />} label="Sales" path="/admin/sales" active={window.location.pathname.includes('sales')} />
                    <NavItem icon={<FileText size={20} />} label="Reports" path="/admin/reports" />
                    {role === 'admin' && (
                        <>
                            <div className="pt-4 pb-2">
                                <p className="px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Admin</p>
                            </div>
                            <NavItem icon={<Users size={20} />} label="Staff Management" path="/admin/users" />
                            <NavItem icon={<Settings size={20} />} label="Settings" path="/admin/settings" />
                        </>
                    )}
                </nav>

                <div className="p-4 border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10"
                    >
                        <LogOut size={20} />
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Header */}
                <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-8">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="relative w-96">
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
                                placeholder="Search Name or Phone..."
                                className="w-full h-10 pl-10 pr-4 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />

                            {/* Suggestions Dropdown */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute top-12 left-0 w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden z-50 py-2">
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

                    <div className="flex items-center gap-4">
                        <button className="relative p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <Bell size={20} />
                            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900"></span>
                        </button>
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {role === 'admin' ? 'A' : 'S'}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    )
}

function NavItem({ icon, label, path, active = false }: { icon: React.ReactNode, label: string, path: string, active?: boolean }) {
    const navigate = useNavigate();
    return (
        <button
            onClick={() => navigate(path)}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${active
                ? 'bg-primary/10 text-primary'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                }`}>
            {icon}
            {label}
        </button>
    )
}
