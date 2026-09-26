import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// =============================================================================
// admin-set-password — one-click password reset for staff/vendor accounts
// =============================================================================
// Called by an ADMIN from the desktop/mobile Staff Management edit modal.
//
//   POST { target_user_id: "<auth user uuid>", new_password: "<min 6 chars>" }
//   Always responds 200 with { success, message?/error? } so callers get the
//   exact server message through supabase-js functions.invoke on any version.
//
// Security:
//   - The caller's JWT (Authorization: Bearer <user token>) is verified with
//     auth.getUser(), then their `profiles.role` must be 'admin'.
//   - Targets are limited to staff/vendor profiles. Resetting another admin
//     is refused — do that from the Supabase Dashboard instead.
//   - The service-role key never leaves the server. No secrets to configure:
//     SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//     auto-provided to Edge Functions on Supabase Cloud.
//
// Deploy:  supabase functions deploy admin-set-password
// =============================================================================

function getCorsHeaders(origin?: string | null) {
  const allowed = Deno.env.get('ALLOWED_ORIGINS')
  let allowOrigin = '*'
  if (allowed) {
    const list = allowed.split(',').map((s) => s.trim().toLowerCase())
    const reqOrigin = (origin || '').toLowerCase()
    if (list.includes(reqOrigin) || reqOrigin.startsWith('http://localhost:') || reqOrigin.startsWith('http://127.0.0.1:')) {
      allowOrigin = origin || '*'
    } else {
      allowOrigin = list[0] || '*'
    }
  } else if (origin) {
    allowOrigin = origin
  }
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

function json(body: unknown, status: number, origin?: string | null) {
  return new Response(JSON.stringify(body), { status, headers: getCorsHeaders(origin) })
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`admin-set-password is not configured: missing ${name}`)
  return value
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed. Use POST.' }, 200, origin)
  }

  try {
    const url = requiredEnv('SUPABASE_URL')
    const anonKey = requiredEnv('SUPABASE_ANON_KEY')
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')

    // ── Input validation ────────────────────────────────────────────────
    let payload: { target_user_id?: unknown; new_password?: unknown }
    try {
      payload = await req.json()
    } catch {
      return json({ success: false, error: 'Invalid JSON body.' }, 200, origin)
    }
    const targetUserId = String(payload.target_user_id || '')
    const newPassword = String(payload.new_password || '')
    if (!UUID_RE.test(targetUserId)) {
      return json({ success: false, error: 'Invalid target user.' }, 200, origin)
    }
    if (newPassword.length < 6) {
      return json({ success: false, error: 'New password must be at least 6 characters.' }, 200, origin)
    }

    // ── Caller identity: verify the JWT, then require admin role ────────
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return json({ success: false, error: 'Not authenticated.' }, 200, origin)
    }
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: callerData, error: callerError } = await userClient.auth.getUser()
    const caller = callerError ? null : callerData?.user
    if (!caller) {
      return json({ success: false, error: 'Session expired. Please log in again.' }, 200, origin)
    }

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

    const { data: callerProfile, error: callerProfileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()
    if (callerProfileError) throw callerProfileError
    if (callerProfile?.role !== 'admin') {
      return json({ success: false, error: 'Only admins can reset passwords.' }, 200, origin)
    }

    // ── Target checks: must exist, must be staff/vendor (never an admin) ─
    const { data: targetProfile, error: targetError } = await admin
      .from('profiles')
      .select('id, role, full_name, email')
      .eq('id', targetUserId)
      .maybeSingle()
    if (targetError) throw targetError
    if (!targetProfile) {
      return json({ success: false, error: 'User not found.' }, 200, origin)
    }
    if (targetProfile.role === 'admin') {
      return json(
        { success: false, error: 'Admin passwords cannot be reset from the app. Use the Supabase Dashboard.' },
        200,
        origin,
      )
    }
    if (targetProfile.role !== 'staff' && targetProfile.role !== 'vendor') {
      return json({ success: false, error: 'This account type cannot be reset from the app.' }, 200, origin)
    }

    // ── Reset the auth password ─────────────────────────────────────────
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    })
    if (updateError) throw updateError

    return json(
      {
        success: true,
        message: `Password updated for ${targetProfile.full_name || targetProfile.email || 'user'}.`,
      },
      200,
      origin,
    )
  } catch (err) {
    console.error('[admin-set-password]', err)
    const message = err instanceof Error ? err.message : 'Password reset failed. Please try again.'
    return json({ success: false, error: message }, 200, origin)
  }
})
