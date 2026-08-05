-- =============================================================================
-- VENDOR SUPPORT MIGRATION
-- =============================================================================

-- 1. PROFILES TABLE UPDATES
-- We need to safely drop the existing check constraint on the role column.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%role%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Now add the new constraint that includes 'vendor'
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'staff', 'vendor'));

-- Add store_name column if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_name TEXT;

-- 2. PRODUCTS TABLE UPDATES (Inventory App)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Update RLS for public.products
-- Drop existing overly permissive policies if they exist
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.products;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.products;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.products;

-- Create secure policies
-- Admins and Staff can manage all, Vendors can only manage their own
CREATE POLICY "Admins and Staff can insert all products" ON public.products FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

CREATE POLICY "Vendors can insert their own products" ON public.products FOR INSERT 
WITH CHECK (
    vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
);

CREATE POLICY "Admins and Staff can update all products" ON public.products FOR UPDATE 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

CREATE POLICY "Vendors can update their own products" ON public.products FOR UPDATE 
USING (
    vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
);

CREATE POLICY "Admins and Staff can delete all products" ON public.products FOR DELETE 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

CREATE POLICY "Vendors can delete their own products" ON public.products FOR DELETE 
USING (
    vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
);


-- 3. PRODUCT LOTS & TRANSACTIONS (Inventory App)
-- Same pattern: restrict to admin/staff, or vendors if they own the product.
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.product_lots;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.product_lots;

CREATE POLICY "Admin Staff insert lots" ON public.product_lots FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

CREATE POLICY "Vendors insert own lots" ON public.product_lots FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.vendor_id = auth.uid())
);

CREATE POLICY "Admin Staff update lots" ON public.product_lots FOR UPDATE 
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

CREATE POLICY "Vendors update own lots" ON public.product_lots FOR UPDATE 
USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.vendor_id = auth.uid())
);

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.transactions;

CREATE POLICY "Admin Staff insert transactions" ON public.transactions FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

CREATE POLICY "Vendors insert own transactions" ON public.transactions FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.vendor_id = auth.uid())
);


-- 4. WEBSITE PRODUCTS TABLE UPDATES
ALTER TABLE public.website_products ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Enable RLS on website_products if not already
ALTER TABLE public.website_products ENABLE ROW LEVEL SECURITY;

-- Re-create read policy just in case (public can read all active)
DROP POLICY IF EXISTS "Public can read active website products" ON public.website_products;
CREATE POLICY "Public can read active website products" ON public.website_products FOR SELECT USING (is_active = true);

-- Vendors can read their own products even if inactive
CREATE POLICY "Vendors can read own website products" ON public.website_products FOR SELECT USING (vendor_id = auth.uid());

-- Admin/Staff can read all
CREATE POLICY "Admin Staff read all website products" ON public.website_products FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);

-- Inserts and Updates
CREATE POLICY "Admin Staff insert website products" ON public.website_products FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Vendors insert own website products" ON public.website_products FOR INSERT WITH CHECK (
    vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
);

CREATE POLICY "Admin Staff update website products" ON public.website_products FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Vendors update own website products" ON public.website_products FOR UPDATE USING (
    vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
);


-- 5. WEBSITE ORDER ITEMS TABLE UPDATES
ALTER TABLE public.website_order_items ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Enable RLS on website_orders and website_order_items
ALTER TABLE public.website_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_order_items ENABLE ROW LEVEL SECURITY;

-- Website Orders RLS
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.website_orders;
CREATE POLICY "Anyone can insert orders" ON public.website_orders FOR INSERT WITH CHECK (true);

-- Staff/Admin can read all orders
CREATE POLICY "Admin Staff read all orders" ON public.website_orders FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
-- Vendors can read orders that contain their items
CREATE POLICY "Vendors read orders with their items" ON public.website_orders FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.website_order_items woi 
        WHERE woi.order_id = id AND woi.vendor_id = auth.uid()
    )
);

-- Admin/Staff update orders
CREATE POLICY "Admin Staff update orders" ON public.website_orders FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
-- Vendors can update orders (e.g. status) if they contain their items. 
-- Note: In a mixed order this allows Vendor A to mark the whole order as shipped. For a simple system this is okay.
CREATE POLICY "Vendors update orders with their items" ON public.website_orders FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.website_order_items woi 
        WHERE woi.order_id = id AND woi.vendor_id = auth.uid()
    )
);

-- Website Order Items RLS
DROP POLICY IF EXISTS "Anyone can insert order items" ON public.website_order_items;
CREATE POLICY "Anyone can insert order items" ON public.website_order_items FOR INSERT WITH CHECK (true);

-- Read policy for Order Items
CREATE POLICY "Admin Staff read all order items" ON public.website_order_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Vendors read own order items" ON public.website_order_items FOR SELECT USING (
    vendor_id = auth.uid()
);

-- Update policy for Order Items
CREATE POLICY "Admin Staff update order items" ON public.website_order_items FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
);
CREATE POLICY "Vendors update own order items" ON public.website_order_items FOR UPDATE USING (
    vendor_id = auth.uid()
);

