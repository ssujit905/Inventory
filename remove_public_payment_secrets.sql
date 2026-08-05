-- Run after the payment-gateway Edge Function has been deployed and its secrets set.
-- These values were previously readable by the storefront through website_settings.
DELETE FROM website_settings
WHERE key IN ('esewa_secret_key', 'fonepay_secret_key');
