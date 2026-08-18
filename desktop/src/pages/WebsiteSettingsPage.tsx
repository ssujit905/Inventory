import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase, supabaseWithTimeout, warmUpSupabase } from '../lib/supabase';
import { getVendorId, isVendorMember } from '../lib/vendorHelpers';
import { buildStoreLink } from '../lib/storeLink';
import { Globe, Save, Loader2, Check, AlertTriangle, Type, Phone, Mail, MapPin, Share2, Image, Zap, Search, X, Trash2, CreditCard, Store, ShieldCheck, Camera, Link2, Copy, ExternalLink } from 'lucide-react';

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
            { key: 'tiktok_url', label: 'TikTok URL', placeholder: 'https://tiktok.com/@...' },
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
    },
    {
        title: '💳 eSewa Payment Gateway',
        icon: <CreditCard size={16} className="text-emerald-500" />,
        keys: [
            {
                key: 'esewa_environment',
                label: 'Payment Mode / Environment',
                type: 'select',
                options: [
                    { label: 'Test Mode (Sandbox - rc-epay.esewa.com.np)', value: 'test' },
                    { label: 'Live Mode (Production - epay.esewa.com.np)', value: 'live' }
                ]
            },
            { key: 'esewa_merchant_code', label: 'eSewa Merchant Code (Product Code)', placeholder: 'EPAYTEST' },
        ]
    },
    {
        title: '📱 Fonepay Payment Gateway',
        icon: <CreditCard size={16} className="text-red-500" />,
        keys: [
            {
                key: 'fonepay_environment',
                label: 'Payment Mode / Environment',
                type: 'select',
                options: [
                    { label: 'Test Mode (Sandbox - dev-clientapi.fonepay.com)', value: 'test' },
                    { label: 'Live Mode (Production - clientapi.fonepay.com)', value: 'live' }
                ]
            },
            { key: 'fonepay_merchant_id', label: 'Fonepay Merchant ID (Product ID / PID)', placeholder: 'TESTMERCHANT' },
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
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [uploading, setUploading] = useState<string | null>(null);

    // When the app window loses focus / sleeps, in-flight requests can hang and
    // even deadlock the Supabase auth lock. Abort any pending submit as soon as
    // the user returns so the button never spins indefinitely.
    const activeSubmitRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const handleResume = () => {
            activeSubmitRef.current?.abort();
            activeSubmitRef.current = null;
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') handleResume();
        };
        window.addEventListener('focus', handleResume);
        window.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('focus', handleResume);
            window.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    // Final failsafe: regardless of what the underlying promises do, the button
    // can never stay in its "Saving..." state longer than this.
    useEffect(() => {
        if (!saving) return;
        const t = setTimeout(() => {
            setSaving(false);
            showToast('Request timed out. Please check your connection and try again.', 'error');
        }, 40000);
        return () => clearTimeout(t);
    }, [saving]);

    const [vendorForm, setVendorForm] = useState({
        store_name: '',
        contact_person: '',
        phone: '',
        whatsapp: '',
        email: '',
        address: '',
        city: '',
        description: '',
        avatar_url: '',
        bank_name: '',
        bank_account_holder: '',
        bank_account_number: '',
        bank_branch: '',
        esewa_id: ''
    });
    const [isVendorVerified, setIsVendorVerified] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    useEffect(() => { 
        if (isVendorMember(profile)) {
            fetchVendorProfile();
        } else {
            fetchSettings(); 
            fetchProducts();
        }
    }, [profile]);

    const fetchVendorProfile = async () => {
        setLoading(true);
        if (profile?.id) {
            const { data } = await supabase.from('profiles').select('*').eq('id', profile.id).maybeSingle();
            if (data) {
                setVendorForm({
                    store_name: data.store_name || data.full_name || '',
                    contact_person: data.full_name || '',
                    phone: data.phone || '',
                    whatsapp: data.whatsapp || data.phone || '',
                    email: data.email || '',
                    address: data.address || '',
                    city: data.city || '',
                    description: data.description || '',
                    avatar_url: data.avatar_url || '',
                    bank_name: data.bank_name || '',
                    bank_account_holder: data.bank_account_holder || '',
                    bank_account_number: data.bank_account_number || '',
                    bank_branch: data.bank_branch || '',
                    esewa_id: data.esewa_id || ''
                });
                setIsVendorVerified(!!data.is_verified);
            }
        }
        setLoading(false);
    };

    const handleSaveVendor = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanPhone = vendorForm.phone.replace(/\D/g, '');
        const cleanWhatsapp = vendorForm.whatsapp ? vendorForm.whatsapp.replace(/\D/g, '') : '';
        if (cleanPhone.length !== 10) {
            showToast('Phone number must be exactly 10 digits', 'error');
            return;
        }
        if (vendorForm.whatsapp && cleanWhatsapp.length !== 10) {
            showToast('WhatsApp number must be exactly 10 digits', 'error');
            return;
        }
        setSaving(true);

        // Ensure the session/connection is healthy before writing, so we don't
        // hang on a stale connection left over from backgrounding.
        await warmUpSupabase(6000);

        const controller = new AbortController();
        activeSubmitRef.current = controller;

        try {
            if (!profile?.id) return;
            const { error } = await supabaseWithTimeout(
                supabase.from('profiles').update({
                    full_name: vendorForm.contact_person,
                    store_name: vendorForm.store_name,
                    phone: cleanPhone,
                    whatsapp: cleanWhatsapp,
                    address: vendorForm.address,
                    city: vendorForm.city,
                    description: vendorForm.description,
                    avatar_url: vendorForm.avatar_url,
                    bank_name: vendorForm.bank_name,
                    bank_account_holder: vendorForm.bank_account_holder,
                    bank_account_number: vendorForm.bank_account_number,
                    bank_branch: vendorForm.bank_branch,
                    esewa_id: vendorForm.esewa_id
                }).eq('id', profile.id).abortSignal(controller.signal)
            );

            if (error) throw error;
            showToast('Vendor store settings saved successfully!');
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                showToast('Save interrupted when you left the app. Please try again.', 'error');
            } else if (err?.message === 'NETWORK_TIMEOUT') {
                showToast('Network timeout. Check your connection and try again.', 'error');
            } else {
                showToast(err.message || 'Failed to save vendor settings', 'error');
            }
        } finally {
            if (activeSubmitRef.current === controller) activeSubmitRef.current = null;
            setSaving(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile?.id) return;
        if (!file.type.startsWith('image/')) {
            e.target.value = '';
            return showToast('Please choose an image file', 'error');
        }
        setUploadingAvatar(true);
        try {
            const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
            const path = `vendor-avatars/${profile.id}.${ext}`;
            const { error: upErr } = await supabaseWithTimeout(
                supabase.storage.from('website-images').upload(path, file, { upsert: true }),
                120000
            );
            if (upErr) throw upErr;
            const { data } = supabase.storage.from('website-images').getPublicUrl(path);
            setVendorForm(f => ({ ...f, avatar_url: data.publicUrl }));
            showToast('Store logo uploaded! Click Save to apply.');
        } catch (err: any) {
            showToast(err.message || 'Failed to upload logo', 'error');
        } finally {
            setUploadingAvatar(false);
            if (e.target) e.target.value = '';
        }
    };

    const fetchProducts = async () => {
        setLoadingProducts(true);
        const vendorId = getVendorId(profile);
        let wpQuery = supabase.from('website_products').select('id, title, price, website_product_images(image_url, is_primary)').order('title');
        if (vendorId) {
            wpQuery = wpQuery.eq('vendor_id', vendorId);
        } else {
            wpQuery = wpQuery.is('vendor_id', null);
        }
        const { data } = await wpQuery;
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
                if (dSettings) {
                    delete dSettings.esewa_secret_key;
                    delete dSettings.fonepay_secret_key;
                }
                if (dSettings) setSettings(prev => ({ ...prev, ...dSettings }));
                if (dFlash) setFlashSaleProducts(dFlash);
            } catch (e) { console.error('Settings draft restore failed'); }
        }
    }, [loading]);

    useEffect(() => {
        if (!loading && Object.keys(settings).length > 0) {
            const { esewa_secret_key, fonepay_secret_key, ...safeSettings } = settings;
            const draft = { settings: safeSettings, flashSaleProducts };
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
        if (isReadOnly) return;
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(key);
        try {
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const { error: uploadError } = await supabaseWithTimeout(
                supabase.storage
                    .from('website-images')
                    .upload(fileName, file),
                120000 // Give large images up to 2 mins
            );

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
        if (isReadOnly) return;
        setSaving(true);

        // Ensure the session/connection is healthy before writing, so we don't
        // hang on a stale connection left over from backgrounding.
        await warmUpSupabase(6000);

        const controller = new AbortController();
        activeSubmitRef.current = controller;

        try {
            const currentSettings = { ...settings };
            currentSettings['flash_sale_config'] = JSON.stringify(flashSaleProducts);

            const upserts = Object.entries(currentSettings).map(([key, value]) => ({
                key, value: value || '', updated_at: new Date().toISOString()
            }));
            const { error } = await supabaseWithTimeout(
                supabase.from('website_settings').upsert(upserts, { onConflict: 'key' }).abortSignal(controller.signal)
            );
            if (error) throw error;
            clearDraft();
            showToast('Settings saved!');
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                showToast('Save interrupted when you left the app. Please try again.', 'error');
            } else if (err?.message === 'NETWORK_TIMEOUT') {
                showToast('Network timeout. Check your connection and try again.', 'error');
            } else {
                showToast(err.message || 'Save failed', 'error');
            }
        } finally {
            if (activeSubmitRef.current === controller) activeSubmitRef.current = null;
            setSaving(false);
        }
    };

    const update = (key: string, value: string) => {
        setSettings(s => ({ ...s, [key]: value }));
    };

    const handleToggleField = (key: string) => {
        if (isReadOnly) return;
        const currentVal = settings[key] === 'true';
        const nextVal = currentVal ? 'false' : 'true';
        
        if (key === 'flash_sale_enabled' && nextVal === 'true') {
            const currentEnd = settings['flash_sale_end'];
            const isPast = currentEnd ? new Date(currentEnd.replace(' ', 'T')) <= new Date() : true;
            if (isPast) {
                const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                const pad = (n: number) => n.toString().padStart(2, '0');
                const defaultEnd = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())} ${pad(future.getHours())}:${pad(future.getMinutes())}`;
                update('flash_sale_end', defaultEnd);
            }
        }
        update(key, nextVal);
    };

    // Admins and vendors can edit; staff is read-only
    const isReadOnly = profile?.role !== 'admin' && !isVendorMember(profile);

    if (loading) return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="flex h-64 items-center justify-center">
                <Loader2 size={32} className="animate-spin text-primary" />
            </div>
        </DashboardLayout>
    );

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {/* Global Toast Notification */}
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="max-w-3xl mx-auto space-y-6 pb-12">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Globe size={22} className="text-primary" /> Website Settings
                        </h1>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-1">Control your website content and branding</p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving || isReadOnly}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'}`}
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : (isReadOnly ? null : <Save size={16} />)}
                        {saving ? 'Saving...' : (isReadOnly ? 'Read Only Mode' : 'Save All')}
                    </button>
                </div>

                {isVendorMember(profile) ? (
                    <form onSubmit={handleSaveVendor} className="space-y-6">
                        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 space-y-5 shadow-sm">
                            <div className="flex items-center justify-between gap-4 flex-wrap border-b border-gray-100 dark:border-gray-800 pb-3">
                                <h2 className="text-base font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                    <Store size={18} className="text-primary" /> Vendor Store Details
                                </h2>
                                {isVendorVerified ? (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
                                        <ShieldCheck size={12} /> Verified Store
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-500 border border-gray-200 dark:bg-gray-800 dark:text-gray-400">
                                        Unverified
                                    </span>
                                )}
                            </div>

                            {/* Store Logo Upload */}
                            <div className="flex items-center gap-5">
                                <div className="relative shrink-0">
                                    <div className="h-24 w-24 rounded-2xl overflow-hidden border-2 border-gray-100 dark:border-gray-800 shadow-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                                        {vendorForm.avatar_url ? (
                                            <img src={vendorForm.avatar_url} alt="Store logo" className="w-full h-full object-cover" />
                                        ) : (
                                            <Store size={36} className="text-gray-300 dark:text-gray-600" />
                                        )}
                                    </div>
                                    <label className="absolute -bottom-2 -right-2 h-9 w-9 flex items-center justify-center rounded-xl bg-primary text-white shadow-lg cursor-pointer hover:bg-primary/90 transition-all active:scale-90">
                                        {uploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                                        <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                                    </label>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-black text-gray-900 dark:text-gray-100">Store Logo</p>
                                    <p className="text-xs text-gray-400 font-medium max-w-xs">This picture is displayed on your public store page so customers recognize your store.</p>
                                    {vendorForm.avatar_url && (
                                        <button
                                            type="button"
                                            onClick={() => setVendorForm(f => ({ ...f, avatar_url: '' }))}
                                            className="text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors"
                                        >
                                            Remove logo
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Your Store Link */}
                            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2 flex items-center gap-1.5">
                                    <Link2 size={12} /> Your Store Link
                                </p>
                                <p className="text-xs text-gray-500 font-medium mb-2">
                                    Share this link with customers to open your store directly on the website. It updates automatically as you change the store name — no need to save first.
                                </p>
                                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={profile?.id ? buildStoreLink(vendorForm.store_name || vendorForm.contact_person, profile.id) : ''}
                                        className="flex-1 h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-300 truncate outline-none"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!profile?.id) return;
                                                navigator.clipboard.writeText(buildStoreLink(vendorForm.store_name || vendorForm.contact_person, profile.id));
                                                showToast('Store link copied to clipboard!');
                                            }}
                                            className="h-10 px-4 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 active:scale-95 transition-transform"
                                        >
                                            <Copy size={13} /> Copy
                                        </button>
                                        {profile?.id && (
                                            <a
                                                href={buildStoreLink(vendorForm.store_name || vendorForm.contact_person, profile.id)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="h-10 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 active:scale-95 transition-transform"
                                            >
                                                <ExternalLink size={13} /> Open
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Store Name *</label>
                                    <input
                                        type="text" required value={vendorForm.store_name}
                                        onChange={(e) => setVendorForm({ ...vendorForm, store_name: e.target.value })}
                                        placeholder="e.g. Himalayan Traders"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Contact Manager Name</label>
                                    <input
                                        type="text" value={vendorForm.contact_person}
                                        onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })}
                                        placeholder="Manager Full Name"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Phone Number *</label>
                                    <input
                                        type="tel" required value={vendorForm.phone}
                                        onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                                        placeholder="98XXXXXXXX"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">WhatsApp Support</label>
                                    <input
                                        type="tel" value={vendorForm.whatsapp}
                                        onChange={(e) => setVendorForm({ ...vendorForm, whatsapp: e.target.value })}
                                        placeholder="98XXXXXXXX"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Address / Location</label>
                                    <input
                                        type="text" value={vendorForm.address}
                                        onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
                                        placeholder="Store location in Nepal"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Store Description (Displayed on Public Product Pages)</label>
                                    <textarea
                                        rows={3} value={vendorForm.description}
                                        onChange={(e) => setVendorForm({ ...vendorForm, description: e.target.value })}
                                        placeholder="Brief description of your vendor store for online customers..."
                                        className="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" disabled={saving} className="px-6 py-3 rounded-xl bg-primary text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-primary/20">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Save Store Settings
                            </button>
                        </div>
                    </form>
                ) : (
                    <>
                        {/* Live Preview Banner */}
                        <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                            <p className="text-sm font-bold text-primary">💡 Changes here update your website instantly once saved.</p>
                            <p className="text-xs text-gray-500 mt-1">Your website at <code className="text-primary">localhost:5176</code> reads all values from this settings panel.</p>
                        </div>
                    </>
                )}

                {!isVendorMember(profile) && (
                    <>
                        {/* Settings Groups */}
                        {SETTING_GROUPS.map(group => (
                            <div key={group.title} className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                                {/* Group Header */}
                                <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                                    <span className="text-primary">{group.icon}</span>
                                    <p className="text-sm font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest">{group.title}</p>
                                </div>

                                <div className="p-6 space-y-6">
                                    {group.keys.map(field => (
                                        <div key={field.key} className="space-y-2">
                                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">{field.label}</label>
                                            
                                            {field.key.includes('image') ? (
                                                <div className="space-y-3">
                                                    {settings[field.key] && (
                                                        <div className="relative w-full aspect-[21/9] rounded-xl overflow-hidden border border-gray-100 shadow-inner group">
                                                            <img src={settings[field.key]} className="w-full h-full object-cover" alt="Preview" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <button 
                                                                    onClick={() => update(field.key, '')}
                                                                    className="p-2 bg-rose-500 text-white rounded-full hover:scale-110 transition-transform"
                                                                >
                                                                    <AlertTriangle size={16} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-4">
                                                        <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-2xl transition-all ${isReadOnly ? 'bg-gray-50 border-gray-100 cursor-not-allowed' : (uploading === field.key ? 'bg-gray-50 border-gray-200' : 'bg-primary/5 border-primary/20 hover:bg-primary/10 hover:border-primary/40 cursor-pointer')}`}>
                                                            <input 
                                                                type="file" 
                                                                accept="image/*" 
                                                                className="hidden" 
                                                                onChange={(e) => handleFileUpload(e, field.key)}
                                                                disabled={uploading === field.key || isReadOnly}
                                                            />
                                                            {uploading === field.key ? (
                                                                <div className="flex items-center gap-2 text-primary font-bold">
                                                                    <Loader2 size={20} className="animate-spin" />
                                                                    <span>Uploading...</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-center gap-1">
                                                                    <Image size={24} className={isReadOnly ? 'text-gray-300' : 'text-primary opacity-60'} />
                                                                    <span className={`text-xs font-black uppercase tracking-widest ${isReadOnly ? 'text-gray-300' : 'text-primary'}`}>
                                                                        {isReadOnly ? 'View Only' : (settings[field.key] ? 'Change Image' : 'Select Hero Banner')}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </label>
                                                    </div>
                                                </div>
                                            ) : (field as any).textarea ? (
                                                <textarea
                                                    value={settings[field.key] || ''}
                                                    onChange={e => !isReadOnly && update(field.key, e.target.value)}
                                                    readOnly={isReadOnly}
                                                    placeholder={field.placeholder}
                                                    rows={3}
                                                    className={`w-full px-4 py-3 rounded-xl border text-sm focus:ring-2 focus:ring-primary/30 outline-none ${isReadOnly ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}
                                                />
                                            ) : (field as any).type === 'datetime' ? (
                                                <input
                                                    type="datetime-local"
                                                    value={settings[field.key]?.replace(' ', 'T') || ''}
                                                    onChange={e => !isReadOnly && update(field.key, e.target.value.replace('T', ' '))}
                                                    readOnly={isReadOnly}
                                                    placeholder={field.placeholder}
                                                    className={`w-full h-11 px-4 rounded-xl border text-sm focus:ring-2 focus:ring-primary/30 outline-none font-bold ${isReadOnly ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}
                                                />
                                            ) : (field as any).type === 'select' ? (
                                                <select
                                                    value={settings[field.key] || ''}
                                                    onChange={e => !isReadOnly && update(field.key, e.target.value)}
                                                    disabled={isReadOnly}
                                                    className={`w-full h-11 px-4 rounded-xl border text-sm font-bold focus:ring-2 focus:ring-primary/30 outline-none cursor-pointer ${isReadOnly ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}
                                                >
                                                    {(field as any).options?.map((opt: any) => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (field as any).type === 'password' ? (
                                                <input
                                                    type="password"
                                                    value={settings[field.key] || ''}
                                                    onChange={e => !isReadOnly && update(field.key, e.target.value)}
                                                    readOnly={isReadOnly}
                                                    placeholder={field.placeholder}
                                                    className={`w-full h-11 px-4 rounded-xl border text-sm font-mono focus:ring-2 focus:ring-primary/30 outline-none ${isReadOnly ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}
                                                />
                                            ) : (field as any).type === 'toggle' ? (
                                                <div 
                                                    onClick={() => handleToggleField(field.key)}
                                                    className={`flex items-center gap-3 ${isReadOnly ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                                                >
                                                    <div className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${settings[field.key] === 'true' ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-sm ${settings[field.key] === 'true' ? 'left-7' : 'left-1'}`} />
                                                    </div>
                                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                                        {settings[field.key] === 'true' ? 'Enabled (Visible on Website)' : 'Disabled (Hidden on Website)'}
                                                    </span>
                                                </div>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={settings[field.key] || ''}
                                                    onChange={e => !isReadOnly && update(field.key, e.target.value)}
                                                    readOnly={isReadOnly}
                                                    placeholder={field.placeholder}
                                                    className={`w-full h-11 px-4 rounded-xl border text-sm focus:ring-2 focus:ring-primary/30 outline-none ${isReadOnly ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}
                                                />
                                            )}

                                        </div>
                                    ))}

                                    {/* Flash Sale specific UI (rendered once per group) */}
                                    {//@ts-ignore
                                    group.isFlashSale && (
                                        <div className="pt-6 border-t border-gray-100 dark:border-gray-800 space-y-6">
                                            <div className="space-y-3">
                                                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">Pick Product for Flash Sale</label>
                                                <div className="flex gap-3">
                                                    <select 
                                                        className={`flex-1 h-14 px-4 rounded-2xl border-2 bg-white dark:bg-gray-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 outline-none font-bold transition-all appearance-none ${isReadOnly ? 'border-gray-50 text-gray-300 cursor-not-allowed' : 'border-gray-100 dark:border-gray-800 cursor-pointer'}`}
                                                        onChange={(e) => {
                                                            if (isReadOnly) return;
                                                            const p = products.find(prod => prod.id === Number(e.target.value));
                                                            if (p) addProductToSale(p);
                                                            e.target.value = ""; // Reset dropdown
                                                        }}
                                                        disabled={isReadOnly}
                                                        defaultValue=""
                                                    >
                                                        <option value="" disabled>{isReadOnly ? 'Read Only Mode' : 'Choose a product from your website...'}</option>
                                                        {!isReadOnly && products.map(p => (
                                                            <option key={p.id} value={p.id}>
                                                                {p.title} (Rs. {p.price})
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 ${isReadOnly ? 'bg-gray-50 text-gray-300 border-gray-50' : 'bg-primary/10 text-primary border-primary/20'}`}>
                                                        <Zap size={20} />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-black text-gray-600 dark:text-gray-400 uppercase tracking-tighter flex items-center gap-2">
                                                        Currently in Flash Sale ({flashSaleProducts.length})
                                                    </h4>
                                                </div>
                                                <div className="grid gap-3">
                                                    {flashSaleProducts.map(p => {
                                                        const discount = Number(p.discount || 0);
                                                        const salePrice = Math.floor(p.price - (p.price * (discount / 100)));
                                                        return (
                                                            <div key={p.id} className="flex flex-col gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 group">
                                                                <div className="flex items-center gap-4">
                                                                    <img src={p.image} className="w-12 h-12 rounded-xl object-cover shadow-sm" />
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-black text-gray-800 dark:text-gray-100 truncate">{p.title}</p>
                                                                        <p className="text-xs text-gray-400 font-bold">Standard: Rs.{p.price}</p>
                                                                    </div>
                                                                    <button 
                                                                        onClick={() => removeProductFromSale(p.id)}
                                                                        className="p-2 text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors rounded-xl"
                                                                    >
                                                                        <Trash2 size={18} />
                                                                    </button>
                                                                </div>

                                                                <div className="flex items-center gap-4 pt-3 border-t dark:border-gray-800">
                                                                    <div className="flex-1 space-y-1">
                                                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Discount %</label>
                                                                        <input 
                                                                            type="number"
                                                                            value={p.discount}
                                                                            onChange={(e) => updateProductDiscount(p.id, Number(e.target.value))}
                                                                            className="w-full h-10 px-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-bold focus:border-primary outline-none"
                                                                            placeholder="0"
                                                                        />
                                                                    </div>
                                                                    <div className="text-right px-4 py-2 bg-white dark:bg-gray-900 rounded-xl border border-rose-100 min-w-[120px]">
                                                                        <p className="text-[10px] font-black text-gray-400 uppercase">Flash Price</p>
                                                                        <p className="text-sm font-black text-rose-500">Rs. {salePrice.toLocaleString()}</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {flashSaleProducts.length === 0 && (
                                                        <div className="py-8 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl">
                                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No products in sale. Use dropdown above to add.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Save Button (bottom) */}
                        <button
                            onClick={handleSave}
                            disabled={saving || isReadOnly}
                            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : 'bg-primary text-white hover:bg-primary/90 shadow-primary/20'}`}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : (isReadOnly ? null : <Save size={16} />)}
                            {saving ? 'Saving...' : (isReadOnly ? 'Read Only - No Changes Allowed' : 'Save All Website Content')}
                        </button>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
