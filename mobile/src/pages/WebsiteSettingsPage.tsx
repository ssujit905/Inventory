import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import { Globe, Save, Loader2, Check, AlertTriangle, Type, Phone, Mail, MapPin, Share2, Image, Zap, Search, X, Trash2 } from 'lucide-react';

interface Setting {
    key: string;
    value: string;
}

const SETTING_GROUPS = [
    {
        title: 'Hero Slider',
        icon: <Image size={16} />,
        keys: [
            { key: 'hero_badge', label: 'Badge Text', placeholder: "Nepal's Most Trusted Store" },
            { key: 'hero_slider_1_image', label: 'Slide 1 Image URL', placeholder: 'https://...' },
            { key: 'hero_slider_1_title', label: 'Slide 1 Title', placeholder: 'New Collection' },
            { key: 'hero_slider_2_image', label: 'Slide 2 Image URL', placeholder: 'https://...' },
            { key: 'hero_slider_2_title', label: 'Slide 2 Title', placeholder: 'Mega Sale' },
            { key: 'hero_slider_3_image', label: 'Slide 3 Image URL', placeholder: 'https://...' },
            { key: 'hero_slider_3_title', label: 'Slide 3 Title', placeholder: 'Loyalty Rewards' },
        ]
    },
    {
        title: 'Store Info',
        icon: <Type size={16} />,
        keys: [
            { key: 'store_name', label: 'Store Name', placeholder: 'Shopi Nepal' },
            { key: 'store_tagline', label: 'Tagline', placeholder: 'Your one-stop destination...', textarea: true },
        ]
    },
    {
        title: 'Contact Details',
        icon: <Phone size={16} />,
        keys: [
            { key: 'store_phone', label: 'Phone', placeholder: '+977-9845877777' },
            { key: 'support_phone', label: 'WhatsApp Support Number', placeholder: '9845877777' },
            { key: 'store_email', label: 'Email', placeholder: 'info@shopinepal.com' },
            { key: 'store_address', label: 'Address', placeholder: 'Kathmandu, Nepal' },
        ]
    },
    {
        title: 'Social Links',
        icon: <Share2 size={16} />,
        keys: [
            { key: 'facebook_url', label: 'Facebook URL', placeholder: 'https://facebook.com/...' },
            { key: 'instagram_url', label: 'Instagram URL', placeholder: 'https://instagram.com/...' },
            { key: 'twitter_url', label: 'Twitter / X URL', placeholder: 'https://twitter.com/...' },
        ]
    },
    {
        title: '⚡ Flash Sale (Live Control)',
        icon: <Zap size={16} className="text-rose-500" />,
        //@ts-ignore
        isFlashSale: true,
        keys: [
            { key: 'flash_sale_enabled', label: 'Flash Sale Mode', type: 'toggle' },
            { key: 'flash_sale_end', label: 'Sale End Time', type: 'datetime', placeholder: 'Select end time...' },
        ]
    }
];



interface Product {
    id: number;
    title: string;
    image: string;
    price: number;
}


export default function WebsiteSettingsPage() {
    const { profile } = useAuthStore();
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [products, setProducts] = useState<Product[]>([]);
    const [flashSaleProducts, setFlashSaleProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => { 
        fetchSettings(); 
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        setLoadingProducts(true);
        const { data } = await supabase.from('website_products').select('id, title, price, website_product_images(image_url, is_primary)').order('title');
        // Simple map to flatten the primary image
        const formatted = (data || []).map(p => ({
            ...p,
            image: p.website_product_images?.find((img: any) => img.is_primary)?.image_url || p.website_product_images?.[0]?.image_url || ''
        }));
        setProducts(formatted);
        setLoadingProducts(false);
    };

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('website_settings_draft');
        if (savedDraft && !loading) {
            try {
                const { settings: dSettings, flashSaleProducts: dFlash } = JSON.parse(savedDraft);
                if (dSettings) setSettings(prev => ({ ...prev, ...dSettings }));
                if (dFlash) setFlashSaleProducts(dFlash);
            } catch (e) { console.error('Settings draft restore failed'); }
        }
    }, [loading]);

    useEffect(() => {
        if (!loading && Object.keys(settings).length > 0) {
            const draft = { settings, flashSaleProducts };
            localStorage.setItem('website_settings_draft', JSON.stringify(draft));
        }
    }, [settings, flashSaleProducts, loading]);

    const clearDraft = () => {
        localStorage.removeItem('website_settings_draft');
    };


    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchSettings = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('website_settings').select('*');
        if (error) showToast(error.message, 'error');
        else {
            const map: Record<string, string> = {};
            (data as Setting[]).forEach(s => { map[s.key] = s.value; });
            setSettings(map);

            if (map['flash_sale_config']) {
                try {
                    const config = JSON.parse(map['flash_sale_config']);
                    setFlashSaleProducts(Array.isArray(config) ? config : []);
                } catch (e) {
                    setFlashSaleProducts([]);
                }
            }
        }
        setLoading(false);
    };

    const addProductToSale = (p: Product) => {
        if (flashSaleProducts.find(fp => fp.id === p.id)) return;
        setFlashSaleProducts([...flashSaleProducts, { ...p, discount: 0 }]);
    };

    const removeProductFromSale = (id: number) => {
        setFlashSaleProducts(flashSaleProducts.filter(p => p.id !== id));
    };

    const updateProductDiscount = (id: number, discount: number) => {
        setFlashSaleProducts(flashSaleProducts.map(p => p.id === id ? { ...p, discount } : p));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(key);
        try {
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const { error: uploadError } = await supabase.storage
                .from('website-images')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('website-images')
                .getPublicUrl(fileName);

            update(key, publicUrl);
            showToast(`Image uploaded successfully!`);
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setUploading(null);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const currentSettings = { ...settings };
            currentSettings['flash_sale_config'] = JSON.stringify(flashSaleProducts);

            const upserts = Object.entries(currentSettings).map(([key, value]) => ({
                key, value: value || '', updated_at: new Date().toISOString()
            }));
            const { error } = await supabase.from('website_settings').upsert(upserts, { onConflict: 'key' });
            if (error) throw error;
            clearDraft();
            showToast('Settings saved!');
        } catch (err: any) {
            showToast(err.message || 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const update = (key: string, value: string) => {
        setSettings(s => ({ ...s, [key]: value }));
    };

    if (loading) return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-primary mb-4" />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Syncing Config...</p>
            </div>
        </DashboardLayout>
    );

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-[11px] font-black uppercase tracking-widest animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="px-5 max-w-7xl mx-auto space-y-6 pb-12">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Website Settings</h1>
                        <p className="text-gray-400 font-medium text-xs uppercase tracking-widest">Control your website content and branding.</p>
                    </div>
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 disabled:opacity-50 transition-all"
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {saving ? 'Saving...' : 'Deploy Changes'}
                        </button>
                    </div>
                </div>

                {/* Live Preview Banner */}
                <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl flex items-center gap-4">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <Globe size={20} />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-gray-900 dark:text-gray-100 uppercase tracking-tight">Real-time Synchronization Active</p>
                        <p className="text-[10px] text-gray-500 font-medium leading-relaxed">Your storefront updates instantly across all user devices when you save these values.</p>
                    </div>
                </div>

                {/* Settings Groups */}
                {SETTING_GROUPS.map(group => (
                    <div key={group.title} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                        {/* Group Header */}
                        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                            <span className="text-primary">{group.icon}</span>
                            <p className="text-[10px] font-bold text-gray-900 dark:text-gray-100 uppercase tracking-widest">{group.title}</p>
                        </div>

                        <div className="p-5 space-y-5">
                            {group.keys.map(field => (
                                <div key={field.key} className="space-y-1.5">
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">{field.label}</label>
                                    
                                    {field.key.includes('image') ? (
                                        <div className="space-y-3">
                                            {settings[field.key] && (
                                                <div className="relative w-full aspect-[21/9] rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-inner group">
                                                    <img src={settings[field.key]} className="w-full h-full object-cover" alt="Preview" />
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <button 
                                                            onClick={() => update(field.key, '')}
                                                            className="p-2 bg-rose-500 text-white rounded-full hover:scale-110 transition-transform"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-4">
                                                <label className={`flex-1 flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${uploading === field.key ? 'bg-gray-50 border-gray-200' : 'bg-gray-50/50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800 hover:border-primary/30'}`}>
                                                    <input 
                                                        type="file" 
                                                        accept="image/*" 
                                                        className="hidden" 
                                                        onChange={(e) => handleFileUpload(e, field.key)}
                                                        disabled={uploading === field.key}
                                                    />
                                                    {uploading === field.key ? (
                                                        <>
                                                            <Loader2 size={24} className="animate-spin text-primary" />
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase">Uploading...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="h-10 w-10 rounded-xl bg-white dark:bg-gray-900 flex items-center justify-center shadow-sm border border-gray-100 dark:border-gray-800">
                                                                <Image size={20} className="text-primary" />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                                                                {settings[field.key] ? 'Replace Asset' : 'Upload Asset'}
                                                            </span>
                                                        </>
                                                    )}
                                                </label>
                                            </div>
                                        </div>
                                    ) : (field as any).textarea ? (
                                        <textarea
                                            value={settings[field.key] || ''}
                                            onChange={e => update(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            rows={3}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-xs font-bold focus:border-primary/30 outline-none transition-all"
                                        />
                                    ) : (field as any).type === 'datetime' ? (
                                        <input
                                            type="datetime-local"
                                            value={settings[field.key]?.replace(' ', 'T') || ''}
                                            onChange={e => update(field.key, e.target.value.replace('T', ' '))}
                                            className="w-full h-11 px-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-xs font-bold focus:border-primary/30 outline-none transition-all"
                                        />
                                    ) : (field as any).type === 'toggle' ? (
                                        <div 
                                            onClick={() => update(field.key, settings[field.key] === 'true' ? 'false' : 'true')}
                                            className="flex items-center gap-3 cursor-pointer bg-gray-50/50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700"
                                        >
                                            <div className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${settings[field.key] === 'true' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm ${settings[field.key] === 'true' ? 'left-5.5' : 'left-0.5'}`} />
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                                {settings[field.key] === 'true' ? 'Publicly Visible' : 'Hidden from site'}
                                            </span>
                                        </div>
                                    ) : (
                                        <input
                                            type="text"
                                            value={settings[field.key] || ''}
                                            onChange={e => update(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            className="w-full h-11 px-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 text-xs font-bold focus:border-primary/30 outline-none transition-all"
                                        />
                                    )}
                                </div>
                            ))}                            {/* Flash Sale specific UI */}
                            {//@ts-ignore
                            group.isFlashSale && (
                                <div className="pt-6 border-t border-gray-100 dark:border-gray-800 space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-1">Configure Event Catalog</label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                                                    <Search size={14} />
                                                </div>
                                                <select 
                                                    className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 text-xs font-bold outline-none focus:border-primary transition-all appearance-none cursor-pointer"
                                                    onChange={(e) => {
                                                        const p = products.find(prod => prod.id === Number(e.target.value));
                                                        if (p) addProductToSale(p);
                                                        e.target.value = ""; 
                                                    }}
                                                    defaultValue=""
                                                >
                                                    <option value="" disabled>Select product...</option>
                                                    {products.map(p => (
                                                        <option key={p.id} value={p.id}>{p.title}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="h-12 w-12 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
                                                <Zap size={18} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between px-1">
                                            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Selected Items ({flashSaleProducts.length})</h4>
                                        </div>
                                        <div className="space-y-3">
                                            {flashSaleProducts.map(p => {
                                                const discount = Number(p.discount || 0);
                                                const salePrice = Math.floor(p.price - (p.price * (discount / 100)));
                                                return (
                                                    <div key={p.id} className="flex flex-col gap-3 p-4 bg-gray-50/50 dark:bg-gray-800/30 rounded-xl border border-gray-50 dark:border-gray-800 group transition-all">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
                                                                <img src={p.image} className="w-full h-full object-cover" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-[11px] font-bold text-gray-900 dark:text-gray-100 truncate">{p.title}</p>
                                                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight">Original: Rs.{p.price}</p>
                                                            </div>
                                                            <button 
                                                                onClick={() => removeProductFromSale(p.id)}
                                                                className="p-1.5 text-gray-300 hover:text-rose-500 transition-colors"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>

                                                        <div className="flex items-center gap-4 pt-2 border-t border-gray-100 dark:border-gray-800">
                                                            <div className="flex-1 space-y-1">
                                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-0.5">Discount %</label>
                                                                <input 
                                                                    type="number"
                                                                    value={p.discount}
                                                                    onChange={(e) => updateProductDiscount(p.id, Number(e.target.value))}
                                                                    className="w-full h-9 px-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 text-[10px] font-black focus:border-primary outline-none"
                                                                    placeholder="0"
                                                                />
                                                            </div>
                                                            <div className="text-right px-3 py-1.5 bg-rose-500/5 dark:bg-rose-500/10 rounded-lg border border-rose-100 dark:border-rose-900/30 min-w-[80px]">
                                                                <p className="text-[8px] font-bold text-gray-400 uppercase">Flash Price</p>
                                                                <p className="text-[11px] font-black text-rose-500">Rs.{salePrice.toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {flashSaleProducts.length === 0 && (
                                                <div className="py-10 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl">
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">No active deals</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* Final Save */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-4 bg-primary text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-primary/30 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Deploy All Settings
                </button>
            </div>
        </DashboardLayout>
    );
}
