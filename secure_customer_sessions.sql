-- Customer PIN hardening and token-based sessions.
-- Run once in Supabase SQL Editor before deploying the updated website.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS customer_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone TEXT NOT NULL REFERENCES website_customers(phone) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE customer_sessions ENABLE ROW LEVEL SECURITY;

-- Convert legacy plaintext four-digit PINs only once. Never expose this column afterwards.
UPDATE website_customers
SET pin_hash = crypt(pin_hash, gen_salt('bf', 12))
WHERE pin_hash IS NOT NULL AND pin_hash !~ '^\\$2[aby]\\$';

CREATE OR REPLACE FUNCTION private_customer_from_session(p_token TEXT)
RETURNS website_customers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_customer website_customers;
BEGIN
  SELECT c.* INTO v_customer
  FROM customer_sessions s JOIN website_customers c ON c.phone = s.customer_phone
  WHERE s.token_hash = encode(digest(p_token, 'sha256'), 'hex') AND s.expires_at > now();
  RETURN v_customer;
END;
$$;

CREATE OR REPLACE FUNCTION private_create_customer_session(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_token TEXT := encode(gen_random_bytes(32), 'hex');
BEGIN
  DELETE FROM customer_sessions WHERE customer_phone = p_phone OR expires_at <= now();
  INSERT INTO customer_sessions(customer_phone, token_hash, expires_at)
  VALUES (p_phone, encode(digest(v_token, 'sha256'), 'hex'), now() + interval '7 days');
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION customer_login(p_phone TEXT, p_pin TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers; v_token TEXT;
BEGIN
  SELECT * INTO c FROM website_customers WHERE phone = right(regexp_replace(p_phone, '\\D', '', 'g'), 10) LIMIT 1;
  IF c.phone IS NULL OR c.pin_hash <> crypt(p_pin, c.pin_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid phone number or PIN');
  END IF;
  v_token := private_create_customer_session(c.phone);
  RETURN jsonb_build_object('success', true, 'session_token', v_token,
    'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

CREATE OR REPLACE FUNCTION customer_register(p_name TEXT, p_phone TEXT, p_pin TEXT, p_address TEXT, p_city TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_phone TEXT := right(regexp_replace(p_phone, '\\D', '', 'g'), 10); c website_customers; v_token TEXT;
BEGIN
  IF p_pin !~ '^[0-9]{4}$' THEN RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 digits'); END IF;
  IF EXISTS (SELECT 1 FROM website_customers WHERE phone = v_phone) THEN RETURN jsonb_build_object('success', false, 'error', 'This phone number is already registered. Please login instead.'); END IF;
  INSERT INTO website_customers(name, phone, pin_hash, address, city) VALUES (p_name, v_phone, crypt(p_pin, gen_salt('bf', 12)), p_address, p_city) RETURNING * INTO c;
  v_token := private_create_customer_session(c.phone);
  RETURN jsonb_build_object('success', true, 'session_token', v_token, 'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

CREATE OR REPLACE FUNCTION customer_setup_pin(p_phone TEXT, p_pin TEXT, p_name TEXT DEFAULT NULL, p_address TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_phone TEXT := right(regexp_replace(p_phone, '\\D', '', 'g'), 10); c website_customers; v_token TEXT;
BEGIN
  IF p_pin !~ '^[0-9]{4}$' THEN RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 digits'); END IF;
  SELECT * INTO c FROM website_customers WHERE phone = v_phone LIMIT 1;
  IF c.phone IS NULL THEN
    INSERT INTO website_customers(name, phone, pin_hash, address, city) VALUES (COALESCE(NULLIF(p_name, ''), 'Customer'), v_phone, crypt(p_pin, gen_salt('bf', 12)), p_address, p_city) RETURNING * INTO c;
  ELSE
    UPDATE website_customers SET pin_hash=crypt(p_pin, gen_salt('bf', 12)), name=COALESCE(NULLIF(p_name, ''), name), address=COALESCE(NULLIF(p_address, ''), address), city=COALESCE(NULLIF(p_city, ''), city) WHERE phone=v_phone RETURNING * INTO c;
  END IF;
  v_token := private_create_customer_session(c.phone);
  RETURN jsonb_build_object('success', true, 'session_token', v_token, 'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

CREATE OR REPLACE FUNCTION customer_session_profile(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL THEN RETURN jsonb_build_object('success', false); END IF;
  RETURN jsonb_build_object('success', true, 'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

CREATE OR REPLACE FUNCTION customer_update_profile(p_token TEXT, p_name TEXT, p_address TEXT, p_city TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL THEN RETURN false; END IF;
  UPDATE website_customers SET name=p_name, address=p_address, city=p_city WHERE phone=c.phone;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION customer_change_pin(p_token TEXT, p_current_pin TEXT, p_new_pin TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL OR p_new_pin !~ '^[0-9]{4}$' OR c.pin_hash <> crypt(p_current_pin, c.pin_hash) THEN RETURN false; END IF;
  UPDATE website_customers SET pin_hash=crypt(p_new_pin, gen_salt('bf', 12)) WHERE phone=c.phone;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION customer_orders(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token); v_orders JSONB;
BEGIN
  IF c.phone IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Session expired'); END IF;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_orders FROM (
    SELECT o.*, (SELECT COALESCE(jsonb_agg(i), '[]'::jsonb) FROM website_order_items i WHERE i.order_id=o.id) AS items
    FROM website_orders o WHERE o.phone=c.phone ORDER BY o.created_at DESC
  ) x;
  RETURN jsonb_build_object('success', true, 'orders', v_orders);
END;
$$;

CREATE OR REPLACE FUNCTION customer_returns(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token); v_returns JSONB;
BEGIN
  IF c.phone IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Session expired'); END IF;
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_returns FROM website_order_returns r WHERE r.customer_phone=c.phone;
  RETURN jsonb_build_object('success', true, 'returns', v_returns);
END;
$$;

CREATE OR REPLACE FUNCTION customer_submit_rating(p_token TEXT, p_order_id BIGINT, p_product_id BIGINT, p_rating INT, p_comment TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM website_orders o JOIN website_order_items i ON i.order_id=o.id WHERE o.id=p_order_id AND o.phone=c.phone AND i.product_id=p_product_id AND o.status='delivered') THEN RETURN false; END IF;
  INSERT INTO website_product_ratings(order_id, product_id, customer_phone, customer_name, rating, comment) VALUES (p_order_id, p_product_id, c.phone, c.name, p_rating, p_comment);
  UPDATE website_customers SET shopy_coins=COALESCE(shopy_coins,0)+25 WHERE phone=c.phone;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION admin_reset_customer_pin(p_phone TEXT, p_new_pin TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_updated BOOLEAN;
BEGIN
  IF NOT is_admin_or_staff() THEN
    RAISE EXCEPTION 'ADMIN_PIN_RESET_DENIED: the signed-in account needs an admin or staff profile';
  END IF;
  IF p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'ADMIN_PIN_RESET_DENIED: PIN must be exactly four digits';
  END IF;
  UPDATE website_customers SET pin_hash=crypt(p_new_pin, gen_salt('bf', 12)) WHERE phone=p_phone;
  v_updated := FOUND;
  IF NOT v_updated THEN
    RAISE EXCEPTION 'ADMIN_PIN_RESET_DENIED: customer not found';
  END IF;
  DELETE FROM customer_sessions WHERE customer_phone=p_phone;
  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION customer_login(TEXT,TEXT), customer_register(TEXT,TEXT,TEXT,TEXT,TEXT), customer_setup_pin(TEXT,TEXT,TEXT,TEXT,TEXT), customer_session_profile(TEXT), customer_update_profile(TEXT,TEXT,TEXT,TEXT), customer_change_pin(TEXT,TEXT,TEXT), customer_orders(TEXT), customer_returns(TEXT), customer_submit_rating(TEXT,BIGINT,BIGINT,INT,TEXT), admin_reset_customer_pin(TEXT,TEXT) TO anon, authenticated;
