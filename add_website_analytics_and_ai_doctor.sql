-- ============================================================
-- AI STORE MONITORING & SALES DOCTOR SCHEMA
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Create website_search_logs
CREATE TABLE IF NOT EXISTS website_search_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    search_query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_search_logs_query ON website_search_logs(search_query);
CREATE INDEX IF NOT EXISTS idx_website_search_logs_created_at ON website_search_logs(created_at);

-- 2. Create website_page_visits
CREATE TABLE IF NOT EXISTS website_page_visits (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    page_path TEXT NOT NULL,
    product_id BIGINT REFERENCES website_products(id) ON DELETE SET NULL,
    product_title TEXT,
    dwell_seconds INTEGER DEFAULT 0,
    referrer TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_page_visits_path ON website_page_visits(page_path);
CREATE INDEX IF NOT EXISTS idx_website_page_visits_product ON website_page_visits(product_id);
CREATE INDEX IF NOT EXISTS idx_website_page_visits_created_at ON website_page_visits(created_at);

-- 3. Create website_funnel_events
CREATE TABLE IF NOT EXISTS website_funnel_events (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    event_name TEXT NOT NULL CHECK (event_name IN ('view_product', 'add_to_cart', 'begin_checkout', 'checkout_step', 'abandon_checkout', 'order_completed')),
    product_id BIGINT REFERENCES website_products(id) ON DELETE SET NULL,
    product_title TEXT,
    step_name TEXT,
    drop_reason TEXT,
    cart_total NUMERIC(10,2) DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_funnel_events_name ON website_funnel_events(event_name);
CREATE INDEX IF NOT EXISTS idx_website_funnel_events_session ON website_funnel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_website_funnel_events_created_at ON website_funnel_events(created_at);

-- 4. Create website_ai_insights (Stores AI analysis audits)
CREATE TABLE IF NOT EXISTS website_ai_insights (
    id BIGSERIAL PRIMARY KEY,
    period_days INTEGER DEFAULT 7,
    summary_markdown TEXT NOT NULL,
    health_score INTEGER DEFAULT 80,
    top_bottlenecks JSONB DEFAULT '[]'::jsonb,
    action_items JSONB DEFAULT '[]'::jsonb,
    raw_metrics JSONB DEFAULT '{}'::jsonb,
    created_by TEXT DEFAULT 'AI Store Doctor',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_ai_insights_created_at ON website_ai_insights(created_at DESC);

-- 5. Ensure settings table exists and insert groq_api_key
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: Set your Groq API key via the desktop/mobile Admin Settings UI,
-- or run: INSERT INTO settings (key, value) VALUES ('groq_api_key', 'YOUR_GROQ_API_KEY')
-- ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- 6. Configure RLS Policies
ALTER TABLE website_search_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_page_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_funnel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow anonymous visitors (store customers) to log telemetry
CREATE POLICY "Allow public insert to search logs"
ON website_search_logs FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow staff to read search logs"
ON website_search_logs FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Allow public insert to page visits"
ON website_page_visits FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow staff to read page visits"
ON website_page_visits FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Allow public insert to funnel events"
ON website_funnel_events FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow staff to read funnel events"
ON website_funnel_events FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Allow read website_ai_insights"
ON website_ai_insights FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Allow insert website_ai_insights"
ON website_ai_insights FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow update website_ai_insights"
ON website_ai_insights FOR UPDATE TO anon, authenticated
USING (true);

CREATE POLICY "Allow read settings"
ON settings FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Allow update settings"
ON settings FOR ALL TO anon, authenticated
USING (true);
