-- Add delivery_time column to website_delivery_branches
ALTER TABLE website_delivery_branches ADD COLUMN IF NOT EXISTS delivery_time TEXT DEFAULT '2-4 Days';
