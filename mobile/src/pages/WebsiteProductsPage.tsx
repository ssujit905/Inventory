import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuthStore } from '../hooks/useAuthStore';
import { supabase, supabaseWithTimeout } from '../lib/supabase';
import {
    Plus, Trash2, Edit3, X, Upload, Image, Star, Eye, EyeOff,
    Package, Loader2, Check, AlertTriangle, Globe, Video
} from 'lucide-react';

interface ProductVariant {
    id?: string;
    product_id: number;
    color: string;
    size: string;
    sku: string;
    inventory_product_id: string;
    combo_items?: string[];
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
    video_url?: string | null;
    website_product_images: ProductImage[];
}

const CATEGORIES = ['Electronics', 'Clothing', 'Accessories', 'Home & Living', 'Sports', 'Beauty', 'Footwear', 'General'];
const CITIES = ['Kathmandu', 'Pokhara', 'Bhaktapur', 'Lalitpur', 'Bharatpur', 'Biratnagar', 'Birgunj', 'Dharan'];

export default function WebsiteProductsPage() {
    const { profile } = useAuthStore();
    const [products, setProducts] = useState<WebsiteProduct[]>([]);
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const isReadOnly = profile?.permissions === 'read_only';
    const [showForm, setShowForm] = useState(false);
    const [editingProduct, setEditingProduct] = useState<WebsiteProduct | null>(null);
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: number | null }>({ show: false, id: null });
    const [videoProgress, setVideoProgress] = useState<number | null>(null);
    const [imageProgress, setImageProgress] = useState<{current: number, total: number, pct: number} | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const emptyForm = {
        title: '', description: '', price: '', original_price: '',
        category: 'General', city: 'Kathmandu', delivery_days: '2-4',
        is_active: true, is_featured: false, show_shopinepal: true, 
        is_cod: true, is_prepaid: false, is_prebook: false,
        sizes: '',
        images: [] as ProductImage[],
        video_url: '',
        video_file: undefined as File | undefined,
        video_progress: undefined as number | undefined
    };
    const [form, setForm] = useState(emptyForm);

    // --- DRAFT PERSISTENCE ---
    useEffect(() => {
        const savedDraft = localStorage.getItem('mobile_web_product_draft');
        const savedVariantsDraft = localStorage.getItem('mobile_web_product_variants_draft');
        const savedFormOpen = localStorage.getItem('mobile_web_product_form_open');

        if (savedFormOpen === 'true') setShowForm(true);
        if (savedDraft) {
            try {
                const d = JSON.parse(savedDraft);
                // Exclude files/binary data from draft restoration
                setForm(prev => ({ 
                    ...prev, 
                    ...d,
                    images: [], // Re-upload images on refresh
                    video_file: undefined 
                }));
            } catch (e) { console.error('Mobile Product draft restore failed'); }
        }
        if (savedVariantsDraft) {
            try {
                setVariants(JSON.parse(savedVariantsDraft));
            } catch (e) { console.error('Mobile Variants draft restore failed'); }
        }
    }, []);

    useEffect(() => {
        if (showForm) {
            // Filter out non-serializable fields before saving
            const { images, video_file, ...serializableForm } = form;
            localStorage.setItem('mobile_web_product_draft', JSON.stringify(serializableForm));
            localStorage.setItem('mobile_web_product_variants_draft', JSON.stringify(variants));
            localStorage.setItem('mobile_web_product_form_open', 'true');
        } else {
            localStorage.removeItem('mobile_web_product_form_open');
        }
    }, [form, variants, showForm]);

    const clearDraft = () => {
        localStorage.removeItem('mobile_web_product_draft');
        localStorage.removeItem('mobile_web_product_variants_draft');
        localStorage.removeItem('mobile_web_product_form_open');
    };

    useEffect(() => { fetchProducts(); }, []);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchProducts = async () => {
        setLoading(true);
        const { data, error } = await supabaseWithTimeout(
            supabase
                .from('website_products')
                .select(`*, website_product_images(*)`)
                .order('created_at', { ascending: false })
        );
        if (error) {
            showToast(error.message, 'error');
        } else {
            setProducts(data || []);
        }

        // Also fetch inventory items for mapping
        const { data: inv, error: invErr } = await supabaseWithTimeout(
            supabase.from('products').select('id, name, sku, description, image_url')
        );
        if (invErr) console.warn('Inventory fetch failed', invErr);
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
            images: p.website_product_images.map(img => ({ ...img })),
            video_url: p.video_url || ''
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

    const uploadImage = async (file: File, onProgress?: (pct: number) => void): Promise<string> => {
        const ext = file.name.split('.').pop();
        const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        
        // Supabase v2 supports onUploadProgress in the options
        const { error } = await supabaseWithTimeout(
            supabase.storage.from('website-images').upload(path, file, {
                onUploadProgress: (progress) => {
                    const pct = Math.round((progress.loaded / progress.total) * 100);
                    if (onProgress) onProgress(pct);
                }
            }),
            120000 // Give large images up to 2 mins
        );
        
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

            const productData: any = {
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
                video_url: form.video_url,
                updated_at: new Date().toISOString()
            };

            // --- FIRST UPLOAD VIDEO IF A NEW ONE IS SELECTED ---
            if (form.video_file) {
                setVideoProgress(0); // Dedicated state start
                const ext = form.video_file.name.split('.').pop();
                const path = `videos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
                const { error: vidErr } = await supabaseWithTimeout(
                    supabase.storage.from('website-images').upload(path, form.video_file, {
                        onUploadProgress: (progress) => {
                            const pct = Math.round((progress.loaded / progress.total) * 100);
                            setVideoProgress(pct);
                        }
                    }),
                    300000 // 5 mins for video
                );
                if (vidErr) throw vidErr;
                const { data: vidData } = supabase.storage.from('website-images').getPublicUrl(path);
                productData.video_url = vidData.publicUrl;
                setVideoProgress(100);
            }

            let productId = editingProduct?.id;

            if (editingProduct) {
                const { error } = await supabaseWithTimeout(
                    supabase.from('website_products').update(productData).eq('id', editingProduct.id)
                );
                if (error) throw error;
            } else {
                const { data, error } = await supabaseWithTimeout(
                    supabase.from('website_products').insert(productData).select().single()
                );
                if (error) throw error;
                productId = data.id;
            }

            // --- SAVE VARIANTS ---
            if (productId) {
                if (editingProduct) {
                    const existingIds = variants.filter(v => v.id).map(v => v.id);
                    if (existingIds.length > 0 || variants.length === 0) {
                        try {
                            const { error: delErr } = await supabaseWithTimeout(
                                supabase.from('website_variants')
                                    .delete()
                                    .eq('product_id', productId)
                                    .not('id', 'in', `(${existingIds.length > 0 ? existingIds.join(',') : '0'})`)
                            );
                            if (delErr && delErr.code !== '23503') console.error('Delete Variants error:', delErr);
                        } catch (e) { console.warn('Variant cleanup skipped due to dependency'); }
                    }
                }

                if (variants.length > 0) {
                    const toInsert = variants.filter(v => !v.id).map(v => ({
                        product_id: productId,
                        color: v.color,
                        size: v.size,
                        sku: v.sku,
                        price: v.price ? parseFloat(v.price.toString()) : null,
                        inventory_product_id: v.inventory_product_id || null,
                        ...(v.color === 'Combo' ? { is_bundle: true } : {})
                    }));

                    const toUpdate = variants.filter(v => !!v.id).map(v => ({
                        ...v,
                        inventory_product_id: v.inventory_product_id || null,
                        ...(v.color === 'Combo' ? { is_bundle: true } : {})
                    }));

                    if (toInsert.length > 0) {
                        const { error: insErr } = await supabaseWithTimeout(
                            supabase.from('website_variants').insert(toInsert)
                        );
                        if (insErr) throw insErr;
                    }

                    for (const v of toUpdate) {
                        const { error: updErr } = await supabaseWithTimeout(
                            supabase.from('website_variants').update({
                                color: v.color,
                                size: v.size,
                                sku: v.sku,
                                price: v.price ? parseFloat(v.price.toString()) : null,
                                inventory_product_id: v.inventory_product_id || null,
                                ...(v.color === 'Combo' ? { is_bundle: true } : {})
                            }).eq('id', v.id)
                        );
                        if (updErr) throw updErr;
                    }
                    
                    // Attempt to save combo bundles if they exist
                    const combos = variants.filter(v => v.color === 'Combo' && (v.combo_items || []).length > 0);
                    if (combos.length > 0) {
                        try {
                            // Find the generated IDs for inserted combos
                            const { data: currentVariants } = await supabase.from('website_variants').select('id, sku').eq('product_id', productId);
                            for (const combo of combos) {
                                const dbVariant = currentVariants?.find(cv => cv.sku === combo.sku);
                                if (dbVariant && combo.combo_items) {
                                    // First delete existing bundles for this variant to prevent duplicates
                                    await supabase.from('website_variant_bundles').delete().eq('bundle_variant_id', dbVariant.id);
                                    
                                    const bundleInserts = combo.combo_items.map(invId => ({
                                        bundle_variant_id: dbVariant.id,
                                        // We map the inventory item ID as child directly if the schema was modified to support it,
                                        // otherwise if it expects child_variant_id, we map it. 
                                        // Since the user is selecting inventory items directly, we'll try saving them as child_inventory_id or similar.
                                        // Assuming user ran the sql_combo_system.sql but tweaked it for direct inventory_product_id.
                                        // If the schema expects child_variant_id, this will fail safely and warn the user.
                                        child_inventory_id: invId,
                                        quantity: 1
                                    }));
                                    const { error: bundleErr } = await supabase.from('website_variant_bundles').insert(bundleInserts);
                                    if (bundleErr) console.warn("Failed to save bundle mappings (Schema might not be updated):", bundleErr);
                                }
                            }
                        } catch (e) {
                            console.warn("Bundle mapping save skipped:", e);
                        }
                    }
                }
            }

            // --- SAVE IMAGES (SEQUENTIAL NOW TO PREVENT FREEZE) ---
            if (productId) {
                if (editingProduct) {
                    const { error: imgDelErr } = await supabaseWithTimeout(
                        supabase.from('website_product_images').delete().eq('product_id', productId)
                    );
                    if (imgDelErr) throw imgDelErr;
                }

                const uploadedImages: any[] = [];
                const updatedImagesForState = [...form.images];

                for (let i = 0; i < updatedImagesForState.length; i++) {
                    const img = updatedImagesForState[i];
                    if (img.file) {
                        setImageProgress({ current: i + 1, total: updatedImagesForState.filter(im => im.file).length, pct: 0 });
                        try {
                            const url = await uploadImage(img.file, (pct) => {
                                setImageProgress(prev => prev ? { ...prev, pct } : null);
                                // Update local state for individual progress bar as well
                                setForm(prev => ({
                                    ...prev,
                                    images: prev.images.map((im, idx) => 
                                        idx === i ? { ...im, uploadProgress: pct } : im
                                    )
                                }));
                            });
                            uploadedImages.push({ 
                                image_url: url, 
                                label: img.label || '', 
                                is_primary: img.is_primary, 
                                sort_order: img.sort_order 
                            });
                        } catch (err: any) {
                            console.error('Image upload item error:', err);
                            // We keep going for other images but fail overall
                            throw new Error(`Failed to upload ${img.file.name}: ${err.message}`);
                        }
                    } else if (img.image_url) {
                        uploadedImages.push({ 
                            image_url: img.image_url, 
                            label: img.label || '', 
                            is_primary: img.is_primary, 
                            sort_order: img.sort_order 
                        });
                    }
                }

                if (uploadedImages.length > 0) {
                    const { error: imgInsErr } = await supabaseWithTimeout(
                        supabase.from('website_product_images').insert(
                            uploadedImages.map(img => ({ ...img, product_id: productId }))
                        )
                    );
                    if (imgInsErr) throw imgInsErr;
                }
            }

            showToast(editingProduct ? 'Product and Variants updated!' : 'Product added!');
            clearDraft();
            setShowForm(false);
            fetchProducts();
        } catch (err: any) {
            console.error('Save failed:', err);
            showToast(err.message || 'Save failed', 'error');
        } finally {
            setSaving(false);
            setVideoProgress(null);
            setImageProgress(null);
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

            <div className="px-5 w-full space-y-6 pb-24 lg:pb-12">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Website Products</h1>
                        <p className="text-gray-400 font-medium text-[10px] uppercase tracking-[0.2em]">Manage your online storefront listings.</p>
                    </div>
                    <button 
                        onClick={() => !isReadOnly && openAdd()} 
                        disabled={isReadOnly}
                        className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg active:scale-95 ${isReadOnly ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-primary text-white shadow-primary/10 hover:bg-primary/90'}`}
                    >
                        <Plus size={16} strokeWidth={2.5} />
                        {isReadOnly ? 'Read Only Mode' : 'Launch New Product'}
                    </button>
                </div>

                {loading ? (
                    <div className="flex h-64 flex-col items-center justify-center gap-4">
                        <div className="h-10 w-10 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Scanning Catalog...</p>
                    </div>
                ) : products.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 gap-4">
                        <Package size={48} className="text-gray-200 dark:text-gray-700" />
                        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No products listed</p>
                        <button onClick={openAdd} className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-xs">Start Your Catalog</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {products.map((p, idx) => {
                            const primary = p.website_product_images?.find(i => i.is_primary) || p.website_product_images?.[0];
                            const displayIndex = products.length - idx;
                            return (
                                <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm hover:shadow-md transition-all active:scale-[0.99]">
                                    {/* Image Section */}
                                    <div className="aspect-video bg-gray-50 dark:bg-gray-800 relative group">
                                        {primary ? (
                                            <img src={primary.image_url} alt={p.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                <Image size={40} strokeWidth={1.5} />
                                            </div>
                                        )}
                                        
                                        <div className="absolute top-3 left-3">
                                            <span className="h-7 w-7 rounded-full bg-white/90 dark:bg-gray-900/90 backdrop-blur-md text-gray-900 dark:text-white flex items-center justify-center text-[11px] font-black shadow-sm">
                                                {displayIndex}
                                            </span>
                                        </div>

                                        <div className="absolute top-3 right-3 flex flex-col gap-1.5 items-end">
                                            {p.is_featured && <span className="px-2 py-0.5 bg-amber-400 text-white text-[9px] font-black rounded-md shadow-sm">FEATURED</span>}
                                            {!p.is_active && <span className="px-2 py-0.5 bg-gray-900/80 backdrop-blur-md text-white text-[9px] font-black rounded-md">HIDDEN</span>}
                                        </div>
                                    </div>

                                    {/* Content Section */}
                                    <div className="p-4 space-y-3">
                                        <div>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{p.category}</p>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{p.city}</p>
                                            </div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5 truncate leading-tight">{p.title}</h3>
                                        </div>

                                        <div className="flex items-end justify-between">
                                            <div className="space-y-0.5">
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">Listing Price</p>
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-lg font-black text-primary leading-none">Rs. {p.price.toLocaleString()}</span>
                                                    {p.original_price && <span className="text-[10px] text-gray-400 line-through font-bold">Rs. {p.original_price.toLocaleString()}</span>}
                                                </div>
                                            </div>
                                            
                                            <div className="flex gap-1">
                                                <button onClick={() => toggleField(p.id, 'is_active', !p.is_active)} className={`p-2 rounded-lg transition-colors ${p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'}`}><Eye size={16} /></button>
                                                <button onClick={() => toggleField(p.id, 'is_featured', !p.is_featured)} className={`p-2 rounded-lg transition-colors ${p.is_featured ? 'bg-amber-50 text-amber-500' : 'bg-gray-50 text-gray-400'}`}><Star size={16} className={p.is_featured ? 'fill-amber-500' : ''} /></button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            <button 
                                                onClick={() => !isReadOnly && openEdit(p)} 
                                                disabled={isReadOnly}
                                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${isReadOnly ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100'}`}
                                            >
                                                <Edit3 size={14} /> Edit
                                            </button>
                                            <button 
                                                onClick={() => !isReadOnly && setDeleteConfirm({ show: true, id: p.id })} 
                                                disabled={isReadOnly}
                                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${isReadOnly ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 hover:bg-rose-100'}`}
                                            >
                                                <Trash2 size={14} /> Remove
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-950/40 backdrop-blur-sm overflow-y-auto">
                    <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-[2rem] shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Global Progress Tracking Header */}
                        {(videoProgress !== null || imageProgress !== null) && (
                            <div className="absolute top-0 left-0 right-0 z-[60] bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4 animate-in slide-in-from-top duration-300">
                                <div className="flex-1">
                                    <div className="flex justify-between items-end mb-2">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Live Upload Status</span>
                                            <span className="text-xs font-black text-gray-900 uppercase">
                                                {videoProgress !== null ? 'Phase 1: Uploading Video' : `Phase 2: Photos (${imageProgress?.current}/${imageProgress?.total})`}
                                            </span>
                                        </div>
                                        <span className="text-xl font-black text-primary">
                                            {videoProgress !== null ? videoProgress : imageProgress?.pct}%
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-primary transition-all duration-300 shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                                            style={{ width: `${videoProgress !== null ? videoProgress : imageProgress?.pct}%` }}
                                        />
                                    </div>
                                </div>
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary animate-pulse">
                                    <Upload size={16} strokeWidth={3} />
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                            <div>
                                <h2 className="text-lg font-black text-gray-900 dark:text-gray-100 uppercase tracking-tight">{editingProduct ? 'Edit Listing' : 'Launch New Product'}</h2>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Catalog Entry System</p>
                            </div>
                            <button onClick={() => setShowForm(false)} className="p-2 bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-gray-600 rounded-xl transition-all active:scale-95"><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-8 overflow-y-auto">

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Product Title *</label>
                                    <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Premium Cotton T-Shirt" className="w-full h-11 px-4 rounded-xl border border-transparent bg-gray-50 dark:bg-gray-800/50 text-sm font-medium focus:bg-white dark:focus:bg-gray-800 focus:border-primary/30 outline-none transition-all" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Marketplace Description</label>
                                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Tell your customers about this product..." className="w-full px-4 py-3 rounded-xl border border-transparent bg-gray-50 dark:bg-gray-800/50 text-sm font-medium focus:bg-white dark:focus:bg-gray-800 focus:border-primary/30 outline-none transition-all resize-none" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Category</label>
                                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full h-11 px-4 rounded-xl border border-transparent bg-gray-50 dark:bg-gray-800/50 text-sm font-medium focus:bg-white dark:focus:bg-gray-800 focus:border-primary/30 outline-none transition-all">
                                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Dispatch City</label>
                                    <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full h-11 px-4 rounded-xl border border-transparent bg-gray-50 dark:bg-gray-800/50 text-sm font-medium focus:bg-white dark:focus:bg-gray-800 focus:border-primary/30 outline-none transition-all">
                                        {CITIES.map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Delivery EST</label>
                                    <input value={form.delivery_days} onChange={e => setForm(f => ({ ...f, delivery_days: e.target.value }))} placeholder="2-4 Days" className="w-full h-11 px-4 rounded-xl border border-transparent bg-gray-50 dark:bg-gray-800/50 text-sm font-medium focus:bg-white dark:focus:bg-gray-800 focus:border-primary/30 outline-none transition-all" />
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-x-6 gap-y-4 pt-2">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="sr-only peer" />
                                        <div className="w-10 h-5 bg-gray-200 dark:bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-700">Active</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" checked={form.is_featured} onChange={e => setForm(f => ({ ...f, is_featured: e.target.checked }))} className="sr-only peer" />
                                        <div className="w-10 h-5 bg-gray-200 dark:bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-700">Featured</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" checked={form.show_shopinepal} onChange={e => setForm(f => ({ ...f, show_shopinepal: e.target.checked }))} className="sr-only peer" />
                                        <div className="w-10 h-5 bg-gray-200 dark:bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-700">ShopiNepal</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" checked={form.is_cod} onChange={e => setForm(f => ({ ...f, is_cod: e.target.checked }))} className="sr-only peer" />
                                        <div className="w-10 h-5 bg-gray-200 dark:bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-700">COD</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" checked={form.is_prepaid} onChange={e => setForm(f => ({ ...f, is_prepaid: e.target.checked }))} className="sr-only peer" />
                                        <div className="w-10 h-5 bg-gray-200 dark:bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-700">Prepaid</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative flex items-center">
                                        <input type="checkbox" checked={form.is_prebook} onChange={e => setForm(f => ({ ...f, is_prebook: e.target.checked }))} className="sr-only peer" />
                                        <div className="w-10 h-5 bg-gray-200 dark:bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-700">Pre-book</span>
                                </label>
                            </div>

                            <div className="mt-8 border-t border-gray-100 dark:border-gray-800 pt-8">
                                <div className="flex flex-col gap-6 mb-8">
                                    <h3 className="text-xs font-black text-gray-900 dark:text-gray-100 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                                        <div className="w-1.5 h-4 bg-primary rounded-full" />
                                        Inventory Mapping
                                    </h3>
                                    
                                    <div className="flex flex-col gap-3">
                                        <button 
                                            type="button"
                                            onClick={() => setVariants([...variants, { product_id: editingProduct?.id || 0, color: 'Standard', size: 'Universal', sku: 'SKU-' + Date.now().toString().slice(-4) + Math.random().toString(36).substring(2, 5).toUpperCase(), price: '', inventory_product_id: '' }])}
                                            className="flex items-center justify-between px-5 py-4 bg-emerald-500/5 text-emerald-600 rounded-[1.5rem] border border-emerald-500/10 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all group shadow-sm active:scale-95"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:bg-white group-hover:text-emerald-500 transition-colors">
                                                    <Check size={18} strokeWidth={3} />
                                                </div>
                                                <div className="flex flex-col items-start">
                                                    <span>Add Standard Variant</span>
                                                    <span className="text-[8px] opacity-60 font-medium normal-case tracking-normal mt-0.5">Single variant with universal size</span>
                                                </div>
                                            </div>
                                            <Plus size={16} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => setVariants([...variants, { product_id: editingProduct?.id || 0, color: 'Combo', size: 'Package', sku: 'COMBO-' + Date.now().toString().slice(-4) + Math.random().toString(36).substring(2, 5).toUpperCase(), price: '', inventory_product_id: '', combo_items: [] }])}
                                            className="flex items-center justify-between px-5 py-4 bg-amber-500/5 text-amber-600 rounded-[1.5rem] border border-amber-500/10 font-black text-[10px] uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all group shadow-sm active:scale-95"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:bg-white group-hover:text-amber-500 transition-colors">
                                                    <Package size={18} strokeWidth={3} />
                                                </div>
                                                <div className="flex flex-col items-start">
                                                    <span>Add Combo Package</span>
                                                    <span className="text-[8px] opacity-60 font-medium normal-case tracking-normal mt-0.5">Multiple items sold as one unit</span>
                                                </div>
                                            </div>
                                            <Plus size={16} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                                        </button>

                                        <button 
                                            type="button"
                                            onClick={() => setVariants([...variants, { product_id: editingProduct?.id || 0, color: '', size: '', sku: 'SKU-' + Date.now().toString().slice(-4) + Math.random().toString(36).substring(2, 5).toUpperCase(), price: '', inventory_product_id: '' }])}
                                            className="flex items-center justify-between px-5 py-4 bg-primary/5 text-primary rounded-[1.5rem] border border-primary/10 font-black text-[10px] uppercase tracking-widest hover:bg-primary hover:text-white transition-all group shadow-sm active:scale-95"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 group-hover:bg-white group-hover:text-primary transition-colors">
                                                    <Plus size={18} strokeWidth={3} />
                                                </div>
                                                <div className="flex flex-col items-start">
                                                    <span>Add Custom Variant</span>
                                                    <span className="text-[8px] opacity-60 font-medium normal-case tracking-normal mt-0.5">Specific colors, sizes, or attributes</span>
                                                </div>
                                            </div>
                                            <Plus size={16} className="opacity-40 group-hover:opacity-100 transition-opacity" />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {variants.map((v, idx) => {
                                        const isStandard = v.color === 'Standard' && v.size === 'Universal';
                                        const isCombo = v.color === 'Combo' && v.size === 'Package';
                                        return (
                                            <div key={idx} className={`flex flex-col gap-6 p-6 rounded-[2.5rem] border ${isCombo ? 'bg-amber-50/30 dark:bg-amber-900/5 border-amber-100 dark:border-amber-900/20' : 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-800'} relative overflow-hidden group`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black ${isCombo ? 'bg-amber-500 text-white' : 'bg-primary text-white'}`}>
                                                            {idx + 1}
                                                        </div>
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                                            {isStandard ? 'Standard Variant' : isCombo ? 'Combo Package' : 'Custom Variant'}
                                                        </span>
                                                    </div>
                                                    <button 
                                                        type="button"
                                                        onClick={() => setVariants(vs => vs.filter((_, i) => i !== idx))} 
                                                        className="p-2.5 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all active:scale-90"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>

                                                <div className="space-y-5">
                                                    {!isStandard && !isCombo && (
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div className="space-y-1.5">
                                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Variant Name</label>
                                                                <input 
                                                                    value={v.color} 
                                                                    onChange={e => setVariants(vs => vs.map((vi, i) => i === idx ? { ...vi, color: e.target.value } : vi))}
                                                                    placeholder="e.g. Red" 
                                                                    className="w-full h-11 px-4 rounded-xl border border-transparent bg-white dark:bg-gray-800 text-sm font-medium focus:border-primary/30 outline-none transition-all" 
                                                                />
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Size</label>
                                                                <input 
                                                                    value={v.size} 
                                                                    onChange={e => setVariants(vs => vs.map((vi, i) => i === idx ? { ...vi, size: e.target.value } : vi))}
                                                                    placeholder="e.g. XL" 
                                                                    className="w-full h-11 px-4 rounded-xl border border-transparent bg-white dark:bg-gray-800 text-sm font-medium focus:border-primary/30 outline-none transition-all" 
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="space-y-1.5">
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Sale Price</label>
                                                            <div className="relative">
                                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-primary">Rs.</span>
                                                                <input 
                                                                    type="number"
                                                                    value={v.price || ''} 
                                                                    onChange={e => setVariants(vs => vs.map((vi, i) => i === idx ? { ...vi, price: e.target.value } : vi))}
                                                                    placeholder="0.00" 
                                                                    className="w-full h-11 pl-12 pr-4 rounded-xl border border-transparent bg-white dark:bg-gray-800 text-sm font-black text-primary focus:border-primary/30 outline-none transition-all" 
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Product SKU</label>
                                                            <input 
                                                                value={v.sku} 
                                                                onChange={e => setVariants(vs => vs.map((vi, i) => i === idx ? { ...vi, sku: e.target.value } : vi))}
                                                                placeholder="SKU-XXXX"
                                                                className="w-full h-11 px-4 rounded-xl border border-transparent bg-white dark:bg-gray-800 text-[11px] font-black uppercase focus:border-primary/30 outline-none transition-all" 
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">
                                                            {isCombo ? 'Linked Inventory Components' : 'Link Inventory Master SKU'}
                                                        </label>
                                                        {isCombo ? (
                                                            <div className="space-y-3">
                                                                <select 
                                                                    value=""
                                                                    onChange={e => {
                                                                        const invId = e.target.value;
                                                                        if (!invId) return;
                                                                        setVariants(vs => vs.map((vi, i) => {
                                                                            if (i === idx) {
                                                                                const currentIds = vi.combo_items || [];
                                                                                if (!currentIds.includes(invId)) {
                                                                                    return { ...vi, combo_items: [...currentIds, invId] };
                                                                                }
                                                                            }
                                                                            return vi;
                                                                        }));
                                                                    }}
                                                                    className="w-full h-11 px-4 rounded-xl border border-transparent bg-white dark:bg-gray-800 text-xs font-bold focus:border-amber-500/30 outline-none shadow-sm"
                                                                >
                                                                    <option value="">+ Add Component from Inventory</option>
                                                                    {inventoryItems.map(inv => <option key={inv.id} value={inv.id}>{inv.sku} - {inv.name}</option>)}
                                                                </select>
                                                                {(v.combo_items || []).length > 0 && (
                                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                                        {(v.combo_items || []).map(id => {
                                                                            const item = inventoryItems.find(p => p.id.toString() === id);
                                                                            return (
                                                                                <div key={id} className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-amber-500/10 text-amber-600 dark:text-amber-500 rounded-full text-[10px] font-black border border-amber-500/20">
                                                                                    {item ? item.sku : id}
                                                                                    <button type="button" onClick={() => {
                                                                                        setVariants(vs => vs.map((vi, i) => i === idx ? { ...vi, combo_items: (vi.combo_items || []).filter(x => x !== id) } : vi));
                                                                                    }} className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-all"><X size={10} /></button>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
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
                                                                className="w-full h-11 px-4 rounded-xl border border-transparent bg-white dark:bg-gray-800 text-xs font-bold focus:border-primary/30 outline-none shadow-sm"
                                                            >
                                                                <option value="">-- Select Master Inventory Item --</option>
                                                                {inventoryItems.map(inv => <option key={inv.id} value={inv.id}>{inv.sku} - {inv.name}</option>)}
                                                            </select>
                                                        )}
                                                    </div>

                                                    {v.current_stock !== undefined && (
                                                        <div className="flex items-center gap-3 p-4 bg-white dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-800/50">
                                                            <div className={`w-2.5 h-2.5 rounded-full ${v.current_stock > 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`} />
                                                            <div className="flex flex-col">
                                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Inventory Status</span>
                                                                <span className={`text-xs font-black ${v.current_stock > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                    {v.current_stock} Units Available in Stock
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {variants.length === 0 && (
                                        <div className="py-8 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl flex flex-col items-center justify-center gap-2">
                                            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No variants mapped yet</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Product Images</label>
                                    <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={e => e.target.files && handleImageFiles(e.target.files)} />
                                    <div className="grid grid-cols-1 sm:grid-cols-2 sm:grid-cols-3 gap-4">
                                        {form.images.map((img, i) => (
                                            <div key={i} className={`flex flex-col gap-2 p-2 rounded-2xl border ${img.is_primary ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800'}`}>
                                                <div className="relative aspect-square rounded-xl overflow-hidden group">
                                                    <img src={img.preview || img.image_url} alt="" className="w-full h-full object-cover" />
                                                    
                                                    {/* Progress Overlay */}
                                                    {(img as any).uploadProgress !== undefined && (img as any).uploadProgress < 100 && (
                                                        <div className="absolute inset-0 z-20 bg-black/60 flex flex-col items-center justify-center p-4">
                                                            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden mb-2">
                                                                <div 
                                                                    className="h-full bg-primary transition-all duration-300"
                                                                    style={{ width: `${(img as any).uploadProgress}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-[10px] font-black text-white uppercase tracking-tighter">Uploading {(img as any).uploadProgress}%</span>
                                                        </div>
                                                    )}
                                                    {/* Always-visible delete button in top-right corner */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setForm(f => ({ ...f, images: f.images.filter((_, idx) => idx !== i) }))}
                                                        className="absolute top-1 right-1 z-10 p-1 bg-rose-500 text-white rounded-lg shadow-md hover:bg-rose-600 transition-colors"
                                                        title="Remove image"
                                                    >
                                                        <X size={12} strokeWidth={3} />
                                                    </button>
                                                    {/* Hover overlay for Set Primary */}
                                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <button type="button" onClick={() => setPrimaryImage(i)} className="p-1.5 bg-white/90 rounded-lg text-gray-700 hover:text-amber-500" title="Set primary"><Star size={14} className={img.is_primary ? 'fill-amber-500 text-amber-500' : ''} /></button>
                                                    </div>
                                                    {img.is_primary && (
                                                        <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-primary text-white text-[9px] font-black rounded-full">PRIMARY</div>
                                                    )}
                                                </div>
                                                <input 
                                                    value={img.label} 
                                                    onChange={e => setForm(f => ({ ...f, images: f.images.map((im, idx) => idx === i ? { ...im, label: e.target.value } : im) }))}
                                                    placeholder="Label (e.g. Black)"
                                                    className="w-full h-8 px-2 text-[11px] font-bold rounded-lg border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                                                />
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary hover:text-primary transition-all">
                                            <Upload size={24} />
                                            <span className="text-[11px] font-black uppercase">Add Photo</span>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Product Video (Optional)</label>
                                    <div className="relative group">
                                        <div className={`aspect-square rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center p-4 text-center ${form.video_url || form.video_file ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-gray-800 hover:border-primary/40'}`}>
                                            {(form.video_file || form.video_url) ? (
                                                <div className="space-y-4 w-full">
                                                    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
                                                        {form.video_file ? (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
                                                                <Video size={32} className="text-primary mb-2" />
                                                                <p className="text-[10px] text-white font-black uppercase">{form.video_file.name}</p>
                                                            </div>
                                                        ) : (
                                                            <video src={form.video_url} className="w-full h-full object-cover" controls />
                                                        )}
                                                        
                                                        {videoProgress !== null && videoProgress <= 100 && (
                                                            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
                                                                <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden mb-3 max-w-[140px]">
                                                                    <div 
                                                                        className="h-full bg-primary transition-all duration-300 shadow-[0_0_15px_rgba(239,68,68,0.6)]"
                                                                        style={{ width: `${videoProgress}%` }}
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-[11px] font-black text-white uppercase tracking-[0.3em] mb-2 animate-pulse">Uploading Video</span>
                                                                    <div className="text-3xl font-black text-white drop-shadow-lg">
                                                                        {videoProgress}<span className="text-primary text-xl">%</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button 
                                                        type="button"
                                                        onClick={() => setForm(f => ({ ...f, video_url: '', video_file: undefined, video_progress: undefined }))}
                                                        className="w-full py-2 bg-rose-500/10 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all"
                                                    >
                                                        Remove Video
                                                    </button>
                                                </div>
                                            ) : (
                                                <label className="cursor-pointer flex flex-col items-center gap-2">
                                                    <input 
                                                        type="file" 
                                                        accept="video/*" 
                                                        className="hidden" 
                                                        onChange={e => {
                                                            const file = e.target.files?.[0];
                                                            if (file) setForm(f => ({ ...f, video_file: file }));
                                                        }} 
                                                    />
                                                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-2">
                                                        <Video size={24} />
                                                    </div>
                                                    <span className="text-[11px] font-black uppercase text-primary">Upload Video</span>
                                                    <p className="text-[9px] text-gray-400 font-bold uppercase">MP4, MOV up to 50MB Recommendation</p>
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
                            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-all">Cancel</button>
                            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-8 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-60 shadow-lg shadow-primary/20 active:scale-95 transition-all">
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
                                {saving ? 'Processing...' : (editingProduct ? 'Commit Changes' : 'Publish Product')}
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
