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
                    website_product_images(*),
                    website_product_variations(*)
                `)
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Supabase error fetching products:', error);
                return;
            }

            if (data) {
                // Normalize to the shape the website expects
                const normalized = data.map(p => {
                    const primaryImg = p.website_product_images?.find(i => i.is_primary) || p.website_product_images?.[0];
                    const images = (p.website_product_images || [])
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map(img => ({
                            url: img.image_url,
                            label: img.label || ''
                        }));

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
                        is_sold_out: p.is_sold_out,
                        sizes: p.sizes || '',
                        sold: p.sold_count,
                        sold_count: p.sold_count,
                        variations: p.website_product_variations || [],
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
