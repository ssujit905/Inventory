import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import { Globe, Save, Loader2, Check, AlertTriangle, Type, Phone, Mail, MapPin, Share2, Image as ImageIcon, ChevronRight } from 'lucide-react';

interface Setting {
    key: string;
    value: string;
}

const SETTING_GROUPS = [
    {
        title: 'Hero Banner',
        icon: <ImageIcon size={18} />,
        keys: [
            { key: 'hero_badge', label: 'Badge Text', placeholder: "Nepal's Most Trusted Store" },
            { key: 'hero_title', label: 'Headline', placeholder: 'Smart Shopping Made Easy' },
            { key: 'hero_subtitle', label: 'Subtitle', placeholder: 'Get the best deals...', textarea: true },
            { key: 'hero_cta', label: 'Button Text', placeholder: 'Shop Now' },
        ]
    },
    {
        title: 'Store Info',
        icon: <Type size={18} />,
        keys: [
            { key: 'store_name', label: 'Store Name', placeholder: 'Shopi Nepal' },
            { key: 'store_tagline', label: 'Tagline', placeholder: 'Your one-stop destination...', textarea: true },
        ]
    },
    {
        title: 'Contact Details',
        icon: <Phone size={18} />,
        keys: [
            { key: 'store_phone', label: 'Phone', placeholder: '+977-9845877777' },
            { key: 'store_email', label: 'Email', placeholder: 'info@shopinepal.com' },
            { key: 'store_address', label: 'Address', placeholder: 'Kathmandu, Nepal' },
        ]
    },
    {
        title: 'Social Links',
        icon: <Share2 size={18} />,
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
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => { fetchSettings(); }, []);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('website_settings').select('*');
            if (error) throw error;
            const map: Record<string, string> = {};
            (data as Setting[]).forEach(s => { map[s.key] = s.value; });
            setSettings(map);
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const upserts = Object.entries(settings).map(([key, value]) => ({
                key, value, updated_at: new Date().toISOString()
            }));
            const { error } = await supabase.from('website_settings').upsert(upserts, { onConflict: 'key' });
            if (error) throw error;
            showToast('Website updated successfully!');
        } catch (err: any) {
            showToast(err.message || 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const update = (key: string, value: string) => {
        setSettings(s => ({ ...s, [key]: value }));
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {toast && (
                <div className={`fixed top-4 left-4 right-4 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-white text-xs font-bold animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    {toast.msg}
                </div>
            )}

            <div className="space-y-6 pb-20">
                <div className="flex flex-col gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-2">
                             Global Config
                        </h1>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Website Presence & Content</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20">
                            <p className="text-[11px] font-black text-primary uppercase tracking-widest leading-relaxed">
                                💡 Save changes to update live site content instantly.
                            </p>
                        </div>

                        {SETTING_GROUPS.map(group => (
                            <section key={group.title} className="bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
                                <div className="flex items-center gap-3 px-6 py-4 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                                    <div className="text-primary">{group.icon}</div>
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600 dark:text-gray-300">{group.title}</span>
                                </div>
                                <div className="p-6 space-y-5">
                                    {group.keys.map(field => (
                                        <div key={field.key} className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{field.label}</label>
                                            {field.textarea ? (
                                                <textarea 
                                                    value={settings[field.key] || ''}
                                                    onChange={e => update(field.key, e.target.value)}
                                                    placeholder={field.placeholder}
                                                    rows={3}
                                                    className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-950 border border-transparent focus:border-primary/30 outline-none text-sm font-medium resize-none"
                                                />
                                            ) : (
                                                <input 
                                                    value={settings[field.key] || ''}
                                                    onChange={e => update(field.key, e.target.value)}
                                                    placeholder={field.placeholder}
                                                    className="w-full h-14 px-4 rounded-2xl bg-gray-50 dark:bg-gray-950 border border-transparent focus:border-primary/30 outline-none text-sm font-bold"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                )}

                <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 dark:bg-gray-950/80 backdrop-blur-xl border-t border-gray-100 dark:border-gray-800 z-30">
                    <button 
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="w-full h-14 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/30 flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {saving ? 'UPDATING SITE...' : 'SAVE ALL SETTINGS'}
                    </button>
                </div>
            </div>
        </DashboardLayout>
    );
}
