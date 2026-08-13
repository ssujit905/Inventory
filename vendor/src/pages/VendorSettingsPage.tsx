import { useState, useEffect } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import { Store, Save, Loader2, Check, AlertTriangle, Phone, Mail, MapPin, Building2, CreditCard, User, ImagePlus } from 'lucide-react';

export default function VendorSettingsPage() {
    const { profile } = useAuthStore();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

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

    useEffect(() => {
        fetchVendorProfile();
    }, [profile]);

    const fetchVendorProfile = async () => {
        setLoading(true);
        try {
            if (profile?.id) {
                // Fetch profile or vendor settings
                const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', profile.id)
                    .maybeSingle();

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
                }
            }
        } catch (err: any) {
            console.error('Error loading vendor settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile?.id) return;
        if (!file.type.startsWith('image/')) {
            setToast({ msg: 'Please choose an image file', type: 'error' });
            setTimeout(() => setToast(null), 3000);
            return;
        }
        setUploadingAvatar(true);
        try {
            const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
            const path = `vendor-avatars/${profile.id}.${ext}`;
            const { error: upErr } = await supabase.storage
                .from('website-images')
                .upload(path, file, { upsert: true });
            if (upErr) throw upErr;
            const { data } = supabase.storage.from('website-images').getPublicUrl(path);
            setVendorForm(f => ({ ...f, avatar_url: data.publicUrl }));
            setToast({ msg: 'Store logo uploaded! Click Save to apply.', type: 'success' });
        } catch (err: any) {
            console.error('Avatar upload failed:', err);
            setToast({ msg: err.message || 'Failed to upload logo', type: 'error' });
        } finally {
            setUploadingAvatar(false);
            setTimeout(() => setToast(null), 3000);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (!profile?.id) return;

            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: vendorForm.contact_person,
                    store_name: vendorForm.store_name,
                    phone: vendorForm.phone,
                    whatsapp: vendorForm.whatsapp,
                    address: vendorForm.address,
                    city: vendorForm.city,
                    description: vendorForm.description,
                    avatar_url: vendorForm.avatar_url,
                    bank_name: vendorForm.bank_name,
                    bank_account_holder: vendorForm.bank_account_holder,
                    bank_account_number: vendorForm.bank_account_number,
                    bank_branch: vendorForm.bank_branch,
                    esewa_id: vendorForm.esewa_id
                })
                .eq('id', profile.id);

            if (error) throw error;
            setToast({ msg: 'Vendor Store settings saved successfully!', type: 'success' });
        } catch (err: any) {
            console.error('Failed to save vendor settings:', err);
            setToast({ msg: err.message || 'Failed to save settings', type: 'error' });
        } finally {
            setSaving(false);
            setTimeout(() => setToast(null), 3000);
        }
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
                {/* HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                            <Store size={28} />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-gray-100 tracking-tight">
                                Vendor Store Settings
                            </h1>
                            <p className="text-xs sm:text-sm text-gray-500 font-medium">
                                Manage your vendor store details, contact info, and payout accounts
                            </p>
                        </div>
                    </div>
                </div>



                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                ) : (
                    <form onSubmit={handleSave} className="space-y-6">
                        {/* STORE PROFILE */}
                        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 space-y-5 shadow-sm">
                            <h2 className="text-base font-black text-gray-900 dark:text-gray-100 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                                <Store size={18} className="text-primary" /> Vendor Store Profile
                            </h2>

                            <div className="flex items-center gap-5">
                                <label className="relative cursor-pointer group shrink-0">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleAvatarUpload}
                                        disabled={uploadingAvatar}
                                    />
                                    {vendorForm.avatar_url ? (
                                        <img
                                            src={vendorForm.avatar_url}
                                            alt="Store logo"
                                            className="h-20 w-20 rounded-2xl object-cover border border-gray-200 dark:border-gray-700 shadow-sm"
                                        />
                                    ) : (
                                        <div className="h-20 w-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border-2 border-dashed border-primary/30">
                                            <Store size={28} />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        {uploadingAvatar ? (
                                            <Loader2 size={20} className="animate-spin text-white" />
                                        ) : (
                                            <ImagePlus size={20} className="text-white" />
                                        )}
                                    </div>
                                </label>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Store Logo</p>
                                    <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                                        Shown on the store card below your products.<br />
                                        Click the image to upload (PNG, JPG).
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <Store size={14} /> Store Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={vendorForm.store_name}
                                        onChange={(e) => setVendorForm({ ...vendorForm, store_name: e.target.value })}
                                        placeholder="e.g. Acme Himalayan Traders"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <User size={14} /> Contact Manager Name
                                    </label>
                                    <input
                                        type="text"
                                        value={vendorForm.contact_person}
                                        onChange={(e) => setVendorForm({ ...vendorForm, contact_person: e.target.value })}
                                        placeholder="Manager Full Name"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <Phone size={14} /> Phone Number *
                                    </label>
                                    <input
                                        type="tel"
                                        required
                                        value={vendorForm.phone}
                                        onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })}
                                        placeholder="98XXXXXXXX"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <Phone size={14} /> WhatsApp Support
                                    </label>
                                    <input
                                        type="tel"
                                        value={vendorForm.whatsapp}
                                        onChange={(e) => setVendorForm({ ...vendorForm, whatsapp: e.target.value })}
                                        placeholder="98XXXXXXXX"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                        <MapPin size={14} /> Warehouse / Store Address
                                    </label>
                                    <input
                                        type="text"
                                        value={vendorForm.address}
                                        onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })}
                                        placeholder="Street Address, City, Landmark"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* PAYOUT BANK DETAILS */}
                        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 space-y-5 shadow-sm">
                            <h2 className="text-base font-black text-gray-900 dark:text-gray-100 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                                <Building2 size={18} className="text-emerald-500" /> Payout & Bank Account Details
                            </h2>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Bank Name</label>
                                    <input
                                        type="text"
                                        value={vendorForm.bank_name}
                                        onChange={(e) => setVendorForm({ ...vendorForm, bank_name: e.target.value })}
                                        placeholder="e.g. Nabil Bank Ltd."
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Account Holder Name</label>
                                    <input
                                        type="text"
                                        value={vendorForm.bank_account_holder}
                                        onChange={(e) => setVendorForm({ ...vendorForm, bank_account_holder: e.target.value })}
                                        placeholder="Account Holder Name"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Account Number</label>
                                    <input
                                        type="text"
                                        value={vendorForm.bank_account_number}
                                        onChange={(e) => setVendorForm({ ...vendorForm, bank_account_number: e.target.value })}
                                        placeholder="0123456789012345"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300">Bank Branch</label>
                                    <input
                                        type="text"
                                        value={vendorForm.bank_branch}
                                        onChange={(e) => setVendorForm({ ...vendorForm, bank_branch: e.target.value })}
                                        placeholder="Kathmandu"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                        <CreditCard size={14} className="text-emerald-500" /> eSewa Mobile ID / Number for Payouts
                                    </label>
                                    <input
                                        type="text"
                                        value={vendorForm.esewa_id}
                                        onChange={(e) => setVendorForm({ ...vendorForm, esewa_id: e.target.value })}
                                        placeholder="98XXXXXXXX"
                                        className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* SAVE BUTTON & MESSAGE */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                            {toast ? (
                                <div className={`p-4 rounded-2xl border text-sm font-bold flex items-center gap-3 animate-in fade-in zoom-in duration-200 ${
                                    toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                    {toast.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
                                    {toast.msg}
                                </div>
                            ) : <div />}

                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full sm:w-auto px-8 py-3.5 bg-primary text-white font-black text-sm rounded-2xl shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shrink-0"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Saving Settings…
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        Save Vendor Store Settings
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </DashboardLayout>
    );
}
