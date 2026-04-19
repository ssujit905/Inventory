-- Fix Product/Variant Deletion Constraints
-- We want to allow deleting website products/variants even if they have been ordered.
-- The order items will keep their text-based details (Title, SKU, Price) while the ID reference becomes NULL.

-- 1. Modify website_order_items to allow variant deletion
ALTER TABLE website_order_items 
DROP CONSTRAINT IF EXISTS website_order_items_variant_id_fkey;

ALTER TABLE website_order_items
ADD CONSTRAINT website_order_items_variant_id_fkey 
FOREIGN KEY (variant_id) 
REFERENCES website_variants(id) 
ON DELETE SET NULL;

-- 2. Modify website_order_items to allow product deletion (optional but good for consistency)
ALTER TABLE website_order_items 
DROP CONSTRAINT IF EXISTS website_order_items_product_id_fkey;

ALTER TABLE website_order_items
ADD CONSTRAINT website_order_items_product_id_fkey 
FOREIGN KEY (product_id) 
REFERENCES website_products(id) 
ON DELETE SET NULL;

-- 3. Modify website_variants to allow product deletion
ALTER TABLE website_variants 
DROP CONSTRAINT IF EXISTS website_variants_product_id_fkey;

ALTER TABLE website_variants
ADD CONSTRAINT website_variants_product_id_fkey 
FOREIGN KEY (product_id) 
REFERENCES website_products(id) 
ON DELETE CASCADE;

-- 4. Modify website_product_images to allow product deletion
ALTER TABLE website_product_images 
DROP CONSTRAINT IF EXISTS website_product_images_product_id_fkey;

ALTER TABLE website_product_images
ADD CONSTRAINT website_product_images_product_id_fkey 
FOREIGN KEY (product_id) 
REFERENCES website_products(id) 
ON DELETE CASCADE;
