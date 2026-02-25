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

    // Component Data State
    const [products, setProducts] = useState<any[]>([])
    const [faqs, setFaqs] = useState<any[]>([])
    const [notifications, setNotifications] = useState<any[]>([])
    const [shortcuts, setShortcuts] = useState<any[]>([])

    // Settings State
    const [chatbotEnabled, setChatbotEnabled] = useState(true)
    const [tempChatbotEnabled, setTempChatbotEnabled] = useState(true)
    const [lastSynced, setLastSynced] = useState<Date | null>(null)

    // Modal States
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
        channelName: 'chatbot-mobile-sync',
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
            setStatus({ type: 'success', text: 'Chatbot settings synchronized!' })
            setTimeout(() => setStatus(null), 3000)
        } catch (err: any) {
            setStatus({ type: 'error', text: `Error: ${err.message}` })
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (table: string, id: string) => {
        if (!confirm('Delete this item?')) return;
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
            <div className="space-y-6 pb-20">
                {/* Mobile Specific Header */}
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 font-outfit tracking-tighter">AI Command Center</h1>
                    <div className="flex items-center gap-2 mt-2">
                        <div className={`h-2 w-2 rounded-full ${chatbotEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {chatbotEnabled ? 'Engine Online' : 'Engine Offline'}
                        </span>
                    </div>
                </div>

                {/* Compact Tab Navigation (Scrollable) */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1">
                    <MobileTabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Zap size={14} />} label="Overview" />
                    <MobileTabButton active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={<Package size={14} />} label="Catalog" />
                    <MobileTabButton active={activeTab === 'faqs'} onClick={() => setActiveTab('faqs')} icon={<HelpCircle size={14} />} label="Brain" />
                    <MobileTabButton active={activeTab === 'shortcuts'} onClick={() => setActiveTab('shortcuts')} icon={<MoreVertical size={14} />} label="Buttons" />
                    <MobileTabButton active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} icon={<Bell size={14} />} label="Inbox" badge={notifications.filter(n => n.status === 'unresolved').length} />
                </div>

                {status && (
                    <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                        {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                        {status.text}
                    </div>
                )}

                {fetching && activeTab === 'settings' ? (
                    <div className="py-20 flex flex-col items-center gap-4 text-gray-400">
                        <Loader2 className="animate-spin" size={32} />
                        <p className="text-[10px] font-black uppercase tracking-widest">Syncing AI Brain...</p>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-2">
                        {activeTab === 'settings' && (
                            <div className="space-y-6">
                                <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl" />
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-lg font-black">Visibility Switch</h3>
                                        <div className={`p-3 rounded-xl ${tempChatbotEnabled ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                                            <MessageSquare size={20} />
                                        </div>
                                    </div>

                                    <div className="bg-gray-50/50 dark:bg-gray-800/30 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bot Status</p>
                                            <p className={`text-base font-black ${tempChatbotEnabled ? 'text-primary' : 'text-gray-400'}`}>{tempChatbotEnabled ? 'ACTIVE' : 'IDLE'}</p>
                                        </div>
                                        <button
                                            onClick={() => setTempChatbotEnabled(!tempChatbotEnabled)}
                                            className={`relative h-7 w-12 rounded-full transition-all ${tempChatbotEnabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}
                                        >
                                            <div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${tempChatbotEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                    </div>

                                    <button
                                        onClick={handleSaveSettings}
                                        disabled={loading || tempChatbotEnabled === chatbotEnabled}
                                        className="w-full mt-6 py-4 bg-primary hover:bg-primary/95 disabled:bg-gray-100 disabled:text-gray-400 text-white font-black rounded-2xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                                        Push Live Sync
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <HealthBox label="DB Sync" status="optimal" />
                                    <HealthBox label="Bot Engine" status="optimal" />
                                </div>
                            </div>
                        )}

                        {activeTab === 'products' && (
                            <div className="space-y-6">
                                <SectionHeader title="Product Catalog" desc="Click cards to edit details" onAdd={() => setShowAddProduct(true)} />
                                {products.length === 0 ? <MobileEmptyState title="No Products" /> : (
                                    <div className="grid grid-cols-1 gap-4">
                                        {products.map(p => (
                                            <div key={p.id} className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-4 flex gap-4">
                                                <div className="h-20 w-20 flex-shrink-0 bg-gray-50 dark:bg-gray-800 rounded-2xl overflow-hidden relative">
                                                    {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={20} className="m-auto text-gray-300" />}
                                                </div>
                                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                                    <div>
                                                        <h4 className="font-bold text-gray-900 dark:text-gray-100 truncate">{p.name}</h4>
                                                        <p className="text-[10px] text-primary font-black uppercase tracking-widest mt-0.5">NPR {parseFloat(p.price).toLocaleString()}</p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => setEditingProduct(p)} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-primary"><Edit3 size={14} /></button>
                                                        <button onClick={() => handleDelete('chatbot_products', p.id)} className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-400 hover:text-rose-500"><Trash2 size={14} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'faqs' && (
                            <div className="space-y-6">
                                <SectionHeader title="FAQ Brain" desc="Manage bot knowledge" onAdd={() => setShowAddFaq(true)} />
                                <div className="space-y-3">
                                    {faqs.map(f => (
                                        <div key={f.id} className="bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-100 dark:border-gray-800 relative group">
                                            <button onClick={() => handleDelete('chatbot_faqs', f.id)} className="absolute top-4 right-4 text-gray-300 hover:text-rose-500"><Trash2 size={16} /></button>
                                            <p className="text-xs font-black text-primary uppercase tracking-widest mb-1">Question</p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 pr-8">{f.question}</p>
                                            <p className="text-xs font-black text-emerald-500 uppercase tracking-widest mb-1">AI Answer</p>
                                            <p className="text-[11px] font-medium text-gray-500 leading-relaxed">{f.answer}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'shortcuts' && (
                            <div className="space-y-6">
                                <SectionHeader title="Quick Buttons" desc="Messenger shortcuts" onAdd={() => setShowAddShortcut(true)} />
                                <div className="grid grid-cols-1 gap-4">
                                    {shortcuts.map(s => (
                                        <div key={s.id} className={`p-5 rounded-3xl border flex items-center justify-between gap-4 ${s.is_active ? 'bg-white border-primary/20 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 opacity-60'}`}>
                                            <div className="min-w-0">
                                                <h4 className="font-bold truncate">{s.label}</h4>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">{s.payload}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => toggleShortcut(s.id, s.is_active)} className={`p-2 rounded-xl border ${s.is_active ? 'bg-primary text-white border-primary' : 'bg-white text-gray-400 border-gray-200'}`}><Zap size={14} /></button>
                                                <button onClick={() => handleDelete('chatbot_shortcuts', s.id)} className="p-2 bg-white text-gray-400 border border-gray-200 rounded-xl hover:text-rose-500"><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === 'notifications' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-black tracking-tight">Human Inbox</h3>
                                    <span className="px-3 py-1 bg-amber-500 text-white text-[8px] font-black uppercase rounded-full">Manual Required</span>
                                </div>
                                <div className="space-y-4">
                                    {notifications.map(n => (
                                        <div key={n.id} className={`p-5 rounded-3xl border ${n.status === 'unresolved' ? 'bg-amber-50 border-amber-200 shadow-sm shadow-amber-500/5' : 'bg-white border-gray-100 dark:border-gray-800 opacity-60'}`}>
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-xl bg-gray-200 flex items-center justify-center font-black text-gray-500">{n.customer_name?.charAt(0)}</div>
                                                    <div>
                                                        <h4 className="text-sm font-black">{n.customer_name}</h4>
                                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{new Date(n.created_at).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                                {n.status === 'unresolved' && <button onClick={() => resolveNotification(n.id)} className="p-2 bg-emerald-500 text-white rounded-xl"><CheckCircle2 size={14} /></button>}
                                            </div>
                                            <p className="text-xs text-gray-600 bg-white/50 p-3 rounded-xl border border-gray-100 italic">"{n.last_message}"</p>
                                            <a
                                                href={`https://m.me/${n.psid}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-4 w-full h-11 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                                            >
                                                <ExternalLink size={14} /> Jump To Chat
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modals - Simplified for Mobile */}
            {showAddProduct && <MobileProductModal onClose={() => setShowAddProduct(false)} onSave={fetchData} />}
            {editingProduct && <MobileProductModal product={editingProduct} onClose={() => setEditingProduct(null)} onSave={fetchData} />}
            {showAddFaq && <MobileFaqModal onClose={() => setShowAddFaq(false)} onSave={fetchData} />}
            {showAddShortcut && <MobileShortcutModal onClose={() => setShowAddShortcut(false)} onSave={fetchData} />}

        </DashboardLayout>
    )
}

// --- MOBILE COMPONENTS ---

function MobileTabButton({ active, onClick, icon, label, badge }: any) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl min-w-[70px] transition-all relative ${active
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-gray-400'
                }`}
        >
            {icon}
            <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
            {badge && badge > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-rose-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white">{badge}</span>
            )}
        </button>
    )
}

function SectionHeader({ title, desc, onAdd }: any) {
    return (
        <div className="flex items-center justify-between gap-4">
            <div>
                <h3 className="text-lg font-black leading-tight">{title}</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{desc}</p>
            </div>
            <button onClick={onAdd} className="h-11 w-11 bg-primary text-white rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center"><Plus size={20} /></button>
        </div>
    )
}

function HealthBox({ label, status }: any) {
    return (
        <div className="p-4 bg-white dark:bg-gray-900 rounded-[1.5rem] border border-gray-100 dark:border-gray-800 flex items-center gap-3">
            <div className={`h-2 w-2 rounded-full ${status === 'optimal' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <div>
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase">{status}</p>
            </div>
        </div>
    )
}

function MobileEmptyState({ title }: any) {
    return (
        <div className="py-12 bg-white dark:bg-gray-900 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800 text-center">
            <p className="text-xs font-black text-gray-300 uppercase underline decoration-gray-100 underline-offset-4 tracking-widest">{title}</p>
        </div>
    )
}

// --- MOBILE MODALS ---

function MobileProductModal({ product, onClose, onSave }: any) {
    const isEdit = !!product;
    const [name, setName] = useState(product?.name || '')
    const [price, setPrice] = useState(product?.price?.toString() || '')
    const [desc, setDesc] = useState(product?.description || '')
    const [sizes, setSizes] = useState(product?.sizes?.join(', ') || '')
    const [imageUrl, setImageUrl] = useState(product?.image_url || '')
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)

    const handleFileUpload = async (e: any) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        try {
            const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.jpg`
            const { error } = await supabase.storage.from('images').upload(`chatbot-products/${fileName}`, file)
            if (error) throw error
            const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(`chatbot-products/${fileName}`)
            setImageUrl(publicUrl)
        } catch (err: any) {
            alert(`Upload failed: ${err.message}`)
        } finally {
            setUploading(false)
        }
    }

    const handleSave = async () => {
        if (!name || !price) return alert('Name and Price required')
        setSaving(true)
        try {
            const sizeArr = sizes.split(',').map((s: string) => s.trim()).filter((s: string) => s)
            const payload = { name, description: desc, price: parseFloat(price), sizes: sizeArr, image_url: imageUrl };
            const { error } = isEdit
                ? await supabase.from('chatbot_products').update(payload).eq('id', product.id)
                : await supabase.from('chatbot_products').insert([payload]);
            if (error) throw error
            onSave(false); onClose();
        } catch (err: any) { alert(err.message) } finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-end animate-in fade-in duration-300">
            <div className="bg-white dark:bg-gray-950 w-full rounded-t-[2.5rem] p-8 space-y-6 animate-in slide-in-from-bottom duration-300 overflow-y-auto max-h-[90vh]">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-black">{isEdit ? 'Edit Product' : 'Add Product'}</h3>
                    <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full"><Plus size={20} className="rotate-45" /></button>
                </div>

                <div className="space-y-4">
                    <label className="block">
                        <span className="text-[10px] font-black uppercase text-gray-400">Name</span>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm font-bold" />
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                            <span className="text-[10px] font-black uppercase text-gray-400">Price</span>
                            <input type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full mt-1 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm font-bold" />
                        </label>
                        <label className="block">
                            <span className="text-[10px] font-black uppercase text-gray-400">Sizes (S,M)</span>
                            <input value={sizes} onChange={e => setSizes(e.target.value)} className="w-full mt-1 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm font-bold" />
                        </label>
                    </div>

                    <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase text-gray-400">Product Image</span>
                        <div className="flex flex-col gap-3">
                            {imageUrl ? (
                                <div className="h-40 w-full bg-gray-50 rounded-2xl overflow-hidden relative border-2 border-primary">
                                    <img src={imageUrl} className="w-full h-full object-cover" />
                                    <button onClick={() => setImageUrl('')} className="absolute inset-0 bg-black/40 flex items-center justify-center text-white font-black text-xs uppercase">Remove</button>
                                </div>
                            ) : (
                                <label className="h-40 w-full border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2">
                                    {uploading ? <Loader2 className="animate-spin text-primary" /> : <ImageIcon className="text-gray-300" size={32} />}
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tap to Upload</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                                </label>
                            )}
                        </div>
                    </div>

                    <label className="block">
                        <span className="text-[10px] font-black uppercase text-gray-400">Description</span>
                        <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full mt-1 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm font-medium h-24" />
                    </label>
                </div>

                <button onClick={handleSave} disabled={saving || uploading} className="w-full py-5 bg-primary text-white text-xs font-black uppercase rounded-2xl shadow-xl shadow-primary/20">
                    {saving ? 'Processing...' : (isEdit ? 'Update Product' : 'Create Product')}
                </button>
            </div>
        </div>
    )
}

function MobileFaqModal({ onClose, onSave }: any) {
    const [q, setQ] = useState('')
    const [a, setA] = useState('')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        if (!q || !a) return alert('Fill both fields')
        setSaving(true)
        try {
            await supabase.from('chatbot_faqs').insert([{ question: q, answer: a }])
            onSave(false); onClose();
        } catch (err: any) { alert(err.message) } finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-end animate-in fade-in">
            <div className="bg-white dark:bg-gray-950 w-full rounded-t-[2.5rem] p-8 space-y-6 animate-in slide-in-from-bottom">
                <h3 className="text-xl font-black">Add New FAQ</h3>
                <div className="space-y-4">
                    <textarea placeholder="Customer Question" value={q} onChange={e => setQ(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm font-bold h-20" />
                    <textarea placeholder="Bot's Answer" value={a} onChange={e => setA(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm font-medium h-28" />
                </div>
                <button onClick={handleSave} disabled={saving} className="w-full py-5 bg-primary text-white text-xs font-black uppercase rounded-2xl tracking-widest">
                    {saving ? 'Adding Brain...' : 'Add Knowledge'}
                </button>
                <button onClick={onClose} className="w-full py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Cancel</button>
            </div>
        </div>
    )
}

function MobileShortcutModal({ onClose, onSave }: any) {
    const [label, setLabel] = useState('')
    const [payload, setPayload] = useState('')
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        if (!label || !payload) return alert('Both required')
        setSaving(true)
        try {
            await supabase.from('chatbot_shortcuts').insert([{ label, payload }])
            onSave(false); onClose();
        } catch (err: any) { alert(err.message) } finally { setSaving(false) }
    }

    return (
        <div className="fixed inset-0 z-[110] bg-black/60 flex items-end animate-in fade-in">
            <div className="bg-white dark:bg-gray-950 w-full rounded-t-[2.5rem] p-8 space-y-6 animate-in slide-in-from-bottom">
                <h3 className="text-xl font-black">New Messenger Button</h3>
                <div className="space-y-4">
                    <input placeholder="Button Label (Visible)" value={label} onChange={e => setLabel(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm font-bold" />
                    <input placeholder="Action Keywords (Hidden)" value={payload} onChange={e => setPayload(e.target.value)} className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm font-bold" />
                </div>
                <button onClick={handleSave} disabled={saving} className="w-full py-5 bg-primary text-white text-xs font-black uppercase rounded-2xl tracking-widest">
                    {saving ? 'Creating...' : 'Create Button'}
                </button>
                <button onClick={onClose} className="w-full py-3 text-[10px] font-black uppercase text-gray-400 tracking-widest">Cancel</button>
            </div>
        </div>
    )
}
