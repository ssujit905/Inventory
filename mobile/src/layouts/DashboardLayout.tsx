import React, { useState, useEffect, cloneElement } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Package, LayoutDashboard, ShoppingCart, Users, FileText, LogOut, Bell, ArrowDownCircle, IndianRupee, TrendingUp, Activity, Menu, X, ChevronRight, Search, User, Phone, CircleDot, Barcode, RefreshCw, Printer, MessageSquare } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { useSearchStore } from '../hooks/useSearchStore';
import { supabase } from '../lib/supabase';

export default function DashboardLayout({ children, role }: { children: React.ReactNode, role: 'admin' | 'staff' }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { query, setQuery } = useSearchStore();
    const { signOut } = useAuthStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<{ text: string; type: 'name' | 'phone' | 'status' | 'sku' }[]>([]);
    const [pendingCostCount, setPendingCostCount] = useState(0);
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [startY, setStartY] = useState<number | null>(null);
    const [canPull, setCanPull] = useState(false);

    useEffect(() => {
        setIsMenuOpen(false);
        sessionStorage.setItem('mobile_last_path', location.pathname);
    }, [location.pathname]);

    useEffect(() => {
        return () => {
            setQuery('');
            setShowSuggestions(false);
            setIsSearchOpen(false);
        };
    }, [setQuery]);

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

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (!isSearchOpen || query.trim().length < 1) {
                setSuggestions([]);
                return;
            }

            const { data: salesData } = await supabase
                .from('sales')
                .select('customer_name, phone1, parcel_status')
                .or(`customer_name.ilike.%${query}%,phone1.ilike.%${query}%,parcel_status.ilike.%${query}%`)
                .limit(10);

            const { data: productData } = await supabase
                .from('products')
                .select('sku')
                .ilike('sku', `%${query}%`)
                .limit(10);

            const unique = new Set<string>();
            const results: { text: string; type: 'name' | 'phone' | 'status' | 'sku' }[] = [];

            (salesData || []).forEach((item: any) => {
                const name = item.customer_name || '';
                const phone = item.phone1 || '';
                const status = item.parcel_status || '';

                if (name.toLowerCase().includes(query.toLowerCase()) && !unique.has(`n:${name}`)) {
                    unique.add(`n:${name}`);
                    results.push({ text: name, type: 'name' });
                }
                if (phone.includes(query) && !unique.has(`p:${phone}`)) {
                    unique.add(`p:${phone}`);
                    results.push({ text: phone, type: 'phone' });
                }
                if (status.toLowerCase().includes(query.toLowerCase()) && !unique.has(`s:${status}`)) {
                    unique.add(`s:${status}`);
                    results.push({ text: status, type: 'status' });
                }
            });

            (productData || []).forEach((item: any) => {
                const sku = item.sku || '';
                if (sku.toLowerCase().includes(query.toLowerCase()) && !unique.has(`k:${sku}`)) {
                    unique.add(`k:${sku}`);
                    results.push({ text: sku, type: 'sku' });
                }
            });

            setSuggestions(results.slice(0, 8));
        };

        const timer = setTimeout(fetchSuggestions, 150);
        return () => clearTimeout(timer);
    }, [query, isSearchOpen]);

    const handleLogout = () => {
        signOut();
        navigate('/', { replace: true });
    };

    const resolveSearchRoute = (type: 'name' | 'phone' | 'status' | 'sku') => {
        return type === 'sku' ? '/admin/inventory' : '/admin/sales';
    };

    const handleSelectSuggestion = (text: string, type: 'name' | 'phone' | 'status' | 'sku') => {
        setQuery(text);
        setShowSuggestions(false);
        setIsSearchOpen(false);
        navigate(resolveSearchRoute(type));
    };

    const triggerRefresh = () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        setPullDistance(64);
        sessionStorage.setItem('mobile_last_path', location.pathname);
        setTimeout(() => {
            window.location.reload();
        }, 300);
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
        if (isMenuOpen || isRefreshing) return;
        const target = e.currentTarget;
        const atTop = target.scrollTop <= 0;
        setCanPull(atTop);
        setStartY(atTop ? e.touches[0].clientY : null);
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLElement>) => {
        if (!canPull || startY === null || isRefreshing) return;
        const delta = e.touches[0].clientY - startY;
        if (delta <= 0) {
            setPullDistance(0);
            return;
        }
        const damped = Math.min(90, delta * 0.45);
        setPullDistance(damped);
    };

    const handleTouchEnd = () => {
        if (isRefreshing) return;
        if (pullDistance >= 60) {
            triggerRefresh();
        } else {
            setPullDistance(0);
        }
        setStartY(null);
        setCanPull(false);
    };

    const pullThreshold = 60;
    const pullProgress = Math.min(1, pullDistance / pullThreshold);
    const indicatorVisible = pullDistance > 2 || isRefreshing;

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
                    <button
                        onClick={() => setIsSearchOpen((v) => !v)}
                        className="p-2.5 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl"
                    >
                        <Search size={20} />
                    </button>
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

            {isSearchOpen && (
                <div className="px-5 pt-3 pb-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                    <div className="relative max-w-md mx-auto">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={query}
                            onFocus={() => setShowSuggestions(true)}
                            onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setShowSuggestions(true);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const route = location.pathname === '/admin/inventory' || location.pathname === '/admin/sales'
                                        ? location.pathname
                                        : '/admin/sales';
                                    navigate(route);
                                    setIsSearchOpen(false);
                                    setShowSuggestions(false);
                                }
                            }}
                            placeholder="Search name, phone, status, or product ID"
                            className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-primary/20"
                        />

                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-12 left-0 w-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden z-[60] py-2">
                                <div className="px-4 py-2 border-b border-gray-50 dark:border-gray-800">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Suggestions</p>
                                </div>
                                {suggestions.map((s, i) => (
                                    <button
                                        key={`${s.type}-${s.text}-${i}`}
                                        onClick={() => handleSelectSuggestion(s.text, s.type)}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        <div className={`p-1.5 rounded-lg ${s.type === 'name'
                                            ? 'bg-blue-50 text-blue-600'
                                            : s.type === 'phone'
                                                ? 'bg-green-50 text-green-600'
                                                : s.type === 'status'
                                                    ? 'bg-violet-50 text-violet-600'
                                                    : 'bg-amber-50 text-amber-600'
                                            }`}>
                                            {s.type === 'name' ? <User size={14} /> : s.type === 'phone' ? <Phone size={14} /> : s.type === 'status' ? <CircleDot size={14} /> : <Barcode size={14} />}
                                        </div>
                                        <span className="font-bold text-gray-700 dark:text-gray-300">{s.text}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <main
                className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950 pb-6"
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
            >
                <div
                    className={`sticky top-0 z-20 flex justify-center pointer-events-none transition-all duration-200 ${indicatorVisible ? 'opacity-100' : 'opacity-0'}`}
                    style={{ height: `${Math.min(72, pullDistance)}px` }}
                >
                    <div className="mt-2 px-4 py-2 rounded-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border border-gray-200 dark:border-gray-800 shadow-lg">
                        <div className="flex items-center gap-2">
                            <div
                                className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center"
                                style={{ transform: `rotate(${isRefreshing ? 360 : Math.round(pullProgress * 220)}deg)` }}
                            >
                                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">
                                {isRefreshing ? 'Refreshing...' : pullDistance >= pullThreshold ? 'Release to refresh' : 'Pull to refresh'}
                            </span>
                        </div>
                    </div>
                </div>

                <div
                    className="p-5 max-w-md mx-auto transition-transform duration-150"
                    style={pullDistance > 0 ? { transform: `translateY(${Math.round(Math.min(18, pullDistance * 0.2))}px)` } : undefined}
                >
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
                                <MenuLink icon={<Printer className="text-blue-500" />} label="Print Center" path="/admin/print" />
                                <MenuLink icon={<IndianRupee className="text-amber-500" />} label="Expenses" path="/admin/expenses" />
                                {role === 'admin' && (
                                    <>
                                        <MenuLink icon={<MessageSquare className="text-primary" />} label="AI Chatbot" path="/admin/chatbot" />
                                        <MenuLink icon={<Users className="text-purple-500" />} label="Staff Management" path="/admin/users" />
                                    </>
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
    const location = useLocation();
    const isActive = location.pathname === path;

    return (
        <button
            onClick={() => navigate(path)}
            className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all duration-200 group ${isActive
                ? 'bg-primary/10 dark:bg-primary/20'
                : 'hover:bg-gray-50 dark:hover:bg-gray-900 active:bg-gray-100 dark:active:bg-gray-800'
                }`}
        >
            <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-xl transition-all duration-200 ${isActive
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-gray-50 dark:bg-gray-900 group-hover:bg-white dark:group-hover:bg-gray-800'
                    }`}>
                    {/* We override the icon color to white when active for better contrast */}
                    {isActive && React.isValidElement(icon) ? (
                        cloneElement(icon as React.ReactElement, { className: 'text-white' } as any)
                    ) : icon}
                </div>
                <span className={`font-black tracking-tight transition-colors ${isActive ? 'text-primary' : 'text-gray-700 dark:text-gray-300'}`}>
                    {label}
                </span>
            </div>
            <div className="flex items-center gap-3">
                {badge ? (
                    <span className="px-2 py-0.5 bg-primary text-white text-[10px] font-black rounded-full shadow-sm">{badge}</span>
                ) : null}
                <ChevronRight size={18} className={`transition-transform duration-200 ${isActive ? 'text-primary translate-x-1' : 'text-gray-300'}`} />
            </div>
        </button>
    );
}
