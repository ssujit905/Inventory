/* 1. FIRST: REMOVE THE DUPLICATES THAT ALREADY EXIST */
DELETE FROM website_product_ratings a USING (
      SELECT MIN(ctid) as keep_id, customer_phone, product_id
      FROM website_product_ratings
      GROUP BY customer_phone, product_id
      HAVING COUNT(*) > 1
    ) b
    WHERE a.customer_phone = b.customer_phone 
    AND a.product_id = b.product_id 
    AND a.ctid <> b.keep_id;

/* 2. SECOND: NOW THAT DATA IS CLEAN, ADD THE UNIQUE PROTECTION */
ALTER TABLE website_product_ratings 
ADD CONSTRAINT unique_customer_product_rating UNIQUE (customer_phone, product_id);
