/* eslint-disable react-refresh/only-export-components -- colocated provider + hook is the project convention */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { safeFetch } from '../lib/safeFetch';
import { getCache, setCache } from '../lib/cache';

const ProductContext = createContext();

const PRODUCTS_CACHE_KEY = 'shopy_products_v1';
const PRODUCTS_TTL_MS = 5 * 60 * 1000; // 5 min: prices/stock revalidate often

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchProducts = useCallback(async (isBackground = false) => {
        try {
            if (!isBackground) setLoading(true);
            setError(null);

            const { data, error: prodErr } = await safeFetch(() =>
                supabase
                    .from('website_products')
                    .select(`
                        *,
                        website_product_images(*)
                    `)
                    .eq('is_active', true)
                    .order('created_at', { ascending: false })
            );

            if (prodErr) {
                console.error('Supabase error fetching products:', prodErr);
                setError(prodErr.message || 'Failed to load products');
                return;
            }

            if (data) {
                // Fetch stock info for all products in one go to be efficient
                const { data: stockData } = await safeFetch(() =>
                    supabase
                        .from('website_variant_stock_view')
                        .select('*')
                );

                // Normalize to the shape the website expects
                const normalized = data.map(p => {
                    const primaryImg = p.website_product_images?.find(i => i.is_primary) || p.website_product_images?.[0];
                    const images = (p.website_product_images || [])
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map(img => ({
                            url: img.image_url,
                            label: img.label || ''
                        }));
                    
                    const productVariants = (stockData || []).filter(v => v.parent_product_id === p.id);
                    const totalStock = productVariants.reduce((acc, curr) => acc + (Number(curr.current_stock) || 0), 0);
                    
                    // Logic: 
                    // 1. If manual is_sold_out is true, it's sold out.
                    // 2. Otherwise, check if total stock across all variants is 0.
                    const isSoldOut = p.is_sold_out || (productVariants.length > 0 && totalStock <= 0);

                    return {
                        id: p.id,
                        title: p.title,
                        description: p.description,
                        price: p.price,
                        original_price: p.original_price,
                        category: p.category,
                        image: primaryImg?.image_url || '',
                        images: images,
                        location: p.city,
                        city: p.city,
                        shippingDays: `${p.delivery_days} Days Delivery`,
                        delivery_days: p.delivery_days,
                        is_featured: p.is_featured,
                        show_shopinepal: p.show_shopinepal,
                        is_cod: p.is_cod,
                        is_prepaid: p.is_prepaid,
                        is_prebook: p.is_prebook,
                        allow_cod: p.allow_cod ?? true,
                        allow_esewa: p.allow_esewa ?? true,
                        allow_fonepay: p.allow_fonepay ?? true,
                        is_sold_out: isSoldOut,
                        total_stock: totalStock,
                        variant_count: productVariants.length,
                        sizes: p.sizes || '',
                        sold: p.sold_count,
                        sold_count: p.sold_count,
                        ad_id: p.ad_id, // Ensure ad_id is available in the context
                        variations: productVariants
                    };
                });
                setProducts(normalized);
                setCache(PRODUCTS_CACHE_KEY, normalized);
            }
        } catch (err) {
            console.error('Unexpected error in fetchProducts:', err);
            setError(err?.message || 'Failed to load products');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // SWR: paint cached products instantly, then revalidate.
        const { data: cached } = getCache(PRODUCTS_CACHE_KEY, PRODUCTS_TTL_MS);
        if (cached?.length) {
            setProducts(cached);
            setLoading(false);
            fetchProducts(true);
        } else {
            fetchProducts(false);
        }
    }, [fetchProducts]);

    return (
        <ProductContext.Provider value={{ products, loading, error, refetch: fetchProducts }}>
            {children}
        </ProductContext.Provider>
    );
};
