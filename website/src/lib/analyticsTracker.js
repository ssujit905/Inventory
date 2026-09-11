import { supabase } from './supabase';

/**
 * Anonymous, non-blocking telemetry & funnel tracker for Shopy Nepal.
 * Errors are caught silently so tracking NEVER interferes with user shopping.
 */

const SESSION_KEY = 'sn_anon_session_id';

export function getSessionId() {
    try {
        let sid = sessionStorage.getItem(SESSION_KEY);
        if (!sid) {
            sid = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
            sessionStorage.setItem(SESSION_KEY, sid);
        }
        return sid;
    } catch {
        return 'sess_fallback_' + Date.now();
    }
}

// Track page visits
let lastLoggedPath = '';
let pageStartTime = Date.now();

export async function trackPageView(path, productId = null, productTitle = null) {
    try {
        // Compute dwell time for previous page if available
        const sid = getSessionId();
        lastLoggedPath = path;
        pageStartTime = Date.now();

        await supabase.from('website_page_visits').insert({
            session_id: sid,
            page_path: path,
            product_id: productId ? Number(productId) : null,
            product_title: productTitle || null,
            referrer: typeof document !== 'undefined' ? (document.referrer || '') : '',
            dwell_seconds: 0
        });
    } catch (err) {
        // Silently ignore telemetry failure
    }
}

// Track searches (with deduplication in current session)
const recentSearches = new Set();

export async function trackSearch(query, resultsCount = 0) {
    const trimmed = (query || '').trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) return;

    // Avoid logging the exact same query multiple times in rapid succession
    const cacheKey = `${trimmed}:${resultsCount}`;
    if (recentSearches.has(cacheKey)) return;
    recentSearches.add(cacheKey);

    // Limit cache size
    if (recentSearches.size > 50) {
        recentSearches.clear();
    }

    try {
        const sid = getSessionId();
        await supabase.from('website_search_logs').insert({
            session_id: sid,
            search_query: query.trim(),
            results_count: Number(resultsCount) || 0
        });
    } catch (err) {
        // Silently ignore
    }
}

// Track funnel milestones
export async function trackFunnelEvent(eventName, data = {}) {
    try {
        const sid = getSessionId();
        await supabase.from('website_funnel_events').insert({
            session_id: sid,
            event_name: eventName,
            product_id: data.productId ? Number(data.productId) : null,
            product_title: data.productTitle || null,
            step_name: data.stepName || null,
            drop_reason: data.dropReason || null,
            cart_total: Number(data.cartTotal) || 0,
            metadata: data.metadata || {}
        });
    } catch (err) {
        // Silently ignore
    }
}
