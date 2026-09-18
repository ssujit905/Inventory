-- ==========================================================
-- Smart Agent Upgrade: Supabase-backed brain for Inventory/chatbot
-- Ports Pasale Helper (projects/new) schema to Supabase,
-- extending existing chatbot_* tables instead of replacing them
-- so desktop/mobile ChatbotPage keeps working.
-- Run in Supabase SQL Editor.
-- ==========================================================

-- 1. PRODUCTS: add smart-agent columns (aliases, colors, stock, warranty, bundles, specs)
ALTER TABLE public.chatbot_products
  ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS colors TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stock_status TEXT DEFAULT 'In Stock',
  ADD COLUMN IF NOT EXISTS warranty TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bundle_deals JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS specs JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS meta_ad_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS shop_id TEXT DEFAULT 'shop_ktm_gadget';

CREATE INDEX IF NOT EXISTS idx_chatbot_products_shop ON public.chatbot_products(shop_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_products_aliases ON public.chatbot_products USING GIN (aliases);

-- Backfill: derive simple aliases from product name so fuzzy/exact match works on old rows
UPDATE public.chatbot_products
SET aliases = COALESCE(aliases, '{}')
  || ARRAY(SELECT lower(regexp_split_to_table(name, '\s+')))
WHERE aliases IS NULL OR aliases = '{}';

-- 2. FAQS: add normalized cache columns (Rs 0 auto-FAQ cache)
ALTER TABLE public.chatbot_faqs
  ADD COLUMN IF NOT EXISTS normalized_question TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_ai_cached BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS shop_id TEXT DEFAULT 'shop_ktm_gadget';

CREATE INDEX IF NOT EXISTS idx_chatbot_faqs_shop_norm ON public.chatbot_faqs(shop_id, normalized_question);

-- Backfill normalized_question for existing FAQs (lowercase, strip punctuation)
UPDATE public.chatbot_faqs
SET normalized_question = lower(regexp_replace(question, '[^\w\s\u0900-\u097F]', '', 'g'))
WHERE normalized_question IS NULL OR normalized_question = '';

-- 3. ORDERS: new table capturing validated COD orders from order state machine
CREATE TABLE IF NOT EXISTS public.chatbot_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id TEXT DEFAULT 'shop_ktm_gadget',
  psid TEXT,
  customer_name TEXT DEFAULT 'Messenger User',
  customer_phone TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  product_id UUID REFERENCES public.chatbot_products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  selected_color TEXT,
  selected_size TEXT,
  quantity INTEGER DEFAULT 1,
  total_price DECIMAL(10, 2) DEFAULT 0.00,
  payment_method TEXT DEFAULT 'Cash on Delivery',
  status TEXT CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chatbot_orders_shop ON public.chatbot_orders(shop_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_orders_status ON public.chatbot_orders(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_chatbot_orders_created ON public.chatbot_orders(created_at DESC);

-- 4. NOTIFICATIONS (escalations): add smart-agent handoff columns
ALTER TABLE public.chatbot_notifications
  ADD COLUMN IF NOT EXISTS shop_id TEXT DEFAULT 'shop_ktm_gadget',
  ADD COLUMN IF NOT EXISTS customer_message TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bot_draft_reply TEXT DEFAULT '';

-- Backfill customer_message from legacy last_message
UPDATE public.chatbot_notifications
SET customer_message = last_message
WHERE (customer_message IS NULL OR customer_message = '') AND last_message IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_notifications_status ON public.chatbot_notifications(shop_id, status);

-- 5. LLM FALLBACK: reuse the shared AI Store Doctor settings (ai_api_key /
-- ai_base_url / ai_model) by default. Only set chatbot-specific llm_* keys
-- below if the bot should use a DIFFERENT provider/model than Store Doctor.
-- (No default inserts: absent llm_* keys fall through to ai_* automatically.)
-- Example override:
-- INSERT INTO public.settings (key, value) VALUES ('llm_model', 'sensenova/sensenova-6.8-flash-lite')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 6. RLS (mirror existing chatbot_* policies: public read, authenticated manage, anon insert where bot needs it)
ALTER TABLE public.chatbot_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read orders" ON public.chatbot_orders;
CREATE POLICY "Public read orders" ON public.chatbot_orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Manage orders" ON public.chatbot_orders;
CREATE POLICY "Manage orders" ON public.chatbot_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow chatbot to insert orders" ON public.chatbot_orders;
CREATE POLICY "Allow chatbot to insert orders" ON public.chatbot_orders FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow chatbot to update order status" ON public.chatbot_orders;
CREATE POLICY "Allow chatbot to update order status" ON public.chatbot_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- FAQs: bot (anon) must be able to auto-cache LLM answers + bump hit_count
DROP POLICY IF EXISTS "Allow chatbot to insert faqs" ON public.chatbot_faqs;
CREATE POLICY "Allow chatbot to insert faqs" ON public.chatbot_faqs FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow chatbot to update faq hits" ON public.chatbot_faqs;
CREATE POLICY "Allow chatbot to update faq hits" ON public.chatbot_faqs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Notifications: anon insert already exists from chatbot_schema.sql; ensure update for resolve flow
DROP POLICY IF EXISTS "Allow chatbot to update notifications" ON public.chatbot_notifications;
CREATE POLICY "Allow chatbot to update notifications" ON public.chatbot_notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Products: allow anon read (already public), no anon write (dashboard-only)
-- Shortcuts + settings policies unchanged.
