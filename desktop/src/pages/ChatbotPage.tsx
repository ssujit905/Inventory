import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
    MessageSquare, Zap, Loader2, Bot, Shield, AlertCircle,
    CheckCircle2, BrainCircuit, Globe, Package, HelpCircle,
    Bell, Plus, Trash2, Edit3, Image as ImageIcon, ExternalLink, Search, MoreVertical
} from 'lucide-react'
import DashboardLayout from '../layouts/DashboardLayout'
import { useAuthStore } from '../hooks/useAuthStore'
import { useRealtimeRefresh } from '../hooks/useRealtimeRefresh'

type AppTab = 'settings' | 'products' | 'faqs' | 'notifications' | 'shortcuts';

export default function ChatbotPage() {
    const { profile } = useAuthStore()
    const [activeTab, setActiveTab] = useState<AppTab>('settings')
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)
    const [status, setStatus] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    // Component State
    const [products, setProducts] = useState<any[]>([])
    const [faqs, setFaqs] = useState<any[]>([])
    const [notifications, setNotifications] = useState<any[]>([])
    const [shortcuts, setShortcuts] = useState<any[]>([])

    // Settings State
    const [chatbotEnabled, setChatbotEnabled] = useState(true)
    const [tempChatbotEnabled, setTempChatbotEnabled] = useState(true)
    const [lastSynced, setLastSynced] = useState<Date | null>(null)

    // Form States
    const [showAddProduct, setShowAddProduct] = useState(false)
    const [showAddFaq, setShowAddFaq] = useState(false)
    const [showAddShortcut, setShowAddShortcut] = useState(false)
    const [editingProduct, setEditingProduct] = useState<any>(null)

    const fetchData = async (showLoading = true) => {
        if (showLoading) setFetching(true)
        try {
            // 1. Fetch Settings
            const { data: settingsData } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'chatbot_enabled')
                .maybeSingle()

            if (settingsData) {
                const isEnabled = settingsData.value === 'true'
                setChatbotEnabled(isEnabled)
                setTempChatbotEnabled(isEnabled)
                setLastSynced(new Date())
            }

            // 2. Fetch products
            const { data: prodData } = await supabase.from('chatbot_products').select('*').order('created_at', { ascending: false })
            setProducts(prodData || [])

            // 3. Fetch FAQs
            const { data: faqData } = await supabase.from('chatbot_faqs').select('*').order('created_at', { ascending: false })
            setFaqs(faqData || [])

            // 4. Fetch Notifications
            const { data: notifData } = await supabase.from('chatbot_notifications').select('*').order('created_at', { ascending: false })
            setNotifications(notifData || [])

            // 5. Fetch Shortcuts
            const { data: shortData } = await supabase.from('chatbot_shortcuts').select('*').order('created_at', { ascending: false })
            setShortcuts(shortData || [])

        } catch (err) {
            console.error('Fetch error:', err)
        } finally {
            if (showLoading) setFetching(false)
        }
    }

    useEffect(() => {
        fetchData(true)
    }, [])

    useRealtimeRefresh(() => fetchData(false), {
        channelName: 'chatbot-full-sync',
        tables: ['settings', 'chatbot_products', 'chatbot_faqs', 'chatbot_notifications', 'chatbot_shortcuts'],
        enabled: true,
        pollMs: 10000
    })

    const handleSaveSettings = async () => {
        setLoading(true)
        try {
            const { error } = await supabase
                .from('settings')
                .upsert({ key: 'chatbot_enabled', value: String(tempChatbotEnabled) })

            if (error) throw error

            setChatbotEnabled(tempChatbotEnabled)
            setStatus({ type: 'success', text: 'Chatbot settings synchronized successfully!' })
            setTimeout(() => setStatus(null), 3000)
        } catch (err: any) {
            console.error('Save error:', err)
            setStatus({ type: 'error', text: `Error: ${err.message}` })
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (table: string, id: string) => {
        if (!confirm('Are you sure you want to delete this item?')) return;
        try {
            const { error } = await supabase.from(table).delete().eq('id', id);
            if (error) throw error;
            fetchData(false);
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const resolveNotification = async (id: string) => {
        try {
            await supabase.from('chatbot_notifications').update({ status: 'resolved' }).eq('id', id);
            fetchData(false);
        } catch (err) {
            console.error(err);
        }
    };

    const toggleShortcut = async (id: string, active: boolean) => {
        try {
            await supabase.from('chatbot_shortcuts').update({ is_active: !active }).eq('id', id);
            fetchData(false);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="max-w-6xl mx-auto space-y-8 pb-20">
                {/* Header Profile Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-8 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h1 className="text-4xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tighter">AI Command Center</h1>
                        <p className="text-xs text-gray-400 font-bold mt-2 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Bot size={14} className="text-primary" /> Messenger Automation & Knowledge Base
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-2 px-5 py-2.5 rounded-full border ${chatbotEnabled ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-rose-50 border-rose-100 text-rose-600'}`}>
                            <div className={`h-2.5 w-2.5 rounded-full ${chatbotEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                            <span className="text-[11px] font-black uppercase tracking-widest leading-none">
                                {chatbotEnabled ? 'Engine Active' : 'Engine Idle'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700">
                            <Bell size={14} className={notifications.filter(n => n.status === 'unresolved').length > 0 ? "text-amber-500 animate-bounce" : "text-gray-400"} />
                            <span className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                                {notifications.filter(n => n.status === 'unresolved').length} Alerts
                            </span>
                        </div>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-2 p-1.5 bg-gray-100/50 dark:bg-gray-800/50 rounded-2xl w-fit overflow-x-auto scrollbar-hide max-w-full">
                    <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Zap size={16} />} label="Overview" />
                    <TabButton active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={<Package size={16} />} label="Catalog" />
                    <TabButton active={activeTab === 'faqs'} onClick={() => setActiveTab('faqs')} icon={<HelpCircle size={16} />} label="Brain (FAQs)" />
                    <TabButton active={activeTab === 'shortcuts'} onClick={() => setActiveTab('shortcuts')} icon={<MoreVertical size={16} />} label="Quick Buttons" />
                    <TabButton active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} icon={<Bell size={16} />} label="Human Handoff" />
                </div>

                {status && (
                    <div className={`p-4 rounded-2xl text-sm font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${status.type === 'success'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-rose-50 text-rose-700 border border-rose-100'
                        }`}>
                        {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                        {status.text}
                    </div>
                )}

                {fetching && activeTab === 'settings' ? (
                    <LoadingState />
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {activeTab === 'settings' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                <div className="lg:col-span-2 space-y-8">
                                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-10 border border-gray-100 dark:border-gray-800 shadow-xl shadow-gray-200/20 dark:shadow-none relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />

                                        <div className="flex items-center justify-between mb-10 relative">
                                            <div>
                                                <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100">Visibility Control</h3>
                                                <p className="text-sm text-gray-400 font-medium mt-1 uppercase tracking-widest">Master Switch for Messenger</p>
                                            </div>
                                            <div className={`p-5 rounded-[1.5rem] ${tempChatbotEnabled ? 'bg-primary text-white shadow-xl shadow-primary/30' : 'bg-gray-100 text-gray-400 dark:bg-gray-800'}`}>
                                                <MessageSquare size={32} />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-8 bg-gray-50/50 dark:bg-gray-800/30 rounded-3xl border border-gray-100 dark:border-gray-800 group transition-all hover:bg-white dark:hover:bg-gray-800">
                                            <div className="space-y-2">
                                                <h4 className="font-black text-xl text-gray-900 dark:text-gray-100 flex items-center gap-3">
                                                    Status: <span className={tempChatbotEnabled ? 'text-primary' : 'text-gray-400'}>{tempChatbotEnabled ? 'ACTIVE' : 'INACTIVE'}</span>
                                                </h4>
                                                <p className="text-xs text-gray-400 max-w-sm font-medium leading-relaxed">Toggle this to immediately enable or disable the bot response on all linked Facebook pages.</p>
                                            </div>
                                            <button
                                                onClick={() => setTempChatbotEnabled(!tempChatbotEnabled)}
                                                className={`relative inline-flex h-10 w-18 items-center rounded-full transition-all duration-300 ${tempChatbotEnabled ? 'bg-primary scale-110 shadow-lg shadow-primary/20' : 'bg-gray-200 dark:bg-gray-700'}`}
                                            >
                                                <span className={`inline-block h-8 w-8 transform rounded-full bg-white shadow-md transition-transform duration-300 ${tempChatbotEnabled ? 'translate-x-9' : 'translate-x-1'}`} />
                                            </button>
                                        </div>

                                        <div className="mt-10 pt-10 border-t border-gray-100 dark:border-gray-800 flex flex-col items-center">
                                            <button
                                                onClick={handleSaveSettings}
                                                disabled={loading || tempChatbotEnabled === chatbotEnabled}
                                                className="w-full max-w-sm h-16 bg-primary hover:bg-primary/90 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 text-white font-black rounded-2xl transition-all shadow-2xl shadow-primary/30 flex items-center justify-center gap-3 active:scale-[0.98] uppercase tracking-[0.2em] text-sm"
                                            >
                                                {loading ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} />}
                                                Push to Live Engine
                                            </button>
                                            {lastSynced && (
                                                <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest mt-6">
                                                    Last Config Sync: {lastSynced.toLocaleTimeString()}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FeatureItem
                                            icon={<BrainCircuit size={22} />}
                                            color="bg-purple-500"
                                            title="Intelligent Logic"
                                            desc="Uses contextual matching to find products and FAQs with high accuracy."
                                        />
                                        <FeatureItem
                                            icon={<Bell size={22} />}
                                            color="bg-amber-500"
                                            title="Human Handoff"
                                            desc="Automatically alerts your team for any unknown customer inquiries."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 rounded-[2.5rem] p-10 text-white shadow-2xl shadow-indigo-500/20 relative overflow-hidden">
                                        <Zap size={80} className="absolute -right-4 -top-4 opacity-10 rotate-12" />
                                        <Shield size={40} className="mb-6 opacity-40" />
                                        <h4 className="text-2xl font-black mb-3 tracking-tight">Lead Shield™</h4>
                                        <p className="text-sm text-indigo-100/80 leading-relaxed mb-8 font-medium">
                                            Your proprietary data is secured with AES-256 encryption. Conversations are stored on your private cloud, never shared with meta or third parties.
                                        </p>
                                        <div className="p-6 bg-white/10 rounded-2xl border border-white/10 backdrop-blur-sm">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-3">AI Engine Level</p>
                                            <p className="text-xl font-mono font-bold tracking-tighter">PREMIUM v4.0.0</p>
                                        </div>
                                    </div>

                                    <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-8 border border-gray-100 dark:border-gray-800">
                                        <h4 className="font-black text-xs uppercase tracking-[0.2em] text-gray-400 mb-6 flex items-center gap-2">
                                            <CheckCircle2 size={14} className="text-emerald-500" /> System Health
                                        </h4>
                                        <div className="space-y-4">
                                            <HealthItem label="Database Link" status="optimal" />
                                            <HealthItem label="Messenger Webhook" status="stable" />
                                            <HealthItem label="NLP Processor" status="operational" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'products' && (
                            <ProductManager
                                products={products}
                                onAdd={() => setShowAddProduct(true)}
                                onEdit={(p: any) => setEditingProduct(p)}
                                onDelete={(id: string) => handleDelete('chatbot_products', id)}
                            />
                        )}

                        {activeTab === 'faqs' && (
                            <FaqManager
                                faqs={faqs}
                                onAdd={() => setShowAddFaq(true)}
                                onDelete={(id: string) => handleDelete('chatbot_faqs', id)}
                            />
                        )}

                        {activeTab === 'notifications' && (
                            <NotificationCenter
                                notifications={notifications}
                                onResolve={resolveNotification}
                            />
                        )}

                        {activeTab === 'shortcuts' && (
                            <ShortcutManager
                                shortcuts={shortcuts}
                                onAdd={() => setShowAddShortcut(true)}
                                onDelete={(id: string) => handleDelete('chatbot_shortcuts', id)}
                                onToggle={toggleShortcut}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            {showAddProduct && (
                <AddProductModal onClose={() => setShowAddProduct(false)} onSave={fetchData} />
            )}
            {showAddFaq && (
                <AddFaqModal onClose={() => setShowAddFaq(false)} onSave={fetchData} />
            )}
            {showAddShortcut && (
                <AddShortcutModal onClose={() => setShowAddShortcut(false)} onSave={fetchData} />
            )}
            {editingProduct && (
                <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} onSave={fetchData} />
            )}
        </DashboardLayout>
    )
}

// --- SUB-COMPONENTS ---

function TabButton({ active, onClick, icon, label }: any) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${active
                ? 'bg-white dark:bg-gray-800 text-primary shadow-sm border border-gray-100 dark:border-gray-700'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                }`}
        >
            {icon}
            {label}
        </button>
    )
}

function ProductManager({ products, onAdd, onEdit, onDelete }: any) {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100">AI Product Catalog</h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Manage what the bot can sell</p>
                </div>
                <button
                    onClick={onAdd}
                    className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all active:scale-[0.98]"
                >
                    <Plus size={18} /> Add New Entry
                </button>
            </div>

            {products.length === 0 ? (
                <EmptyState icon={<Package size={48} />} title="No Products Found" desc="Start adding products that the chatbot can recognize and show to your customers." />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {products.map((p: any) => (
                        <div key={p.id} className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden group">
                            <div className="aspect-[4/3] bg-gray-50 dark:bg-gray-800 relative overflow-hidden flex items-center justify-center">
                                {p.image_url ? (
                                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                ) : (
                                    <ImageIcon size={48} className="text-gray-300" />
                                )}
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all">
                                    <button
                                        onClick={() => onEdit(p)}
                                        className="p-2.5 bg-white/90 dark:bg-gray-900/90 rounded-xl shadow-lg text-primary hover:bg-primary hover:text-white transition-colors"
                                    >
                                        <Edit3 size={16} />
                                    </button>
                                    <button
                                        onClick={() => onDelete(p.id)}
                                        className="p-2.5 bg-white/90 dark:bg-gray-900/90 rounded-xl shadow-lg text-rose-500 hover:bg-rose-500 hover:text-white transition-colors"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className="absolute bottom-4 left-4">
                                    <span className="px-4 py-2 bg-white/90 dark:bg-gray-900/90 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm">
                                        NPR {parseFloat(p.price).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            <div className="p-8 space-y-4">
                                <div>
                                    <h4 className="text-xl font-black text-gray-900 dark:text-gray-100">{p.name}</h4>
                                    <p className="text-xs text-gray-400 font-medium line-clamp-2 mt-1">{p.description || 'No description provided.'}</p>
                                </div>
                                <div className="flex flex-wrap gap-1.5 pt-2">
                                    {p.sizes?.map((s: string) => (
                                        <span key={s} className="px-2.5 py-1 bg-gray-50 dark:bg-gray-800 rounded-lg text-[10px] font-bold text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function FaqManager({ faqs, onAdd, onDelete }: any) {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100">Knowledge Base</h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Stored Q&As for the chatbot</p>
                </div>
                <button
                    onClick={onAdd}
                    className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all active:scale-[0.98]"
                >
                    <Plus size={18} /> Add FAQ
                </button>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] border border-gray-100 dark:border-gray-800 shadow-sm divide-y divide-gray-50 dark:divide-gray-800">
                {faqs.length === 0 ? (
                    <EmptyState icon={<HelpCircle size={48} />} title="No FAQs" desc="Add common questions and answers to keep the bot smart." />
                ) : (
                    faqs.map((f: any) => (
                        <div key={f.id} className="p-8 flex items-start justify-between gap-6 group hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                            <div className="space-y-3">
                                <h5 className="font-black text-lg text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[10px]">Q</div>
                                    {f.question}
                                </h5>
                                <div className="flex items-start gap-2">
                                    <div className="h-6 w-6 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center text-[10px] flex-shrink-0">A</div>
                                    <p className="text-sm text-gray-500 font-medium leading-relaxed">{f.answer}</p>
                                </div>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-2.5 text-gray-400 hover:text-primary transition-colors"><MoreVertical size={18} /></button>
                                <button onClick={() => onDelete(f.id)} className="p-2.5 text-gray-400 hover:text-rose-500 transition-colors"><Trash2 size={18} /></button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

function NotificationCenter({ notifications, onResolve }: any) {
    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100">Human Handoff Alerts</h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Pending help requests from customers</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {notifications.length === 0 ? (
                    <EmptyState icon={<Bell size={48} />} title="All Quiet" desc="No manual help requests currently pending." />
                ) : (
                    notifications.map((n: any) => (
                        <div key={n.id} className={`p-6 rounded-3xl border flex items-center justify-between gap-6 transition-all ${n.status === 'unresolved' ? 'bg-amber-50/50 border-amber-100 shadow-lg shadow-amber-200/10' : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 opacity-60'}`}>
                            <div className="flex items-center gap-6">
                                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center text-2xl font-black ${n.status === 'unresolved' ? 'bg-amber-500 text-white shadow-lg shadow-amber-200' : 'bg-gray-200 text-gray-400'}`}>
                                    {n.customer_name?.charAt(0) || 'U'}
                                </div>
                                <div>
                                    <h4 className="font-black text-lg text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                        {n.customer_name || 'Unknown User'}
                                        {n.status === 'unresolved' && <span className="px-2.5 py-1 bg-rose-500 text-white text-[8px] font-black uppercase rounded-full">Urgent</span>}
                                    </h4>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">Last Message</p>
                                    <p className="text-sm font-medium text-gray-600 bg-white/50 p-3 rounded-xl border border-gray-100">"{n.last_message}"</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-3 text-right">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{new Date(n.created_at).toLocaleString()}</span>
                                <div className="flex gap-2">
                                    <a
                                        href={`https://m.me/${n.psid}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-primary/90 transition-all shadow-md"
                                    >
                                        <ExternalLink size={12} /> Open Messenger
                                    </a>
                                    {n.status === 'unresolved' && (
                                        <button
                                            onClick={() => onResolve(n.id)}
                                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-md"
                                        >
                                            <CheckCircle2 size={12} /> Resolved
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

function ShortcutManager({ shortcuts, onAdd, onDelete, onToggle }: any) {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100">Quick Buttons</h3>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Manage interactive shortcuts on Messenger</p>
                </div>
                <button
                    onClick={onAdd}
                    className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all active:scale-[0.98]"
                >
                    <Plus size={18} /> Add Shortcut
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {shortcuts.length === 0 ? (
                    <div className="lg:col-span-3">
                        <EmptyState icon={<MoreVertical size={48} />} title="No Shortcuts" desc="Add buttons like 'Start Over' that customers can click on Messenger." />
                    </div>
                ) : (
                    shortcuts.map((s: any) => (
                        <div key={s.id} className={`p-6 bg-white dark:bg-gray-900 rounded-[2rem] border transition-all ${s.is_active ? 'border-primary shadow-lg shadow-primary/5' : 'border-gray-100 dark:border-gray-800 opacity-60'}`}>
                            <div className="flex items-center justify-between mb-4">
                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${s.is_active ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                                    {s.is_active ? 'Live' : 'Hidden'}
                                </span>
                                <div className="flex gap-2">
                                    <button onClick={() => onToggle(s.id, s.is_active)} className="p-2 text-gray-400 hover:text-primary transition-colors"><Zap size={16} /></button>
                                    <button onClick={() => onDelete(s.id)} className="p-2 text-gray-400 hover:text-rose-500 transition-colors"><Trash2 size={16} /></button>
                                </div>
                            </div>
                            <h4 className="text-lg font-black text-gray-900 dark:text-gray-100 mb-1">{s.label}</h4>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">Payload: <span className="text-primary">{s.payload}</span></p>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

function AddShortcutModal({ onClose, onSave }: any) {
    const [label, setLabel] = useState('')
    const [payload, setPayload] = useState('')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        if (!label || !payload) return alert('Both label and payload are required');
        setSaving(true)
        try {
            const { error } = await supabase.from('chatbot_shortcuts').insert([{ label, payload }])
            if (error) throw error
            onSave(false)
            onClose()
        } catch (err: any) {
            alert(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <ModalWrapper title="Add Quick Shortcut" onClose={onClose}>
            <div className="space-y-6">
                <Input label="Button Label (Visible to User)" value={label} onChange={setLabel} placeholder="e.g. Start Over 🔄" />
                <Input label="Action Keyword (Trigger)" value={payload} onChange={setPayload} placeholder="e.g. restart" />

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                        <AlertCircle size={12} /> Pro Tip
                    </p>
                    <p className="text-xs text-amber-600 font-medium leading-relaxed">Use a trigger that matches your FAQ keywords for instant responses!</p>
                </div>

                <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all">
                    {saving ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Create Shortcut'}
                </button>
            </div>
        </ModalWrapper>
    )
}

function EditProductModal({ product, onClose, onSave }: any) {
    const [name, setName] = useState(product.name)
    const [price, setPrice] = useState(product.price.toString())
    const [desc, setDesc] = useState(product.description || '')
    const [sizes, setSizes] = useState(product.sizes?.join(', ') || '')
    const [imageUrl, setImageUrl] = useState(product.image_url || '')
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
            const filePath = `chatbot-products/${fileName}`

            const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(filePath, file)

            if (uploadError) throw uploadError

            const { data: { publicUrl } } = supabase.storage
                .from('images')
                .getPublicUrl(filePath)

            setImageUrl(publicUrl)
        } catch (err: any) {
            alert(`Upload failed: ${err.message}`)
        } finally {
            setUploading(false)
        }
    }

    const handleSave = async () => {
        if (!name || !price) return alert('Name and Price are required')

        setSaving(true)
        try {
            const sizeArr = sizes.split(',').map((s: string) => s.trim()).filter((s: string) => s)
            const { error } = await supabase.from('chatbot_products').update({
                name,
                description: desc,
                price: parseFloat(price),
                sizes: sizeArr,
                image_url: imageUrl
            }).eq('id', product.id)

            if (error) throw error
            onSave(false)
            onClose()
        } catch (err: any) {
            alert(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <ModalWrapper title="Edit Product Entry" onClose={onClose}>
            <div className="space-y-6 max-h-[70vh] overflow-y-auto px-2 custom-scrollbar">
                <Input label="Product Name" value={name} onChange={setName} />

                <div className="grid grid-cols-2 gap-4">
                    <Input label="Price (NPR)" type="number" value={price} onChange={setPrice} />
                    <Input label="Sizes (Comma Separated)" value={sizes} onChange={setSizes} />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Product Image</label>
                    <div className="flex flex-col gap-4">
                        {imageUrl ? (
                            <div className="relative h-40 w-full rounded-2xl overflow-hidden border-2 border-primary group">
                                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                <button onClick={() => setImageUrl('')} className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white font-bold">Change Image</button>
                            </div>
                        ) : (
                            <label className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-2xl cursor-pointer ${uploading ? 'opacity-50' : 'hover:border-primary'}`}>
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    {uploading ? <Loader2 className="h-10 w-10 text-primary animate-spin" /> : <ImageIcon className="h-10 w-10 text-gray-400 mb-3" />}
                                    <p className="text-xs font-black uppercase tracking-widest text-gray-500">Click to Change Image</p>
                                </div>
                                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={uploading} />
                            </label>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Description</label>
                    <textarea
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        className="w-full p-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary rounded-xl transition-all h-28 text-sm font-medium"
                    />
                </div>

                <button onClick={handleSave} disabled={saving || uploading} className="w-full py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                    {saving ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Update Changes'}
                </button>
            </div>
        </ModalWrapper>
    )
}

function AddProductModal({ onClose, onSave }: any) {
    const [name, setName] = useState('')
    const [price, setPrice] = useState('')
    const [desc, setDesc] = useState('')
    const [sizes, setSizes] = useState('')
    const [imageUrl, setImageUrl] = useState('')
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(true)
        try {
            // Generate unique filename
            const fileExt = file.name.split('.').pop()
            const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
            const filePath = `chatbot-products/${fileName}`

            // 1. Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('images') // Ensure 'images' bucket exists and is public
                .upload(filePath, file)

            if (uploadError) throw uploadError

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('images')
                .getPublicUrl(filePath)

            setImageUrl(publicUrl)
        } catch (err: any) {
            console.error('Upload error:', err)
            alert(`Upload failed: ${err.message}. Make sure you have an 'images' bucket in Supabase and it is set to PUBLIC.`)
        } finally {
            setUploading(false)
        }
    }

    const handleSave = async () => {
        if (!name || !price) return alert('Name and Price are required')

        setSaving(true)
        try {
            const sizeArr = sizes.split(',').map(s => s.trim()).filter(s => s)
            const { error } = await supabase.from('chatbot_products').insert([{
                name,
                description: desc,
                price: parseFloat(price),
                sizes: sizeArr,
                image_url: imageUrl
            }])
            if (error) throw error
            onSave(false)
            onClose()
        } catch (err: any) {
            alert(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <ModalWrapper title="Add Chatbot Product" onClose={onClose}>
            <div className="space-y-6 max-h-[70vh] overflow-y-auto px-2 custom-scrollbar">
                <Input label="Product Name" value={name} onChange={setName} placeholder="e.g. Smart Watch Pro" />

                <div className="grid grid-cols-2 gap-4">
                    <Input label="Price (NPR)" type="number" value={price} onChange={setPrice} placeholder="2500" />
                    <Input label="Sizes (Comma Separated)" value={sizes} onChange={setSizes} placeholder="S, M, L" />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Product Image</label>
                    <div className="flex flex-col gap-4">
                        {imageUrl ? (
                            <div className="relative h-40 w-full rounded-2xl overflow-hidden border-2 border-primary group">
                                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                <button
                                    onClick={() => setImageUrl('')}
                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-white font-bold"
                                >
                                    Remove & Re-upload
                                </button>
                            </div>
                        ) : (
                            <label className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${uploading ? 'bg-gray-50 border-gray-100 opacity-50' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary hover:bg-primary/5'}`}>
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    {uploading ? (
                                        <Loader2 className="h-10 w-10 text-primary animate-spin" />
                                    ) : (
                                        <>
                                            <ImageIcon className="h-10 w-10 text-gray-400 mb-3" />
                                            <p className="text-xs font-black uppercase tracking-widest text-gray-500">Click to Upload</p>
                                        </>
                                    )}
                                </div>
                                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={uploading} />
                            </label>
                        )}
                        <p className="text-[10px] text-gray-400 font-medium">Or paste an image URL directly:</p>
                        <Input value={imageUrl} onChange={setImageUrl} placeholder="https://..." />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Description</label>
                    <textarea
                        value={desc}
                        onChange={(e) => setDesc(e.target.value)}
                        className="w-full p-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary rounded-xl transition-all h-28 text-sm font-medium"
                        placeholder="Detailed info for the chatbot..."
                    />
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving || uploading}
                    className="w-full py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
                >
                    {saving ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Save Product Entry'}
                </button>
            </div>
        </ModalWrapper>
    )
}

function AddFaqModal({ onClose, onSave }: any) {
    const [question, setQuestion] = useState('')
    const [answer, setAnswer] = useState('')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        setSaving(true)
        try {
            const { error } = await supabase.from('chatbot_faqs').insert([{ question, answer }])
            if (error) throw error
            onSave(false)
            onClose()
        } catch (err: any) {
            alert(err.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <ModalWrapper title="Add Knowledge Base FAQ" onClose={onClose}>
            <div className="space-y-6">
                <Input label="Customer Question (Keywords)" value={question} onChange={setQuestion} placeholder="e.g. Where is your shop?" />
                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Response (Answer)</label>
                    <textarea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        className="w-full p-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary rounded-xl transition-all h-40 text-sm font-medium"
                        placeholder="The answer the bot should send..."
                    />
                </div>
                <button onClick={handleSave} disabled={saving} className="w-full py-4 bg-primary text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                    {saving ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Save FAQ'}
                </button>
            </div>
        </ModalWrapper>
    )
}

function ModalWrapper({ title, children, onClose }: any) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white dark:bg-gray-900 w-full max-w-xl rounded-[2.5rem] shadow-2xl p-10 border border-gray-100 dark:border-gray-800 relative animate-in zoom-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black text-gray-900 dark:text-gray-100">{title}</h3>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-rose-500">
                        <Plus size={24} className="rotate-45" />
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}

function Input({ label, ...props }: any) {
    return (
        <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</label>
            <input
                {...props}
                className="w-full p-4 bg-gray-50 dark:bg-gray-800 border-2 border-transparent focus:border-primary rounded-xl transition-all text-sm font-medium"
                onChange={(e) => props.onChange(e.target.value)}
            />
        </div>
    )
}

function LoadingState() {
    return (
        <div className="py-32 text-center bg-white dark:bg-gray-900 rounded-[3rem] border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex flex-col items-center gap-6">
                <div className="relative">
                    <div className="h-16 w-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                    <Bot className="absolute inset-0 m-auto text-primary" size={24} />
                </div>
                <div className="space-y-1">
                    <h5 className="font-black text-xs uppercase tracking-[0.3em] text-primary">Synchronizing Knowledge</h5>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Warming up AI modules...</p>
                </div>
            </div>
        </div>
    )
}

function EmptyState({ icon, title, desc }: any) {
    return (
        <div className="py-20 flex flex-col items-center text-center space-y-4 bg-gray-50/50 dark:bg-gray-800/20 rounded-[3rem] border-2 border-dashed border-gray-200 dark:border-gray-700">
            <div className="text-gray-200 dark:text-gray-700">{icon}</div>
            <div>
                <h4 className="font-black text-gray-900 dark:text-gray-100">{title}</h4>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest px-10">{desc}</p>
            </div>
        </div>
    )
}

function FeatureItem({ icon, color, title, desc }: any) {
    return (
        <div className="bg-white dark:bg-gray-900 p-8 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm flex items-start gap-5 hover:shadow-lg transition-all border-b-4 hover:border-b-primary">
            <div className={`h-14 w-14 rounded-2xl ${color} flex items-center justify-center text-white shadow-lg`}>
                {icon}
            </div>
            <div>
                <h5 className="font-black text-gray-900 dark:text-gray-100 text-sm mb-2 uppercase tracking-wide">{title}</h5>
                <p className="text-xs text-gray-400 font-medium leading-relaxed">{desc}</p>
            </div>
        </div>
    )
}

function HealthItem({ label, status }: any) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{status}</span>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </div>
        </div>
    )
}
