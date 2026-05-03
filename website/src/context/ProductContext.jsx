import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('website_products')
                .select(`
                    *,
                    website_product_images(*)
                `)
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase error fetching products:', error);
                return;
            }

            if (data) {
                // Fetch stock info for all products in one go to be efficient
                const { data: stockData } = await supabase
                    .from('website_variant_stock_view')
                    .select('*');

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
                        is_sold_out: isSoldOut,
                        total_stock: totalStock,
                        variant_count: productVariants.length,
                        sizes: p.sizes || '',
                        sold: p.sold_count,
                        sold_count: p.sold_count,
                        variations: productVariants
                    };
                });
                setProducts(normalized);
            }
        } catch (err) {
            console.error('Unexpected error in fetchProducts:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ProductContext.Provider value={{ products, loading, refetch: fetchProducts }}>
            {children}
        </ProductContext.Provider>
    );
};
