import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Simulation of payment-gateway HMAC algorithms
function computeEsewaSignature(totalAmount, transactionUuid, productCode, secret) {
  const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
  return crypto.createHmac('sha256', secret).update(message).digest('base64');
}

function computeFonepaySignature(merchantId, prn, amount, date, r1, r2, returnUrl, secret) {
  const message = `${merchantId},P,${prn},${amount},NPR,${date},${r1},${r2},${returnUrl}`;
  return crypto.createHmac('sha512', secret).update(message).digest('hex');
}

// Server pricing coin rule simulation (matching private_compute_order_pricing in Postgres)
function computeAllowedCoins(balance, subtotal, shippingFee) {
  const maxPercent = Math.floor((subtotal + shippingFee) * 0.20);
  const hardCap = 150;
  return Math.max(0, Math.min(balance || 0, maxPercent, hardCap));
}

test('eSewa payment HMAC signature verification & tamper detection', () => {
  const secret = 'test-secret-key-12345';
  const totalAmount = '1500.00';
  const txnUuid = 'SN-1234567890AB-1700000000';
  const productCode = 'EPAYTEST';

  const validSig = computeEsewaSignature(totalAmount, txnUuid, productCode, secret);
  assert.ok(validSig, 'Signature should be non-empty base64 string');

  // Client tampers with total_amount (e.g. changes 1500.00 to 10.00)
  const tamperedSig = computeEsewaSignature('10.00', txnUuid, productCode, secret);
  assert.notEqual(validSig, tamperedSig, 'Tampered amount must produce a completely different signature');

  // Client tampers with transaction UUID
  const tamperedUuidSig = computeEsewaSignature(totalAmount, 'SN-HACKED-UUID', productCode, secret);
  assert.notEqual(validSig, tamperedUuidSig, 'Tampered txn UUID must fail signature check');
});

test('Fonepay payment HMAC SHA-512 signature & tamper detection', () => {
  const secret = 'fonepay-secret-key';
  const merchantId = 'FONEPAY_TEST';
  const prn = 'SN-998877';
  const amount = '2450.00';
  const date = '10/06/2026';
  const r1 = 'Order SN-998877';
  const r2 = 'Shipping Rs. 100.00';
  const ru = 'https://shopinepal.com/payment-success';

  const validSig = computeFonepaySignature(merchantId, prn, amount, date, r1, r2, ru, secret);
  assert.ok(validSig, 'Signature should be non-empty hex string');

  // Tamper amount
  const tamperedSig = computeFonepaySignature(merchantId, prn, '1.00', date, r1, r2, ru, secret);
  assert.notEqual(validSig, tamperedSig, 'Tampered Fonepay amount must produce invalid signature');
});

test('Shopy Coin clamping strictly enforces 20% cap and 150 hard ceiling', () => {
  // Case 1: High balance (500), small cart (subtotal 200 + ship 50 = 250). 20% is 50.
  const coins1 = computeAllowedCoins(500, 200, 50);
  assert.equal(coins1, 50, 'Must clamp to 20% of order total (50), not user balance');

  // Case 2: High balance (500), large cart (subtotal 2000 + ship 100 = 2100). 20% is 420, but hard cap is 150.
  const coins2 = computeAllowedCoins(500, 2000, 100);
  assert.equal(coins2, 150, 'Must clamp to hard cap of 150 coins');

  // Case 3: Low balance (20), large cart.
  const coins3 = computeAllowedCoins(20, 2000, 100);
  assert.equal(coins3, 20, 'Must clamp to actual balance if lower than caps');

  // Case 4: Negative balance attempt
  const coins4 = computeAllowedCoins(-50, 1000, 100);
  assert.equal(coins4, 0, 'Negative balance must evaluate to 0');
});
