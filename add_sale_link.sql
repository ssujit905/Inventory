-- Add link between website orders and physical sales history
ALTER TABLE website_orders ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES sales(id);
