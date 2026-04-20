-- ============================================================
-- THE SENTINEL UPDATE: AUTHORIZATION & UPLOAD SECURITY
-- ============================================================

-- 1️⃣ PURCHASE-VERIFIED RATINGS (STOPS FAKE REVIEWS)
CREATE OR REPLACE FUNCTION can_customer_rate_product(p_phone TEXT, p_product_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if the customer has a DELIVERED order that contains this product
    RETURN EXISTS (
        SELECT 1 
        FROM website_orders o
        JOIN website_order_items oi ON o.id = oi.order_id
        WHERE o.phone = p_phone 
        AND oi.product_id = p_product_id
        AND o.status = 'delivered'
    );
END;
$$ LANGUAGE plpgsql;

-- UPDATE THE RATING RPC TO ENFORCE THIS
CREATE OR REPLACE FUNCTION submit_product_rating(
    p_phone TEXT, p_pin TEXT, p_order_id BIGINT, p_product_id BIGINT, 
    p_rating INT, p_comment TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_name TEXT;
BEGIN
    -- [0] RATE LIMITING
    IF EXISTS (
        SELECT 1 FROM website_product_ratings 
        WHERE customer_phone = p_phone 
        AND created_at > NOW() - INTERVAL '30 seconds'
    ) THEN
        RAISE EXCEPTION 'RATING_TOO_FAST_WAIT_30S';
    END IF;

    -- [1] AUTHORIZATION CHECK (Must have actually bought it)
    IF NOT can_customer_rate_product(p_phone, p_product_id) THEN
        RAISE EXCEPTION 'YOU_CAN_ONLY_RATE_PRODUCTS_YOU_HAVE_RECEIVED';
    END IF;

    -- [2] Verify User and Get Name
    v_name := (SELECT name FROM website_customers WHERE phone = p_phone AND pin_hash = p_pin LIMIT 1);
    IF v_name IS NULL THEN RETURN FALSE; END IF;

    -- [3] Insert Rating
    INSERT INTO website_product_ratings (order_id, product_id, customer_phone, customer_name, rating, comment)
    VALUES (p_order_id, p_product_id, p_phone, v_name, p_rating, p_comment);

    -- [4] Grant Reward
    UPDATE website_customers SET shopy_coins = COALESCE(shopy_coins, 0) + 25 WHERE phone = p_phone;

    RETURN TRUE;
END;
$$;

-- 2️⃣ STORAGE GUARD (STOPS MALICIOUS UPLOADS)
-- This trigger runs on the 'storage.objects' table to verify file integrity
CREATE OR REPLACE FUNCTION storage_guard_on_upload()
RETURNS TRIGGER AS $$
DECLARE
    v_ext TEXT;
    v_size BIGINT;
BEGIN
    -- Get extension from the file name
    v_ext := LOWER(substring(NEW.name from '\.([^\.]+)$'));
    v_size := (NEW.metadata->>'size')::BIGINT;

    -- [A] Check for oversized files (Limit to 5MB)
    IF v_size > 5242880 THEN
        RAISE EXCEPTION 'FILE_TOO_LARGE_MAX_5MB';
    END IF;

    -- [B] Check for allowed extensions
    IF v_ext NOT IN ('jpg', 'jpeg', 'png', 'webp', 'gif') THEN
        RAISE EXCEPTION 'INVALID_FILE_TYPE_ONLY_IMAGES_ALLOWED';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_storage_upload_verify ON storage.objects;
CREATE TRIGGER on_storage_upload_verify
BEFORE INSERT ON storage.objects
FOR EACH ROW EXECUTE FUNCTION storage_guard_on_upload();

-- 3️⃣ LOGIN RATE LIMITING (STOPS PIN BRUTE-FORCING)
-- This was partially handled in Phase 3, but let's add a global check
CREATE OR REPLACE FUNCTION check_login_velocity(p_phone TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM website_customers 
        WHERE phone = p_phone 
        AND updated_at > NOW() - INTERVAL '2 seconds'
        AND login_attempts > 0
    ) THEN
        RAISE EXCEPTION 'LOGIN_TOO_FAST_WAIT_A_MOMENT';
    END IF;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
