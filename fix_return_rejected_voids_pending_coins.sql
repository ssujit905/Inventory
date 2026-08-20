-- =============================================================================
-- FIX: Pending 25 rating coins must disappear once a return request exists —
--      INCLUDING when the request is REJECTED (customer keeps the 15
--      rejection compensation instead of the pending rating reward).
-- =============================================================================
-- Replaces customer_session_profile so that:
--   * mature: blocked when a return request exists in ANY status
--     (pending / approved / completed / rejected)
--   * void:   pending rating coins are voided when a return request exists
--     in ANY status
-- =============================================================================

CREATE OR REPLACE FUNCTION customer_session_profile(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token);
        v_granted NUMERIC := 0;
BEGIN
  IF c.phone IS NULL THEN RETURN jsonb_build_object('success', false); END IF;

  -- (a) GRANT: return window closed (>2 days since delivery), no return request
  --     (any status), order not returned/cancelled -> coins become active.
  WITH mature AS (
    UPDATE website_product_ratings r
    SET reward_status = 'granted'
    FROM website_orders o
    WHERE r.order_id = o.id
      AND r.customer_phone = c.phone
      AND r.reward_status = 'pending'
      AND o.updated_at <= NOW() - INTERVAL '2 days'
      AND o.status NOT IN ('returned', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM website_order_returns wor
        WHERE wor.order_id = o.id
          AND wor.status IN ('pending', 'approved', 'completed', 'rejected')
      )
    RETURNING r.id
  )
  SELECT COUNT(*) * 25 INTO v_granted FROM mature;

  IF v_granted > 0 THEN
    UPDATE website_customers
    SET shopy_coins = COALESCE(shopy_coins, 0) + v_granted
    WHERE phone = c.phone;
  END IF;

  -- (b) VOID: any return request (ANY status, including rejected) or a
  --     returned/cancelled order -> pending coins are lost, never become active.
  UPDATE website_product_ratings r
  SET reward_status = 'voided'
  FROM website_orders o
  WHERE r.order_id = o.id
    AND r.customer_phone = c.phone
    AND r.reward_status = 'pending'
    AND (
      o.status IN ('returned', 'cancelled')
      OR EXISTS (
        SELECT 1 FROM website_order_returns wor
        WHERE wor.order_id = o.id
          AND wor.status IN ('pending', 'approved', 'completed', 'rejected')
      )
    );

  SELECT * INTO c FROM website_customers WHERE phone = c.phone;
  RETURN jsonb_build_object('success', true, 'customer', jsonb_build_object(
    'phone', c.phone,
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'shopy_coins', COALESCE(c.shopy_coins, 0),
    'pending_coins', (SELECT COALESCE(SUM(25), 0) FROM website_product_ratings WHERE customer_phone = c.phone AND reward_status = 'pending'),
    'created_at', c.created_at
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION customer_session_profile(TEXT) TO anon, authenticated;

-- Verification:
-- SELECT id, reward_status FROM website_product_ratings WHERE customer_phone = '<phone>' ORDER BY id DESC;