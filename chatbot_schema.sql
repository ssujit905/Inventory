-- 1. Chatbot Products Table
CREATE TABLE IF NOT EXISTS public.chatbot_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) DEFAULT 0.00,
  sizes TEXT[] DEFAULT '{}',
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Chatbot FAQs Table
CREATE TABLE IF NOT EXISTS public.chatbot_faqs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Chatbot Notifications (Human Handoff)
CREATE TABLE IF NOT EXISTS public.chatbot_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT,
  psid TEXT,
  last_message TEXT,
  status TEXT CHECK (status IN ('unresolved', 'resolved')) DEFAULT 'unresolved',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Enable RLS
ALTER TABLE public.chatbot_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_notifications ENABLE ROW LEVEL SECURITY;

-- 5. Policies (Simple: Authenticated users can manage everything)
CREATE POLICY "Public read products" ON public.chatbot_products FOR SELECT USING (true);
CREATE POLICY "Manage products" ON public.chatbot_products FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public read faqs" ON public.chatbot_faqs FOR SELECT USING (true);
CREATE POLICY "Manage faqs" ON public.chatbot_faqs FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public read notifications" ON public.chatbot_notifications FOR SELECT USING (true);
CREATE POLICY "Manage notifications" ON public.chatbot_notifications FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow chatbot to insert notifications" ON public.chatbot_notifications FOR INSERT WITH CHECK (true);

-- 6. Chatbot Shortcuts Table
CREATE TABLE IF NOT EXISTS public.chatbot_shortcuts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  payload TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.chatbot_shortcuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read shortcuts" ON public.chatbot_shortcuts FOR SELECT USING (true);
CREATE POLICY "Manage shortcuts" ON public.chatbot_shortcuts FOR ALL USING (auth.role() = 'authenticated');
