import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom"
import DashboardLayout from "../layouts/DashboardLayout"
import { Package, Activity, AlertTriangle, TrendingUp, ArrowRight, DollarSign, Plus, UserPlus, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../hooks/useAuthStore';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export default function AdminDashboard() {
    const navigate = useNavigate();
    const { profile } = useAuthStore();
    const [stats, setStats] = useState({
        totalDelivered: 0,
        totalReturns: 0,
        thisMonthDelivered: 0,
        lowStock: 0,
        outOfStock: 0,
        todaySales: 0
    });
    const [recentSales, setRecentSales] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const now = new Date();
            const todayStr = format(now, 'yyyy-MM-dd');
            const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');
            const monthEndStr = format(endOfMonth(now), 'yyyy-MM-dd');

            // 1. Fetch Sales Stats
            const { data: sales } = await supabase.from('sales').select('id, parcel_status, order_date, total_price, customer_name');
            const todaySales = sales?.filter((s: any) => s.order_date === todayStr).length || 0;
            const totalDelivered = sales?.filter((s: any) => s.parcel_status === 'delivered').length || 0;
            const totalReturns = sales?.filter((s: any) => s.parcel_status === 'returned').length || 0;
            const monthDelivered = sales?.filter((s: any) => s.order_date >= monthStartStr && s.order_date <= monthEndStr && s.parcel_status === 'delivered').length || 0;

            // 2. Fetch Recent Sales
            const { data: latest } = await supabase.from('sales').select('*').order('order_date', { ascending: false }).limit(5);
            setRecentSales(latest || []);

            // 3. Fetch Inventory Health
            const { data: lots } = await supabase.from('product_lots').select('id, quantity_remaining');
            // Simplified health check for demo/mobile - in real app would join with products min_stock
            const lowStock = lots?.filter((l: any) => l.quantity_remaining > 0 && l.quantity_remaining <= 5).length || 0;
            const outOfStock = lots?.filter((l: any) => l.quantity_remaining <= 0).length || 0;

            setStats({
                todaySales,
                totalDelivered,
                totalReturns,
                thisMonthDelivered: monthDelivered,
                lowStock,
                outOfStock
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="space-y-8 pb-10">
                {/* 1. WELCOME SECTION */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-gray-400 text-xs font-black uppercase tracking-[0.2em]">Inventory Control</h2>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">Hi, {profile?.full_name?.split(' ')[0] || 'Admin'}</h1>
                        <p className="text-sm text-gray-500 font-medium">{format(new Date(), 'EEEE, MMMM do')}</p>
                    </div>
                    <div className="h-14 w-14 bg-primary/10 rounded-3xl border-2 border-primary/20 flex items-center justify-center text-primary font-black text-xl">
                        {profile?.full_name?.[0] || 'A'}
                    </div>
                </div>

                {/* 2. QUICK OVERVIEW CARDS (Horizontal Scroll) */}
                <div className="flex gap-4 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
                    <OverviewCard
                        label="Today Sales"
                        value={stats.todaySales}
                        icon={<ShoppingBag size={18} />}
                        color="bg-primary shadow-primary/30 text-white"
                    />
                    <OverviewCard
                        label="Delivered"
                        value={stats.thisMonthDelivered}
                        icon={<Activity size={18} />}
                        color="bg-emerald-500 shadow-emerald-500/30 text-white"
                        desc="This month"
                    />
                    <OverviewCard
                        label="Returns"
                        value={stats.totalReturns}
                        icon={<AlertTriangle size={18} />}
                        color="bg-rose-500 shadow-rose-500/30 text-white"
                        desc="Total global"
                    />
                </div>

                {/* 3. QUICK ACTIONS GRID */}
                <section>
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Quick Operations</h3>
                    <div className="grid grid-cols-4 gap-4">
                        <ActionButton icon={<ShoppingCart className="text-blue-500" />} label="Sale" path="/admin/sales" />
                        <ActionButton icon={<Plus className="text-emerald-500" />} label="Stock" path="/admin/stock-in" />
                        <ActionButton icon={<DollarSign className="text-orange-500" />} label="Expense" path="/admin/expenses" />
                        <ActionButton icon={<UserPlus className="text-purple-500" />} label="Staff" path="/admin/users" />
                    </div>
                </section>

                {/* 4. INVENTORY HEALTH RADAR */}
                <section className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4 relative z-10">
                        <div>
                            <h3 className="font-black text-lg">Stock Health</h3>
                            <p className="text-xs text-gray-500 font-medium">Auto-scanned status</p>
                        </div>
                        <TrendingUp className="text-emerald-500" size={24} />
                    </div>

                    <div className="grid grid-cols-2 gap-4 relative z-10">
                        <div className="bg-rose-50 dark:bg-rose-500/10 p-4 rounded-3xl border border-rose-100 dark:border-rose-500/20">
                            <span className="text-2xl font-black text-rose-600">{stats.outOfStock}</span>
                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-tighter">Out of Stock</p>
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-500/10 p-4 rounded-3xl border border-amber-100 dark:border-amber-500/20">
                            <span className="text-2xl font-black text-amber-600">{stats.lowStock}</span>
                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-tighter">Critical Low</p>
                        </div>
                    </div>
                    {/* Abstract Background Curve */}
                    <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl"></div>
                </section>

                {/* 5. RECENT ACTIVITY LIST */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Latest Transactions</h3>
                        <button onClick={() => navigate('/admin/sales')} className="text-xs font-bold text-primary flex items-center gap-1">
                            View All <ArrowRight size={14} />
                        </button>
                    </div>

                    <div className="space-y-3">
                        {loading ? (
                            <div className="h-20 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-3xl"></div>
                        ) : recentSales.length === 0 ? (
                            <div className="py-10 text-center opacity-30 text-xs font-bold uppercase tracking-widest">No Recent Sales</div>
                        ) : (
                            recentSales.map((sale) => (
                                <div key={sale.id} className="bg-white dark:bg-gray-900 p-4 rounded-3xl border border-gray-50 dark:border-gray-800/50 flex items-center justify-between active:scale-[0.98] transition-transform">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-3 rounded-2xl ${sale.parcel_status === 'delivered' ? 'bg-emerald-50 text-emerald-500' : 'bg-blue-50 text-blue-500'}`}>
                                            <FileText size={18} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate w-32">{sale.customer_name}</h4>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">{format(new Date(sale.order_date), 'MMM dd, yyyy')}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-sm text-gray-900 dark:text-gray-100">₹{sale.total_price.toLocaleString()}</p>
                                        <span className={`text-[8px] font-black uppercase tracking-widest ${sale.parcel_status === 'delivered' ? 'text-emerald-500' : 'text-blue-500'}`}>
                                            {sale.parcel_status}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </DashboardLayout>
    );
}

function OverviewCard({ label, value, icon, color, desc }: any) {
    return (
        <div className={`flex-shrink-0 w-40 p-5 rounded-[2.5rem] shadow-xl ${color} space-y-4`}>
            <div className="h-10 w-10 bg-white/20 rounded-2xl flex items-center justify-center">
                {icon}
            </div>
            <div>
                <p className="text-[9px] font-black uppercase tracking-widest opacity-80">{label}</p>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black tracking-tight">{value}</span>
                </div>
                {desc && <p className="text-[8px] font-bold opacity-60 mt-1">{desc}</p>}
            </div>
        </div>
    );
}

function ActionButton({ icon, label, path }: any) {
    const navigate = useNavigate();
    return (
        <button
            onClick={() => navigate(path)}
            className="flex flex-col items-center gap-2 group active:scale-90 transition-transform"
        >
            <div className="h-16 w-16 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-[1.75rem] flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
                {icon}
            </div>
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">{label}</span>
        </button>
    );
}

function ShoppingBag(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
            <path d="M3 6h18" />
            <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
    )
}

function ShoppingCart(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="8" cy="21" r="1" />
            <circle cx="19" cy="21" r="1" />
            <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
        </svg>
    )
}
