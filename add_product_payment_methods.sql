-- Per-product checkout payment availability.
-- Existing products retain access to every payment method.
ALTER TABLE website_products
    ADD COLUMN IF NOT EXISTS allow_cod BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_esewa BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS allow_fonepay BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE website_products
    DROP CONSTRAINT IF EXISTS website_products_at_least_one_payment_method;

ALTER TABLE website_products
    ADD CONSTRAINT website_products_at_least_one_payment_method
    CHECK (allow_cod OR allow_esewa OR allow_fonepay);
