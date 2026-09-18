const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials in .env');
}

// Anon client: used for reads (respects RLS, same as dashboards).
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Privileged client for bot writes (FAQ hit_count/auto-cache, orders,
// escalations) when RLS would block anon. Falls back to anon client.
const supabaseAdmin = supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : supabase;

module.exports = supabase;
module.exports.supabaseAdmin = supabaseAdmin;
