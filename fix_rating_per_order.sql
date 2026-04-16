/* ================================================================
   RATING SYSTEM FIX: One rating per ORDER (not per product)
   Run this in your Supabase SQL Editor
   ================================================================ */

/* STEP 1: Add order_id column to website_product_ratings if not exists */
/* NOTE: Using BIGINT to match website_orders.id type */
ALTER TABLE website_product_ratings 
ADD COLUMN IF NOT EXISTS order_id BIGINT REFERENCES website_orders(id);

/* STEP 2: Drop the old unique constraint that blocked same product in different orders */
ALTER TABLE website_product_ratings 
DROP CONSTRAINT IF EXISTS unique_customer_product_rating;

/* STEP 3: Add new unique constraint — one rating per order (not per product) */
ALTER TABLE website_product_ratings 
ADD CONSTRAINT unique_customer_order_rating UNIQUE (customer_phone, order_id);
