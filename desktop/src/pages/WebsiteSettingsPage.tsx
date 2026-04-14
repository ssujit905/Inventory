import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import { Globe, Save, Loader2, Check, AlertTriangle, Type, Phone, Mail, MapPin, Share2, Image } from 'lucide-react';

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
];

export default function WebsiteSettingsPage() {
    const { profile } = useAuthStore();
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => { fetchSettings(); }, []);

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
        }
        setLoading(false);
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
            const upserts = Object.entries(settings).map(([key, value]) => ({
                key, value: value || '', updated_at: new Date().toISOString()
            }));
            const { error } = await supabase.from('website_settings').upsert(upserts, { onConflict: 'key' });
            if (error) throw error;
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
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 disabled:opacity-60 shadow-lg shadow-primary/20"
                    >
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        {saving ? 'Saving...' : 'Save All'}
                    </button>
                </div>

                {/* Live Preview Banner */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                    <p className="text-sm font-bold text-primary">💡 Changes here update your website instantly once saved.</p>
                    <p className="text-xs text-gray-500 mt-1">Your website at <code className="text-primary">localhost:5176</code> reads all values from this settings panel.</p>
                </div>

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
                                                <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${uploading === field.key ? 'bg-gray-50 border-gray-200' : 'bg-primary/5 border-primary/20 hover:bg-primary/10 hover:border-primary/40'}`}>
                                                    <input 
                                                        type="file" 
                                                        accept="image/*" 
                                                        className="hidden" 
                                                        onChange={(e) => handleFileUpload(e, field.key)}
                                                        disabled={uploading === field.key}
                                                    />
                                                    {uploading === field.key ? (
                                                        <div className="flex items-center gap-2 text-primary font-bold">
                                                            <Loader2 size={20} className="animate-spin" />
                                                            <span>Uploading...</span>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <Image size={24} className="text-primary opacity-60" />
                                                            <span className="text-xs font-black text-primary uppercase tracking-widest">
                                                                {settings[field.key] ? 'Change Image' : 'Select Hero Banner'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </label>
                                            </div>
                                        </div>
                                    ) : field.textarea ? (
                                        <textarea
                                            value={settings[field.key] || ''}
                                            onChange={e => update(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            rows={3}
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            value={settings[field.key] || ''}
                                            onChange={e => update(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Save Button (bottom) */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-primary text-white rounded-2xl font-black text-sm hover:bg-primary/90 disabled:opacity-60 shadow-lg shadow-primary/20"
                >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? 'Save All Website Content' : 'Save All Website Content'}
                </button>
            </div>
        </DashboardLayout>
    );
}
