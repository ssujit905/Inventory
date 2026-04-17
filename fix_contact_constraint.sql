-- Run this in your Supabase SQL Editor to allow general messages
ALTER TABLE website_order_returns ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE website_order_returns ALTER COLUMN order_number DROP NOT NULL;

-- Update the type constraint to allow 'message'
ALTER TABLE website_order_returns DROP CONSTRAINT IF EXISTS website_order_returns_type_check;
ALTER TABLE website_order_returns ADD CONSTRAINT website_order_returns_type_check CHECK (type IN ('return', 'exchange', 'message'));
