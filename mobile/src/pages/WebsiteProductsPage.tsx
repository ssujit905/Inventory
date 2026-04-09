import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import {
    Plus, Trash2, Edit3, X, Upload, Image as ImageIcon, Star, Eye, EyeOff,
    Package, Loader2, Check, AlertTriangle, Globe, ChevronRight, Search, Save
} from 'lucide-react';

function ToggleButton({ checked, onChange, label, sublabel, color = 'primary' }: { checked: boolean, onChange: (v: boolean) => void, label: string, sublabel: string, color?: string }) {
    const colorConfigs: Record<string, { bg: string, ring: string, active: string }> = {
        primary: { bg: 'bg-primary/5', ring: 'border-primary/20', active: 'bg-primary' },
        amber: { bg: 'bg-amber-50', ring: 'border-amber-200', active: 'bg-amber-500' },
        emerald: { bg: 'bg-emerald-50', ring: 'border-emerald-200', active: 'bg-emerald-500' },
        blue: { bg: 'bg-blue-50', ring: 'border-blue-200', active: 'bg-blue-500' },
        indigo: { bg: 'bg-indigo-50', ring: 'border-indigo-200', active: 'bg-indigo-500' },
    };

    const cfg = colorConfigs[color] || colorConfigs.primary;

    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`flex items-center justify-between p-4 rounded-3xl border transition-all duration-300 ${checked ? `${cfg.bg} ${cfg.ring} scale-[1.02]` : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800'}`}
        >
            <div className="flex flex-col text-left">
                <span className={`text-xs font-black uppercase tracking-[0.1em] ${checked ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`}>{label}</span>
                <span className="text-[10px] font-bold text-gray-400 mt-0.5">{sublabel}</span>
            </div>
            <div className={`h-7 w-12 rounded-full p-1.5 transition-all duration-500 ease-spring ${checked ? cfg.active : 'bg-gray-200 dark:bg-gray-800'}`}>
                <div className={`h-4 w-4 rounded-full bg-white shadow-lg transform transition-all duration-500 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
        </button>
    );
}

interface ProductImage {
    id?: number;
    image_url: string;
    label?: string;
    is_primary: boolean;
    sort_order: number;
    file?: File;
    preview?: string;
}

interface WebsiteProduct {
    id: number;
    title: string;
    description: string;
    price: number;
    original_price: number | null;
    category: string;
    city: string;
    delivery_days: string;
    is_active: boolean;
    is_featured: boolean;
    show_shopinepal: boolean;
    is_cod: boolean;
    is_prepaid: boolean;
    is_prebook: boolean;
    is_sold_out: boolean;
    sizes: string;
    sold_count: number;
    created_at: string;
    website_product_images: ProductImage[];
}

const CATEGORIES = ['Electronics', 'Clothing', 'Accessories', 'Home & Living', 'Sports', 'Beauty', 'Footwear', 'General'];
const CITIES = ['Kathmandu', 'Pokhara', 'Bhaktapur', 'Lalitpur', 'Bharatpur', 'Biratnagar', 'Birgunj', 'Dharan'];

export default function WebsiteProductsPage() {
    const { profile } = useAuthStore();
    const [products, setProducts] = useState<WebsiteProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState<WebsiteProduct | null>(null);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: number | null }>({ show: false, id: null });
    const [searchQuery, setSearchQuery] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const emptyForm = {
        title: '', description: '', price: '', original_price: '',
        category: 'General', city: 'Kathmandu', delivery_days: '2-4',
        is_active: true, is_featured: false, show_shopinepal: true, 
        is_cod: true, is_prepaid: false, is_prebook: false, is_sold_out: false,
        sizes: '',
        images: [] as ProductImage[]
    };
    const [form, setForm] = useState(emptyForm);

    useEffect(() => { fetchProducts(); }, []);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchProducts = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('website_products')
            .select(`*, website_product_images(*)`)
            .order('created_at', { ascending: false });
        if (error) showToast(error.message, 'error');
        else setProducts(data || []);
        setLoading(false);
    };

    const openAdd = () => {
        setEditingProduct(null);
        setForm(emptyForm);
        setShowForm(true);
    };

    const openEdit = (p: WebsiteProduct) => {
        setEditingProduct(p);
        setForm({
            title: p.title,
            description: p.description,
            price: p.price.toString(),
            original_price: p.original_price?.toString() || '',
            category: p.category,
            city: p.city,
            delivery_days: p.delivery_days,
            is_active: p.is_active,
            is_featured: p.is_featured,
            show_shopinepal: p.show_shopinepal,
            is_cod: p.is_cod,
            is_prepaid: p.is_prepaid,
            is_prebook: p.is_prebook,
            is_sold_out: p.is_sold_out || false,
            sizes: p.sizes || '',
            images: p.website_product_images.map(img => ({ ...img }))
        });
        setShowForm(true);
    };

    const handleImageFiles = (files: FileList) => {
        Array.from(files).forEach((file, i) => {
            const preview = URL.createObjectURL(file);
            setForm(f => ({
                ...f,
                images: [...f.images, {
                    image_url: '',
                    label: '',
                    is_primary: f.images.length === 0 && i === 0,
                    sort_order: f.images.length + i,
                    file,
                    preview
                }]
            }));
        });
    };

    const uploadImage = async (file: File): Promise<string> => {
        const ext = file.name.split('.').pop();
        const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('website-images').upload(path, file);
        if (error) throw error;
        const { data } = supabase.storage.from('website-images').getPublicUrl(path);
        return data.publicUrl;
    };

    const handleSave = async () => {
        if (!form.title.trim() || !form.price) return showToast('Title and price are required', 'error');
        setSaving(true);
        try {
            const productData = {
                title: form.title.trim(),
                description: form.description.trim(),
                price: parseFloat(form.price),
                original_price: form.original_price ? parseFloat(form.original_price) : null,
                category: form.category,
                city: form.city,
                delivery_days: form.delivery_days,
                is_active: form.is_active,
                is_featured: form.is_featured,
                show_shopinepal: form.show_shopinepal,
                is_cod: form.is_cod,
                is_prepaid: form.is_prepaid,
                is_prebook: form.is_prebook,
                is_sold_out: form.is_sold_out,
                sizes: form.sizes.trim(),
                updated_at: new Date().toISOString()
            };

            let productId = editingProduct?.id;

            if (editingProduct) {
                const { error } = await supabase.from('website_products').update(productData).eq('id', editingProduct.id);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('website_products').insert(productData).select().single();
                if (error) throw error;
                productId = data.id;
            }

            // Sync Images
            if (editingProduct) {
                await supabase.from('website_product_images').delete().eq('product_id', productId);
            }

            const uploadedImages: any[] = [];
            for (const img of form.images) {
                if (img.file) {
                    const url = await uploadImage(img.file);
                    uploadedImages.push({ image_url: url, label: img.label || '', is_primary: img.is_primary, sort_order: img.sort_order });
                } else if (img.image_url) {
                    uploadedImages.push({ image_url: img.image_url, label: img.label || '', is_primary: img.is_primary, sort_order: img.sort_order });
                }
            }

            if (uploadedImages.length > 0) {
                await supabase.from('website_product_images').insert(
                    uploadedImages.map(img => ({ ...img, product_id: productId }))
                );
            }

            showToast(editingProduct ? 'Product updated!' : 'Product added!');
            setShowForm(false);
            fetchProducts();
        } catch (err: any) {
            showToast(err.message || 'Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm.id) return;
        setSaving(true);
        try {
            await supabase.from('website_product_images').delete().eq('product_id', deleteConfirm.id);
            const { error } = await supabase.from('website_products').delete().eq('id', deleteConfirm.id);
            if (error) throw error;
            showToast('Product deleted successfully');
            setDeleteConfirm({ show: false, id: null });
            fetchProducts();
        } catch (err: any) {
            showToast(err.message || 'Delete failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggleField = async (id: number, field: string, val: boolean) => {
        await supabase.from('website_products').update({ [field]: val }).eq('id', id);
        setProducts(ps => ps.map(p => p.id === id ? { ...p, [field]: val } : p));
    };

    const filteredProducts = products.filter(p => 
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
                             Website Products
                        </h1>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] mt-1">Catalog Management</p>
                    </div>
                    
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search products..." 
                                className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" 
                            />
                        </div>
                        <button onClick={openAdd} className="h-12 w-12 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                            <Plus size={24} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 gap-4">
                        <Package size={48} className="text-gray-200 dark:text-gray-700" />
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">No products found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredProducts.map(p => {
                            const primary = p.website_product_images?.find(i => i.is_primary) || p.website_product_images?.[0];
                            return (
                                <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm flex h-32">
                                    <div className="w-32 bg-gray-50 dark:bg-gray-800 relative">
                                        {primary ? (
                                            <img src={primary.image_url} alt={p.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                <ImageIcon size={32} />
                                            </div>
                                        )}
                                        <div className="absolute top-1 left-1 flex flex-col gap-1">
                                            {!p.is_active && <span className="px-1.5 py-0.5 bg-gray-900/80 text-white text-[8px] font-black rounded-md">HIDDEN</span>}
                                            {p.is_sold_out && <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[8px] font-black rounded-md">SOLD OUT</span>}
                                        </div>
                                    </div>
                                    <div className="flex-1 p-3 flex flex-col justify-between min-w-0">
                                        <div>
                                            <p className="font-black text-gray-900 dark:text-gray-100 text-sm truncate">{p.title}</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">{p.category} · {p.city}</p>
                                            <p className="text-primary font-black text-sm mt-1">Rs. {p.price.toLocaleString()}</p>
                                        </div>
                                        <div className="flex items-center justify-between pt-2">
                                            <div className="flex gap-3">
                                                <button onClick={() => toggleField(p.id, 'is_active', !p.is_active)} className={`p-1 ${p.is_active ? 'text-emerald-500' : 'text-gray-300'}`}><Eye size={16} /></button>
                                                <button onClick={() => toggleField(p.id, 'is_featured', !p.is_featured)} className={`p-1 ${p.is_featured ? 'text-amber-500' : 'text-gray-300'}`}><Star size={16} /></button>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => openEdit(p)} className="p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-lg"><Edit3 size={16} /></button>
                                                <button onClick={() => setDeleteConfirm({ show: true, id: p.id })} className="p-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-lg"><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-[150] bg-white dark:bg-gray-950 flex flex-col animate-in slide-in-from-bottom duration-300 overflow-hidden">
                    <div className="h-16 flex-shrink-0 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800">
                        <h2 className="text-lg font-black">{editingProduct ? 'Edit Product' : 'Add Website Product'}</h2>
                        <button onClick={() => setShowForm(false)} className="p-2 bg-gray-100 dark:bg-gray-900 rounded-full"><X size={20} /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">
                        {/* BASIC INFO */}
                        <section className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">Basic Information</label>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1.5 block">Product Title *</label>
                                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Premium Cotton T-Shirt" className="w-full h-12 px-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1.5 block">Description</label>
                                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Product description..." rows={3} className="w-full p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-medium resize-none focus:ring-2 focus:ring-primary/20 outline-none" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1.5 block">Price (Rs.) *</label>
                                    <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} type="number" placeholder="1200" className="w-full h-12 px-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1.5 block">Original Price</label>
                                    <input value={form.original_price} onChange={e => setForm(f => ({ ...f, original_price: e.target.value }))} type="number" placeholder="1500" className="w-full h-12 px-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none" />
                                </div>
                            </div>
                        </section>

                        {/* CATEGORY & LOGISTICS */}
                        <section className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">Logistics & Placement</label>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1.5 block">Category</label>
                                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full h-12 px-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-bold outline-none">
                                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1.5 block">Ship From</label>
                                    <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full h-12 px-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-bold outline-none">
                                        {CITIES.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1.5 block">Delivery Days</label>
                                    <input value={form.delivery_days} onChange={e => setForm(f => ({ ...f, delivery_days: e.target.value }))} placeholder="e.g. 2-4" className="w-full h-12 px-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-bold outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-1.5 block">Sizes (Commas)</label>
                                    <input value={form.sizes} onChange={e => setForm(f => ({ ...f, sizes: e.target.value }))} placeholder="e.g. S, M, L" className="w-full h-12 px-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-bold outline-none" />
                                </div>
                            </div>
                        </section>

                        {/* DESKTOP-STYLE TOGGLES */}
                        <section className="space-y-4">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] block">Store Configurations</label>
                            <div className="grid grid-cols-1 gap-3">
                                <ToggleButton checked={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} label="Active Product" sublabel="Visibility on store" />
                                <ToggleButton checked={form.is_featured} onChange={v => setForm(f => ({ ...f, is_featured: v }))} label="Featured Product" sublabel="Shows in highlights" color="amber" />
                                <ToggleButton checked={form.show_shopinepal} onChange={v => setForm(f => ({ ...f, show_shopinepal: v }))} label="ShopiNepal Badge" sublabel="Verified trust mark" />
                                <ToggleButton checked={form.is_cod} onChange={v => setForm(f => ({ ...f, is_cod: v }))} label="COD Available" sublabel="Cash on delivery" color="emerald" />
                                <ToggleButton checked={form.is_prepaid} onChange={v => setForm(f => ({ ...f, is_prepaid: v }))} label="Prepaid Only" sublabel="Online payment required" color="blue" />
                                <ToggleButton checked={form.is_prebook} onChange={v => setForm(f => ({ ...f, is_prebook: v }))} label="Pre-booking" sublabel="Accept pre-orders" color="indigo" />
                                <ToggleButton checked={form.is_sold_out} onChange={v => setForm(f => ({ ...f, is_sold_out: v }))} label="Mark as Sold Out" sublabel="Show sold out badge" color="rose" />
                            </div>
                        </section>

                        {/* IMAGES MANAGEMENT */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Product Images</label>
                                <button onClick={() => fileInputRef.current?.click()} className="text-primary font-black text-[10px] uppercase flex items-center gap-1.5 bg-primary/10 px-3 py-1.5 rounded-lg active:scale-95 transition-all">
                                    <Plus size={14} /> Add Photo
                                </button>
                                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e => { if (e.target.files) handleImageFiles(e.target.files) }} />
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {form.images.map((img, i) => (
                                    <div key={i} className={`flex items-center gap-4 p-3 rounded-2xl border transition-all ${img.is_primary ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900'}`}>
                                        <div className="relative h-20 w-20 flex-shrink-0 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-800">
                                            <img src={img.preview || img.image_url} alt="" className="w-full h-full object-cover" />
                                            {img.is_primary && <div className="absolute top-1 left-1 bg-primary text-white p-0.5 rounded shadow-lg"><Check size={8} strokeWidth={4} /></div>}
                                        </div>
                                        <div className="flex-1 space-y-2">
                                            <input 
                                                value={img.label} 
                                                onChange={e => setForm(f => ({ ...f, images: f.images.map((im, idx) => idx === i ? { ...im, label: e.target.value } : im) }))}
                                                placeholder="Sub-label (e.g. Black / XL)"
                                                className="w-full h-9 px-3 text-xs font-bold rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setForm(f => ({ ...f, images: f.images.map((im, idx) => ({ ...im, is_primary: idx === i })) }))} className={`text-[8px] font-black px-2 py-1.5 rounded-md transition-all ${img.is_primary ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                                                    {img.is_primary ? 'PRIMARY IMAGE' : 'SET AS PRIMARY'}
                                                </button>
                                                <button onClick={() => setForm(f => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }))} className="text-[8px] font-black px-2 py-1.5 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all">
                                                    REMOVE
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex-shrink-0 p-6 bg-white dark:bg-gray-950 border-t border-gray-100 dark:border-gray-800 z-30 flex gap-4">
                        <button onClick={() => setShowForm(false)} className="px-6 py-4 rounded-2xl border border-gray-100 dark:border-gray-800 font-black text-xs uppercase tracking-widest text-gray-500">Cancel</button>
                        <button onClick={handleSave} disabled={saving} className="flex-1 h-14 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-primary/30 flex items-center justify-center gap-3 active:scale-[0.98] transition-all disabled:opacity-50">
                            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {saving ? 'UPDATING...' : (editingProduct ? 'UPDATE PRODUCT' : 'CREATE PRODUCT')}
                        </button>
                    </div>
                </div>
            )}

            {deleteConfirm.show && (
                <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-6">
                    <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 w-full max-w-sm text-center">
                        <div className="h-16 w-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Trash2 size={32} />
                        </div>
                        <h3 className="text-xl font-bold mb-2">Delete Product?</h3>
                        <p className="text-sm text-gray-500 mb-8">This will permanently remove the product from your website.</p>
                        <div className="flex flex-col gap-3">
                            <button onClick={handleDelete} className="w-full py-4 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest">Delete Permanently</button>
                            <button onClick={() => setDeleteConfirm({ show: false, id: null })} className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
