import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { format, subMonths, eachMonthOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Globe, TrendingUp, ShoppingBag, Loader2, IndianRupee, PieChart as PieIcon } from 'lucide-react';

export default function WebsiteReportsPage() {
    const { profile } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        pendingOrders: 0
    });
    const [monthlyData, setMonthlyData] = useState<any[]>([]);
    const [statusData, setStatusData] = useState<any[]>([]);

    useEffect(() => {
        fetchWebsiteStats();
    }, []);

    const fetchWebsiteStats = async () => {
        setLoading(true);
        try {
            const { data: orders, error } = await supabase
                .from('website_orders')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const deliveredOrders = orders?.filter(o => o.status === 'delivered') || [];
            const totalRevenue = deliveredOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
            const totalOrders = orders?.length || 0;
            const avgOrderValue = deliveredOrders.length > 0 ? totalRevenue / deliveredOrders.length : 0;
            const pendingOrders = orders?.filter(o => o.status === 'pending').length || 0;

            setStats({ totalRevenue, totalOrders, avgOrderValue, pendingOrders });

            // Status Breakdown
            const statusCounts = (orders || []).reduce((acc: any, o) => {
                acc[o.status] = (acc[o.status] || 0) + 1;
                return acc;
            }, {});

            const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#f43f5e', '#6366f1', '#94a3b8'];
            setStatusData(Object.entries(statusCounts).map(([name, value], i) => ({ 
                name: name.toUpperCase(), 
                value,
                color: COLORS[i % COLORS.length]
            })));

            // Monthly Trend (Last 6 Months)
            const now = new Date();
            const last6Months = eachMonthOfInterval({
                start: subMonths(now, 5),
                end: now
            });

            const trend = last6Months.map(month => {
                const mStart = startOfMonth(month);
                const mEnd = endOfMonth(month);
                const monthOrders = (orders || []).filter(o => {
                    const d = new Date(o.created_at);
                    return d >= mStart && d <= mEnd;
                });
                
                return {
                    name: format(month, 'MMM'),
                    revenue: monthOrders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + Number(o.total_amount), 0),
                    orders: monthOrders.length
                };
            });

            setMonthlyData(trend);

        } catch (err) {
            console.error('Stats fetch failed:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
                <div className="flex h-64 items-center justify-center">
                    <Loader2 size={32} className="animate-spin text-primary" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="space-y-6 pb-20">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Globe className="text-primary" /> Website Analytics
                    </h1>
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">E-commerce Performance</p>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-2 gap-4">
                    <StatCard title="Revenue" value={`Rs. ${stats.totalRevenue.toLocaleString()}`} icon={<IndianRupee size={16} />} color="bg-emerald-500" />
                    <StatCard title="Total Orders" value={stats.totalOrders} icon={<ShoppingBag size={16} />} color="bg-blue-500" />
                    <StatCard title="Avg. Order" value={`Rs. ${stats.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={<TrendingUp size={16} />} color="bg-amber-500" />
                    <StatCard title="Pending" value={stats.pendingOrders} icon={<ShoppingBag size={16} />} color="bg-rose-500" />
                </div>

                {/* Revenue Trend Chart */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className="mb-6">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Monthly Revenue</h3>
                        <p className="text-lg font-black mt-1">Website Sales Trend</p>
                    </div>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.3} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748B' }} />
                                <YAxis hide />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f1f5f9', opacity: 0.4 }}
                                />
                                <Bar dataKey="revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={24} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Status Breakthrough */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className="mb-6">
                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Order Status</h3>
                        <p className="text-lg font-black mt-1">Delivery Distribution</p>
                    </div>
                    <div className="flex items-center">
                        <div className="h-48 w-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={statusData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {statusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-3 pl-4">
                            {statusData.map((item, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-[10px] font-black uppercase text-gray-500">{item.name}</span>
                                    </div>
                                    <span className="text-xs font-black">{item.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

function StatCard({ title, value, icon, color }: any) {
    return (
        <div className="bg-white dark:bg-gray-900 p-4 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className={`h-8 w-8 ${color} text-white rounded-xl flex items-center justify-center mb-3 shadow-lg shadow-current/10`}>
                {icon}
            </div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{title}</p>
            <p className="text-sm font-black text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
        </div>
    );
}
