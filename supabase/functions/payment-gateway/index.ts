import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const encoder = new TextEncoder()
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  })
}

async function hmac(message: string, secret: string, algorithm: 'SHA-256' | 'SHA-512', output: 'base64' | 'hex') {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: algorithm }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
  if (output === 'base64') return btoa(String.fromCharCode(...signature))
  return Array.from(signature).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function requiredSecret(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Payment gateway is not configured: missing ${name}`)
  return value
}

function gatewaySecret(gateway: 'ESEWA' | 'FONEPAY', environment: string) {
  const mode = environment.toUpperCase() === 'LIVE' ? 'LIVE' : 'TEST'
  // The final fallback keeps a single-secret setup working during migration.
  return Deno.env.get(`${gateway}_${mode}_SECRET_KEY`) || requiredSecret(`${gateway}_SECRET_KEY`)
}

function supaAdmin() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) throw new Error('Payment gateway is not configured: missing service credentials')
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } })
}

async function getGatewaySetting(key: string, envKey: string, fallback = '') {
  const url = Deno.env.get('SUPABASE_URL')
  // The function, not the browser, reads gateway configuration.  Use the
  // service-role key so RLS can deny public reads of sensitive settings.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (url && serviceRoleKey) {
    const client = supaAdmin()
    const { data, error } = await client.from('website_settings').select('value').eq('key', key).maybeSingle()
    if (error) throw error
    if (data?.value) return data.value
  }
  return Deno.env.get(envKey) || fallback
}

// ── Payment intents ──────────────────────────────────────────────────────
// The browser holds only an intent_token. Amounts are read from the stored
// intent (server-priced at creation), never from the request body.

async function loadIntentByToken(supa: ReturnType<typeof supaAdmin>, token: string) {
  const { data, error } = await supa
    .from('website_payment_intents')
    .select('*')
    .eq('token_hash', await sha256Hex(String(token)))
    .maybeSingle()
  if (error) throw error
  return data
}

async function loadIntentByRef(supa: ReturnType<typeof supaAdmin>, gateway: string, ref: string) {
  const { data, error } = await supa
    .from('website_payment_intents')
    .select('*')
    .eq('gateway', gateway)
    .eq('gateway_ref', String(ref))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

function intentUsable(intent: Record<string, unknown> | null): intent is Record<string, unknown> {
  return !!intent && intent.status === 'pending' && new Date(String(intent.expires_at)).getTime() > Date.now()
}

async function markIntent(supa: ReturnType<typeof supaAdmin>, id: string, patch: Record<string, unknown>) {
  const { error } = await supa.from('website_payment_intents').update(patch).eq('id', id)
  if (error) throw error
}

const n2 = (n: unknown) => Number(n).toFixed(2)

// Creates the order (service role, from the stored snapshot) and marks it
// paid. Verifies the freshly priced total still matches what was charged.
async function completeIntentOrder(
  supa: ReturnType<typeof supaAdmin>,
  intent: Record<string, unknown>,
  paymentMethod: string,
  paymentNote: string,
) {
  const items = (intent.items as Array<{ variant_id: string; quantity: number }>).map(i => ({
    variant_id: i.variant_id,
    quantity: i.quantity,
  }))

  const { data: created, error: createError } = await supa.rpc('create_atomic_website_order', {
    p_customer_name: intent.customer_name,
    p_phone: intent.phone,
    p_phone2: intent.phone2,
    p_address: intent.address,
    p_city: intent.city,
    p_payment_method: paymentMethod,
    // Ignored for money math (server reprices), passed for compatibility.
    p_shipping_fee: intent.shipping_fee,
    p_total_amount: intent.expected_total,
    p_items: items,
    p_coins_used: intent.coins_used,
    p_ad_id: intent.ad_id,
  })
  if (createError || !created?.order_number) {
    await markIntent(supa, String(intent.id), { status: 'failed' })
    throw new Error(`Order creation failed: ${createError?.message || 'no order number returned'}`)
  }

  // Catalog prices may have shifted between intent and callback (e.g. a
  // flash sale ended mid-payment). Never leave a mismatched paid order:
  // cancel it so stock/coins roll back and ask for a fresh checkout.
  if (n2(created.total_amount) !== n2(intent.expected_total)) {
    await supa.rpc('handle_website_order_cancellation', {
      p_order_id: created.order_id,
      p_reason: 'Auto-cancelled: catalog price changed during payment',
    })
    await markIntent(supa, String(intent.id), { status: 'failed' })
    throw new Error('The price changed while you were paying. Please checkout again.')
  }

  const { error: confirmError } = await supa.rpc('confirm_website_payment', {
    p_order_number: created.order_number,
    p_payment_details: paymentNote,
    p_status: 'paid',
  })
  if (confirmError) throw new Error(`Payment confirmation failed: ${confirmError.message}`)

  await markIntent(supa, String(intent.id), {
    status: 'paid',
    order_id: created.order_id,
    order_number: created.order_number,
    paid_at: new Date().toISOString(),
  })

  return {
    success: true,
    order_number: created.order_number,
    total_amount: Number(intent.expected_total),
    customer_name: intent.customer_name,
    phone: intent.phone,
    address: intent.address,
    city: intent.city,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405)

  try {
    const { action, ...payload } = await req.json()

    if (action === 'create-esewa-payment') {
      const productCode = await getGatewaySetting('esewa_merchant_code', 'ESEWA_MERCHANT_CODE')
      const environment = await getGatewaySetting('esewa_environment', 'ESEWA_ENVIRONMENT', 'test')
      const secret = gatewaySecret('ESEWA', environment)
      if (!productCode) throw new Error('Payment gateway is not configured: missing eSewa merchant code')

      // Preferred path: sign the stored intent totals, not browser amounts.
      if (payload.intentToken) {
        const supa = supaAdmin()
        const intent = await loadIntentByToken(supa, payload.intentToken)
        if (!intentUsable(intent) || intent.gateway !== 'esewa') {
          return response({ error: 'Payment session expired. Please checkout again.' }, 400)
        }
        const totalAmount = n2(intent.expected_total)
        const deliveryCharge = n2(intent.shipping_fee)
        const amount = n2(Number(intent.expected_total) - Number(intent.shipping_fee))
        const transactionUuid =
          intent.gateway_ref ||
          `SN-${String(intent.id).replace(/-/g, '').slice(0, 12).toUpperCase()}-${Date.now()}`
        await markIntent(supa, String(intent.id), { gateway_ref: transactionUuid })
        const signature = await hmac(`total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`, secret, 'SHA-256', 'base64')
        return response({
          gatewayUrl: environment === 'live' ? 'https://epay.esewa.com.np/api/epay/main/v2/form' : 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
          fields: {
            amount,
            tax_amount: '0',
            total_amount: totalAmount,
            transaction_uuid: transactionUuid,
            product_code: productCode,
            product_service_charge: '0',
            product_delivery_charge: deliveryCharge,
            success_url: String(payload.successUrl),
            failure_url: String(payload.failureUrl),
            signed_field_names: 'total_amount,transaction_uuid,product_code',
            signature,
          },
        })
      }

      // Legacy fallback (pre-intent website builds still in the wild).
      // Signs caller amounts; the completion step still enforces a match.
      const totalAmount = Number(payload.totalAmount).toFixed(2)
      const amount = Number(payload.amount).toFixed(2)
      const deliveryCharge = Number(payload.deliveryCharge).toFixed(2)
      const transactionUuid = String(payload.transactionUuid)

      if (!transactionUuid || !Number.isFinite(Number(totalAmount))) return response({ error: 'Invalid payment request' }, 400)

      const signature = await hmac(`total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`, secret, 'SHA-256', 'base64')
      return response({
        gatewayUrl: environment === 'live' ? 'https://epay.esewa.com.np/api/epay/main/v2/form' : 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
        fields: {
          amount,
          tax_amount: '0',
          total_amount: totalAmount,
          transaction_uuid: transactionUuid,
          product_code: productCode,
          product_service_charge: '0',
          product_delivery_charge: deliveryCharge,
          success_url: String(payload.successUrl),
          failure_url: String(payload.failureUrl),
          signed_field_names: 'total_amount,transaction_uuid,product_code',
          signature,
        },
      })
    }

    if (action === 'verify-esewa-response') {
      const environment = await getGatewaySetting('esewa_environment', 'ESEWA_ENVIRONMENT', 'test')
      const secret = gatewaySecret('ESEWA', environment)
      const details = payload.paymentDetails || {}
      const names = String(details.signed_field_names || '').split(',').filter(Boolean)
      if (!names.length || !details.signature) return response({ valid: false })
      const message = names.map((field: string) => `${field}=${details[field]}`).join(',')
      const signature = await hmac(message, secret, 'SHA-256', 'base64')
      return response({ valid: signature === details.signature })
    }

    // Verifies the callback, binds it to the intent, creates the order from
    // the stored snapshot and marks it paid — all server-side. The browser
    // can no longer mint paid orders.
    if (action === 'complete-esewa-order') {
      const details = payload.paymentDetails || {}
      if (details.status !== 'COMPLETE') return response({ error: `Payment was not completed. Status: ${details.status}` }, 400)

      const environment = await getGatewaySetting('esewa_environment', 'ESEWA_ENVIRONMENT', 'test')
      const secret = gatewaySecret('ESEWA', environment)
      const names = String(details.signed_field_names || '').split(',').filter(Boolean)
      if (!names.length || !details.signature) return response({ error: 'Security check failed. The payment signature is invalid.' }, 400)
      const message = names.map((field: string) => `${field}=${details[field]}`).join(',')
      if ((await hmac(message, secret, 'SHA-256', 'base64')) !== details.signature) {
        return response({ error: 'Security check failed. The payment signature is invalid.' }, 400)
      }

      const supa = supaAdmin()
      const intent = await loadIntentByToken(supa, payload.intentToken)
      if (!intentUsable(intent) || intent.gateway !== 'esewa') {
        return response({ error: 'Payment session expired. Please checkout again.' }, 400)
      }
      if (details.transaction_uuid !== intent.gateway_ref) {
        await markIntent(supa, String(intent.id), { status: 'failed' })
        return response({ error: 'Payment reference mismatch. Please checkout again.' }, 400)
      }
      if (n2(details.total_amount) !== n2(intent.expected_total)) {
        await markIntent(supa, String(intent.id), { status: 'failed' })
        return response({ error: 'Paid amount does not match the order total.' }, 400)
      }

      const summary = await completeIntentOrder(
        supa,
        intent,
        'eSewa',
        `eSewa Payment Complete.\nTxn Code: ${details.transaction_code}\nTotal Paid: Rs. ${n2(intent.expected_total)}`,
      )
      return response({ ...summary, txn_code: details.transaction_code, payment_method: 'eSewa' })
    }

    if (action === 'create-fonepay-payment') {
      const merchantId = await getGatewaySetting('fonepay_merchant_id', 'FONEPAY_MERCHANT_ID')
      const environment = await getGatewaySetting('fonepay_environment', 'FONEPAY_ENVIRONMENT', 'test')
      const secret = gatewaySecret('FONEPAY', environment)
      if (!merchantId) throw new Error('Payment gateway is not configured: missing Fonepay merchant ID')

      // Preferred path: sign the stored intent total.
      if (payload.intentToken) {
        const supa = supaAdmin()
        const intent = await loadIntentByToken(supa, payload.intentToken)
        if (!intentUsable(intent) || intent.gateway !== 'fonepay') {
          return response({ error: 'Payment session expired. Please checkout again.' }, 400)
        }
        const amount = n2(intent.expected_total)
        const prn =
          intent.gateway_ref || `SN-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
        const date = String(payload.date)
        const r1 = `Order ${prn}`
        const r2 = `Shipping Rs. ${n2(intent.shipping_fee)}`
        const returnUrl = String(payload.returnUrl)
        await markIntent(supa, String(intent.id), { gateway_ref: prn })
        const signature = await hmac(`${merchantId},P,${prn},${amount},NPR,${date},${r1},${r2},${returnUrl}`, secret, 'SHA-512', 'hex')
        return response({
          gatewayUrl: environment === 'live' ? 'https://clientapi.fonepay.com/api/merchantRequest' : 'https://dev-clientapi.fonepay.com/api/merchantRequest',
          fields: { PID: merchantId, MD: 'P', PRN: prn, AMT: amount, CRN: 'NPR', DT: date, R1: r1, R2: r2, RU: returnUrl, DV: signature },
        })
      }

      // Legacy fallback (pre-intent website builds).
      const amount = Number(payload.amount).toFixed(2)
      const prn = String(payload.prn)
      const date = String(payload.date)
      const r1 = String(payload.r1)
      const r2 = String(payload.r2)
      const returnUrl = String(payload.returnUrl)
      const signature = await hmac(`${merchantId},P,${prn},${amount},NPR,${date},${r1},${r2},${returnUrl}`, secret, 'SHA-512', 'hex')
      return response({
        gatewayUrl: environment === 'live' ? 'https://clientapi.fonepay.com/api/merchantRequest' : 'https://dev-clientapi.fonepay.com/api/merchantRequest',
        fields: { PID: merchantId, MD: 'P', PRN: prn, AMT: amount, CRN: 'NPR', DT: date, R1: r1, R2: r2, RU: returnUrl, DV: signature },
      })
    }

    if (action === 'verify-fonepay-response') {
      const environment = await getGatewaySetting('fonepay_environment', 'FONEPAY_ENVIRONMENT', 'test')
      const secret = gatewaySecret('FONEPAY', environment)
      const details = payload.paymentDetails || {}
      const message = `${details.PID},${details.PRN},${details.BID},${details.AMT},${details.UID},${details.UTN},${details.P_STAT}`
      const signature = await hmac(message, secret, 'SHA-512', 'hex')
      return response({ valid: Boolean(details.DV) && signature === details.DV })
    }

    if (action === 'complete-fonepay-order') {
      const details = payload.paymentDetails || {}
      if (details.P_STAT !== 'SUCCESS' && details.P_STAT !== 'COMPLETED') {
        return response({ error: `Payment was not completed. Status: ${details.P_STAT}` }, 400)
      }

      const environment = await getGatewaySetting('fonepay_environment', 'FONEPAY_ENVIRONMENT', 'test')
      const secret = gatewaySecret('FONEPAY', environment)
      const message = `${details.PID},${details.PRN},${details.BID},${details.AMT},${details.UID},${details.UTN},${details.P_STAT}`
      if (!details.DV || (await hmac(message, secret, 'SHA-512', 'hex')) !== details.DV) {
        return response({ error: 'Security check failed. The Fonepay signature is invalid.' }, 400)
      }

      const supa = supaAdmin()
      const intent = await loadIntentByRef(supa, 'fonepay', details.PRN)
      if (!intentUsable(intent)) {
        return response({ error: 'Payment session expired. Please checkout again.' }, 400)
      }
      if (n2(details.AMT) !== n2(intent.expected_total)) {
        await markIntent(supa, String(intent.id), { status: 'failed' })
        return response({ error: 'Paid amount does not match the order total.' }, 400)
      }

      const summary = await completeIntentOrder(
        supa,
        intent,
        'Bank Transfer',
        `Fonepay Payment Complete.\nUTN Ref: ${details.UTN}\nBill ID: ${details.BID}\nTotal Paid: Rs. ${n2(intent.expected_total)}`,
      )
      return response({ ...summary, txn_code: details.UTN, payment_method: 'Bank Transfer' })
    }

    return response({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error(error)
    return response({ error: error instanceof Error ? error.message : 'Payment gateway error' }, 500)
  }
})
