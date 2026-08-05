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

async function getGatewaySetting(key: string, envKey: string, fallback = '') {
  const url = Deno.env.get('SUPABASE_URL')
  // The function, not the browser, reads gateway configuration.  Use the
  // service-role key so RLS can deny public reads of sensitive settings.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (url && serviceRoleKey) {
    const client = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
    const { data, error } = await client.from('website_settings').select('value').eq('key', key).maybeSingle()
    if (error) throw error
    if (data?.value) return data.value
  }
  return Deno.env.get(envKey) || fallback
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

    if (action === 'create-fonepay-payment') {
      const merchantId = await getGatewaySetting('fonepay_merchant_id', 'FONEPAY_MERCHANT_ID')
      const environment = await getGatewaySetting('fonepay_environment', 'FONEPAY_ENVIRONMENT', 'test')
      const secret = gatewaySecret('FONEPAY', environment)
      if (!merchantId) throw new Error('Payment gateway is not configured: missing Fonepay merchant ID')
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

    return response({ error: 'Unknown action' }, 400)
  } catch (error) {
    console.error(error)
    return response({ error: error instanceof Error ? error.message : 'Payment gateway error' }, 500)
  }
})
