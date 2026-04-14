import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase } from '../lib/supabase';
import {
    Plus, Trash2, Edit3, X, Upload, Image, Star, Eye, EyeOff,
    Package, Loader2, Check, AlertTriangle, Globe
} from 'lucide-react';

interface ProductVariant {
    id?: string;
    product_id: number;
    color: string;
    size: string;
    sku: string;
    inventory_product_id: string;
    current_stock?: number;
    price?: number | string | null;
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
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState<WebsiteProduct | null>(null);
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: number | null }>({ show: false, id: null });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const emptyForm = {
        title: '', description: '', price: '', original_price: '',
        category: 'General', city: 'Kathmandu', delivery_days: '2-4',
        is_active: true, is_featured: false, show_shopinepal: true, 
        is_cod: true, is_prepaid: false, is_prebook: false,
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

        // Also fetch inventory items for mapping
        const { data: inv } = await supabase.from('products').select('id, name, sku');
        setInventoryItems(inv || []);

        setLoading(false);
    };

    const fetchVariants = async (productId: number) => {
        const { data } = await supabase
            .from('website_variant_stock_view')
            .select('*')
            .eq('parent_product_id', productId);
        
        if (data) {
            setVariants(data.map(v => ({
                id: v.variant_id,
                product_id: v.parent_product_id,
                color: v.color,
                size: v.size,
                sku: v.sku,
                inventory_product_id: v.inventory_product_id,
                current_stock: v.current_stock,
                price: v.price?.toString() || ''
            })));
        }
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
            sizes: p.sizes || '',
            images: p.website_product_images.map(img => ({ ...img }))
        });
        setVariants([]);
        fetchVariants(p.id);
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
        if (!form.title.trim()) return showToast('Title is required', 'error');
        setSaving(true);
        try {
            const prices = variants.map(v => Number(v.price)).filter(p => !isNaN(p) && p > 0);
            const computedBasePrice = prices.length > 0 ? Math.min(...prices) : 0;

            const productData = {
                title: form.title.trim(),
                description: form.description.trim(),
                price: computedBasePrice,
                original_price: null,
                category: form.category,
                city: form.city,
                delivery_days: form.delivery_days,
                is_active: form.is_active,
                is_featured: form.is_featured,
                show_shopinepal: form.show_shopinepal,
                is_cod: form.is_cod,
                is_prepaid: form.is_prepaid,
                is_prebook: form.is_prebook,
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

            // --- SAVE VARIANTS ---
            if (productId) {
                // Remove deleted ones (best effort)
                if (editingProduct) {
                    const existingIds = variants.filter(v => v.id).map(v => v.id);
                    let delQuery = supabase.from('website_variants').delete().eq('product_id', productId);
                    if (existingIds.length > 0) {
                        delQuery = delQuery.not('id', 'in', `(${existingIds.join(',')})`);
                    }
                    await delQuery; // errors ignored for rows blocked by foreign order constraints
                }
                // Clean Upsert by separating Inserts and Updates to bypass PostgREST null mapping bugs
                if (variants.length > 0) {
                    const toInsert = variants.filter(v => !v.id).map(v => ({
                        product_id: productId,
                        color: v.color,
                        size: v.size,
                        sku: v.sku,
                        price: v.price ? parseFloat(v.price.toString()) : null,
                        inventory_product_id: v.inventory_product_id
                    }));

                    const toUpdate = variants.filter(v => !!v.id);

                    // 1. Explicitly Insert New Variants
                    if (toInsert.length > 0) {
                        const { error: insErr } = await supabase.from('website_variants').insert(toInsert);
                        if (insErr) throw insErr;
                    }

                    // 2. Explicitly Update Existing Variants by ID
                    for (const v of toUpdate) {
                        const { error: updErr } = await supabase.from('website_variants').update({
                            color: v.color,
                            size: v.size,
                            sku: v.sku,
                            price: v.price ? parseFloat(v.price.toString()) : null,
                            inventory_product_id: v.inventory_product_id
                        }).eq('id', v.id);
                        if (updErr) throw updErr;
                    }
                }
            }

            showToast(editingProduct ? 'Product and Variants updated!' : 'Product added!');
            setShowForm(false);
            setSaving(false);
            fetchProducts();

            (async () => {
                try {
                    if (editingProduct) {
                        await supabase.from('website_product_images').delete().eq('product_id', productId);
                    }

                    const uploadedImages: any[] = [];
                    for (const img of form.images) {
                        if (img.file) {
                            try {
                                const url = await uploadImage(img.file);
                                uploadedImages.push({ image_url: url, label: img.label || '', is_primary: img.is_primary, sort_order: img.sort_order });
                            } catch (imgErr: any) {
                                console.error('Image upload failed', imgErr);
                            }
                        } else if (img.image_url) {
                            uploadedImages.push({ image_url: img.image_url, label: img.label || '', is_primary: img.is_primary, sort_order: img.sort_order });
                        }
                    }

                    if (uploadedImages.length > 0) {
                        await supabase.from('website_product_images').insert(
                            uploadedImages.map(img => ({ ...img, product_id: productId }))
                        );
                    }
                    fetchProducts();
                } catch (e) {
                    console.error('Final sync error', e);
                }
            })();

        } catch (err: any) {
            showToast(err.message || 'Save failed', 'error');
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

    const setPrimaryImage = (i: number) => {
        setForm(f => ({ ...f, images: f.images.map((img, idx) => ({ ...img, is_primary: idx === i })) }));
    };

    const removeImage = (i: number) => {
        if (!confirm('Remove this photo?')) return;
        setForm(f => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }));
    };

    return (
        <DashboardLayout role={profile?.role === 'admin' ? 'admin' : 'staff'}>
            {/* Global Toast Notification — Always at the top-right! */}
            {toast && (
                <div className={`fixed top-8 right-8 z-[200] flex items-center gap-3 px-6 py-4 rounded-3xl shadow-2xl text-white text-sm font-black animate-in slide-in-from-right-full duration-500 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                    <div className="h-6 w-6 rounded-full bg-white/20 flex items-center justify-center">
                        {toast.type === 'success' ? <Check size={14} strokeWidth={3} /> : <AlertTriangle size={14} strokeWidth={3} />}
                    </div>
                    {toast.msg}
                </div>
            )}

            <div className="max-w-7xl mx-auto space-y-6 pb-12">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Globe size={22} className="text-primary" /> Website Products
                        </h1>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mt-1">Manage products shown on your website</p>
                    </div>
                    <button onClick={openAdd} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                        <Plus size={16} /> Add Product
                    </button>
                </div>

                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 size={32} className="animate-spin text-primary" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 gap-4">
                        <Package size={48} className="text-gray-200 dark:text-gray-700" />
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">No products yet</p>
                        <button onClick={openAdd} className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm">Add First Product</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {products.map(p => {
                            const primary = p.website_product_images?.find(i => i.is_primary) || p.website_product_images?.[0];
                            return (
                                <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-all group">
                                    <div className="relative aspect-square bg-gray-50 dark:bg-gray-800">
                                        {primary ? (
                                            <img src={primary.image_url} alt={p.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                <Image size={40} />
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2 flex flex-col gap-1">
                                            {p.is_featured && <span className="px-2 py-0.5 bg-amber-400 text-white text-[10px] font-black rounded-full">FEATURED</span>}
                                            {!p.is_active && <span className="px-2 py-0.5 bg-gray-500 text-white text-[10px] font-black rounded-full">HIDDEN</span>}
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <p className="font-bold text-gray-900 dark:text-gray-100 text-sm truncate">{p.title}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">{p.category} · {p.city}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-primary font-bold text-sm">Rs. {p.price.toLocaleString()}</span>
                                            {p.original_price && <span className="text-gray-400 text-xs line-through">Rs. {p.original_price.toLocaleString()}</span>}
                                        </div>
                                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => toggleField(p.id, 'is_active', !p.is_active)} className={`p-1 transition-colors ${p.is_active ? 'text-emerald-500' : 'text-gray-400'}`}><Eye size={15} /></button>
                                                <button type="button" onClick={() => toggleField(p.id, 'is_featured', !p.is_featured)} className={`p-1 transition-colors ${p.is_featured ? 'text-amber-500' : 'text-gray-400'}`}><Star size={15} /></button>
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(p); }} className="p-1 text-blue-500 hover:bg-blue-50 rounded-lg"><Edit3 size={15} /></button>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ show: true, id: p.id }); }} className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={15} /></button>
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
                <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-8 px-4">
                    <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-3xl shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
                            <h2 className="text-lg font-black text-gray-900 dark:text-gray-100">{editingProduct ? 'Edit Product' : 'Add Website Product'}</h2>
                            <button onClick={() => setShowForm(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Product Title *</label>
                                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Premium Cotton T-Shirt" className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Description</label>
                                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Product description..." className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Category</label>
                                        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Ship From</label>
                                        <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                                            {CITIES.map(c => <option key={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5">Delivery Days</label>
                                        <input value={form.delivery_days} onChange={e => setForm(f => ({ ...f, delivery_days: e.target.value }))} placeholder="2-4" className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700">
                                        <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="accent-primary" />
                                        Active
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700">
                                        <input type="checkbox" checked={form.is_featured} onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))} className="accent-amber-500" />
                                        Featured
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700">
                                        <input type="checkbox" checked={form.show_shopinepal} onChange={e => setForm(f => ({ ...f, show_shopinepal: e.target.checked }))} className="accent-primary" />
                                        ShopiNepal Badge
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700">
                                        <input type="checkbox" checked={form.is_cod} onChange={e => setForm(f => ({ ...f, is_cod: e.target.checked }))} className="accent-emerald-500" />
                                        COD Available
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700">
                                        <input type="checkbox" checked={form.is_prepaid} onChange={e => setForm(f => ({ ...f, is_prepaid: e.target.checked }))} className="accent-blue-500" />
                                        Prepaid
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700">
                                        <input type="checkbox" checked={form.is_prebook} onChange={e => setForm(f => ({ ...f, is_prebook: e.target.checked }))} className="accent-amber-500" />
                                        Pre-booking
                                    </label>
                                </div>
                                
                                
                                <div className="mt-8 border-t border-gray-100 dark:border-gray-800 pt-8">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-black text-gray-900 dark:text-gray-100 uppercase tracking-widest flex items-center gap-2">
                                            <Package size={14} className="text-primary" /> Inventory Mapping
                                        </h3>
                                        <div className="flex gap-4">
                                            <button 
                                                type="button"
                                                onClick={() => setVariants([...variants, { product_id: editingProduct?.id || 0, color: 'Standard', size: 'Universal', sku: 'SKU-' + Math.floor(Math.random()*1000), price: '', inventory_product_id: '' }])}
                                                className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 flex items-center gap-1 uppercase tracking-widest"
                                            >
                                                <Check size={12} strokeWidth={3} /> Standard (No Size)
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => setVariants([...variants, { product_id: editingProduct?.id || 0, color: '', size: '', sku: 'SKU-' + Math.floor(Math.random()*1000), price: '', inventory_product_id: '' }])}
                                                className="text-[10px] font-black text-primary hover:text-primary/80 flex items-center gap-1 uppercase tracking-widest"
                                            >
                                                <Plus size={12} strokeWidth={3} /> Custom Size/Color
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {variants.map((v, idx) => (
                                            <div key={idx} className="grid grid-cols-12 gap-3 items-end bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-800">
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Color</label>
                                                    <input 
                                                        value={v.color} 
                                                        onChange={e => setVariants(vs => vs.map((vi, i) => i === idx ? { ...vi, color: e.target.value } : vi))}
                                                        placeholder="Red" 
                                                        className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold" 
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Size</label>
                                                    <input 
                                                        value={v.size} 
                                                        onChange={e => setVariants(vs => vs.map((vi, i) => i === idx ? { ...vi, size: e.target.value } : vi))}
                                                        placeholder="M" 
                                                        className="w-full h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold" 
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Price</label>
                                                    <input 
                                                        type="number"
                                                        value={v.price || ''} 
                                                        onChange={e => setVariants(vs => vs.map((vi, i) => i === idx ? { ...vi, price: e.target.value } : vi))}
                                                        placeholder="Rs." 
                                                        className="w-full h-9 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-[11px] font-bold text-primary" 
                                                    />
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">SKU</label>
                                                    <input 
                                                        value={v.sku} 
                                                        onChange={e => setVariants(vs => vs.map((vi, i) => i === idx ? { ...vi, sku: e.target.value } : vi))}
                                                        placeholder="SKU"
                                                        className="w-full h-9 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-[10px] font-bold" 
                                                    />
                                                </div>
                                                <div className="col-span-3">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Link Inventory Item</label>
                                                    <select 
                                                        value={v.inventory_product_id}
                                                        onChange={e => {
                                                            const invId = e.target.value;
                                                            const invItem = inventoryItems.find(p => p.id.toString() === invId);
                                                            setVariants(vs => vs.map((vi, i) => i === idx ? { 
                                                                ...vi, 
                                                                inventory_product_id: invId,
                                                                sku: invItem ? invItem.sku : vi.sku 
                                                            } : vi));
                                                        }}
                                                        className="w-full h-9 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-[10px] font-bold"
                                                    >
                                                        <option value="">-- Link SKU --</option>
                                                        {inventoryItems.map(inv => <option key={inv.id} value={inv.id}>{inv.name} ({inv.sku})</option>)}
                                                    </select>
                                                </div>
                                                <div className="col-span-1">
                                                    <button onClick={() => setVariants(vs => vs.filter((_, i) => i !== idx))} className="h-9 w-9 flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
                                                </div>
                                                {v.current_stock !== undefined && (
                                                    <div className="col-span-12 mt-2 flex items-center gap-2">
                                                        <div className={`h-1.5 w-1.5 rounded-full ${v.current_stock > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                                            Current Inventory Stock: <span className={v.current_stock > 0 ? 'text-emerald-500' : 'text-rose-500'}>{v.current_stock} units</span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {variants.length === 0 && (
                                            <div className="py-8 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl flex flex-col items-center justify-center gap-2">
                                                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No variants mapped yet</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Product Images</label>
                                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e => e.target.files && handleImageFiles(e.target.files)} />
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {form.images.map((img, i) => (
                                        <div key={i} className={`flex flex-col gap-2 p-2 rounded-2xl border ${img.is_primary ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800'}`}>
                                            <div className="relative aspect-square rounded-xl overflow-hidden group">
                                                <img src={img.preview || img.image_url} alt="" className="w-full h-full object-cover" />
                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                                    <button type="button" onClick={() => setPrimaryImage(i)} className="p-1.5 bg-white/90 rounded-lg text-gray-700 hover:text-amber-500" title="Set primary"><Star size={14} className={img.is_primary ? 'fill-amber-500 text-amber-500' : ''} /></button>
                                                    <button type="button" onClick={() => removeImage(i)} className="p-1.5 bg-white/90 rounded-lg text-rose-500" title="Remove"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                            <input 
                                                value={img.label} 
                                                onChange={e => setForm(f => ({ ...f, images: f.images.map((im, idx) => idx === i ? { ...im, label: e.target.value } : im) }))}
                                                placeholder="Label (e.g. Black)"
                                                className="w-full h-8 px-2 text-[11px] font-bold rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                            />
                                        </div>
                                    ))}
                                    <button onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary hover:text-primary transition-all">
                                        <Upload size={24} />
                                        <span className="text-[11px] font-black uppercase">Add Photo</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 dark:border-gray-800">
                            <button onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-60">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                {saving ? 'Saving...' : (editingProduct ? 'Update Product' : 'Add Product')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirm.show && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-[2rem] p-8 w-full max-w-sm shadow-2xl text-center border border-gray-100 dark:border-gray-800">
                        <div className="w-20 h-20 bg-rose-50 dark:bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Trash2 size={32} className="text-rose-500" />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-gray-100 mb-2">Delete Product?</h3>
                        <p className="text-sm text-gray-500 mb-8 leading-relaxed">This action is permanent and will completely erase this product and its images from your store.</p>
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={handleDelete}
                                disabled={saving}
                                className="w-full py-4 bg-rose-500 text-white rounded-2xl font-black text-sm hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50"
                            >
                                {saving ? 'DELETING...' : 'YES, DELETE PERMANENTLY'}
                            </button>
                            <button 
                                onClick={() => setDeleteConfirm({ show: false, id: null })}
                                className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-2xl font-black text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                            >
                                NO, KEEP IT
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}
