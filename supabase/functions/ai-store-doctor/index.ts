import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEFAULT_BASE_URL = 'https://api.xkiro.com/v1'
const DEFAULT_MODEL = 'sensenova/sensenova-6.8-flash-lite'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function supaAdmin() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) throw new Error('AI Store Doctor is not configured: missing service credentials')
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } })
}

function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '')
}

async function getDbSetting(key: string): Promise<string> {
  try {
    const supa = supaAdmin()
    const { data } = await supa.from('settings').select('value').eq('key', key).maybeSingle()
    if (data?.value?.trim()) return data.value.trim()
  } catch {
    // fall through
  }
  return ''
}

async function resolveConfig(client: { apiKey?: string; baseUrl?: string; model?: string }) {
  // 1. Values sent by the app (saved via the AI Setup popup)
  let apiKey = client.apiKey?.trim() || ''
  let baseUrl = normalizeBaseUrl(client.baseUrl || '')
  let model = client.model?.trim() || ''

  // 2. Server-side: settings table via service role (bypasses RLS)
  if (!apiKey) {
    apiKey = (await getDbSetting('ai_api_key')) || (await getDbSetting('groq_api_key'))
  }
  if (!baseUrl) baseUrl = normalizeBaseUrl(await getDbSetting('ai_base_url'))
  if (!model) model = await getDbSetting('ai_model')

  // 3. Edge Function secrets, then built-in defaults
  if (!apiKey) apiKey = (Deno.env.get('AI_API_KEY') || Deno.env.get('GROQ_API_KEY') || '').trim()
  if (!baseUrl) baseUrl = normalizeBaseUrl(Deno.env.get('AI_BASE_URL') || '') || DEFAULT_BASE_URL
  if (!model) model = (Deno.env.get('AI_MODEL') || '').trim() || DEFAULT_MODEL

  if (!apiKey) {
    throw new Error('AI API Key is not configured. Set it in the app (AI Setup button) or as AI_API_KEY secret.')
  }
  return { apiKey, baseUrl, model }
}

function extractProviderMessage(errText: string): string {
  try {
    const body = JSON.parse(errText)
    const err = (body as any)?.error
    if (typeof err === 'string') return err
    if (err?.message) return String(err.message)
    if ((body as any)?.message) return String((body as any).message)
  } catch {
    // not JSON — use raw text
  }
  return errText.slice(0, 300)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function callAi(
  apiKey: string,
  baseUrl: string,
  model: string,
  messages: unknown[],
  temperature: number,
  maxTokens: number,
) {
  const endpoint = `${normalizeBaseUrl(baseUrl) || DEFAULT_BASE_URL}/chat/completions`
  // The provider answers 409 when an identical request is still being
  // processed — back off and retry instead of failing immediately.
  const retryDelaysMs = [4000, 8000]
  let lastError = 'AI request failed'
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    })

    if (resp.ok) {
      const result = await resp.json()
      const content = result.choices?.[0]?.message?.content || 'No diagnosis generated.'
      return content as string
    }

    const errText = await resp.text()
    const providerMsg = extractProviderMessage(errText)
    lastError = `AI request failed (${resp.status}): ${providerMsg}`

    if (resp.status === 409 && attempt < retryDelaysMs.length) {
      await sleep(retryDelaysMs[attempt])
      continue
    }
    if (resp.status === 409) {
      throw new Error(
        `AI is still finishing your previous request — please wait a few seconds and try again. (${providerMsg})`,
      )
    }
    throw new Error(lastError)
  }
  throw new Error(lastError)
}

// Rate limiting: 10 requests per minute per IP
const ipHits = new Map<string, number[]>()
function checkRateLimit(ip: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now()
  const timestamps = (ipHits.get(ip) || []).filter(t => now - t < windowMs)
  if (timestamps.length >= limit) return false
  timestamps.push(now)
  ipHits.set(ip, timestamps)
  return true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (clientIp !== 'unknown' && !checkRateLimit(clientIp, 10, 60000)) {
    return jsonResponse({ error: 'Rate limit exceeded: maximum 10 requests per minute. Please wait.' }, 429)
  }

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!url || !anonKey) {
      return jsonResponse({ error: 'Server configuration error: missing Supabase credentials' }, 500)
    }

    // Authenticate caller: require valid JWT
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonResponse({ error: 'Not authenticated. Please log in.' }, 401)
    }
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: callerData, error: callerError } = await userClient.auth.getUser()
    const caller = callerError ? null : callerData?.user
    if (!caller) {
      return jsonResponse({ error: 'Session expired or invalid. Please log in again.' }, 401)
    }

    // Authorize caller: must be admin, staff, or vendor
    const supa = supaAdmin()
    const { data: callerProfile, error: profileErr } = await supa
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()
    if (profileErr) throw profileErr
    if (!callerProfile || !['admin', 'staff', 'vendor'].includes(callerProfile.role)) {
      return jsonResponse({ error: 'Access denied: staff, vendor, or admin role required.' }, 403)
    }

    const { action, apiKey: clientKey, baseUrl: clientBaseUrl, model: clientModel, messages, temperature, max_tokens } = await req.json()

    if (action !== 'diagnose' && action !== 'chat') {
      return jsonResponse({ error: "Unknown action. Use 'diagnose' or 'chat'." }, 400)
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'Missing messages array.' }, 400)
    }

    const { apiKey, baseUrl, model } = await resolveConfig({
      apiKey: clientKey,
      baseUrl: clientBaseUrl,
      model: clientModel,
    })
    const content = await callAi(
      apiKey,
      baseUrl,
      model,
      messages,
      typeof temperature === 'number' ? temperature : action === 'chat' ? 0.5 : 0.3,
      typeof max_tokens === 'number' ? max_tokens : action === 'chat' ? 600 : 900,
    )

    return jsonResponse({ content })
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'AI Store Doctor error' }, 500)
  }
})
