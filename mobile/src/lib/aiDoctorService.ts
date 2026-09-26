import { supabase } from './supabase';

export interface FunnelMetrics {
    totalPageVisits: number;
    totalProductViews: number;
    totalAddToCart: number;
    totalBeginCheckout: number;
    totalOrdersCompleted: number;
    totalAbandoned: number;
    viewToCartRate: number;
    cartToCheckoutRate: number;
    checkoutToOrderRate: number;
    overallConversionRate: number;
}

export interface SearchMetric {
    query: string;
    count: number;
    zeroResultsCount: number;
}

export interface TopPageMetric {
    title: string;
    path: string;
    count: number;
}

export interface AggregatedStoreData {
    periodDays: number;
    funnel: FunnelMetrics;
    topSearches: SearchMetric[];
    zeroResultSearches: SearchMetric[];
    topVisitedPages: TopPageMetric[];
    totalOrders: number;
    totalRevenue: number;
}

export interface AIInsightRecord {
    id?: number;
    period_days: number;
    summary_markdown: string;
    health_score: number;
    top_bottlenecks: string[];
    action_items: string[];
    raw_metrics: AggregatedStoreData;
    created_at?: string;
}

/**
 * Fetch behavioral metrics from Supabase for the specified period.
 */
export async function fetchStoreAnalytics(periodDays: number = 7): Promise<AggregatedStoreData> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - periodDays);
    const sinceISO = sinceDate.toISOString();

    // 1. Fetch Search Logs
    const { data: searchLogs } = await supabase
        .from('website_search_logs')
        .select('search_query, results_count')
        .gte('created_at', sinceISO);

    const searchMap = new Map<string, { count: number; zeroResults: number }>();
    (searchLogs || []).forEach(row => {
        const q = (row.search_query || '').trim().toLowerCase();
        if (!q) return;
        const current = searchMap.get(q) || { count: 0, zeroResults: 0 };
        current.count += 1;
        if (Number(row.results_count) === 0) current.zeroResults += 1;
        searchMap.set(q, current);
    });

    const allSearches: SearchMetric[] = Array.from(searchMap.entries()).map(([query, data]) => ({
        query,
        count: data.count,
        zeroResultsCount: data.zeroResults
    })).sort((a, b) => b.count - a.count);

    const topSearches = allSearches.slice(0, 10);
    const zeroResultSearches = allSearches
        .filter(s => s.zeroResultsCount > 0)
        .sort((a, b) => b.zeroResultsCount - a.zeroResultsCount)
        .slice(0, 10);

    // 2. Fetch Page Visits
    const { data: pageVisits } = await supabase
        .from('website_page_visits')
        .select('page_path, product_title')
        .gte('created_at', sinceISO);

    const pageMap = new Map<string, { title: string; count: number }>();
    (pageVisits || []).forEach(row => {
        const p = row.page_path || '/';
        const title = row.product_title || p;
        const current = pageMap.get(p) || { title, count: 0 };
        current.count += 1;
        pageMap.set(p, current);
    });

    const topVisitedPages: TopPageMetric[] = Array.from(pageMap.entries())
        .map(([path, data]) => ({ path, title: data.title, count: data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    // 3. Fetch Funnel Events
    const { data: funnelEvents } = await supabase
        .from('website_funnel_events')
        .select('event_name')
        .gte('created_at', sinceISO);

    let viewCount = 0;
    let cartCount = 0;
    let beginCheckoutCount = 0;
    let orderCompletedCount = 0;
    let abandonedCount = 0;

    (funnelEvents || []).forEach(e => {
        if (e.event_name === 'view_product') viewCount++;
        else if (e.event_name === 'add_to_cart') cartCount++;
        else if (e.event_name === 'begin_checkout') beginCheckoutCount++;
        else if (e.event_name === 'order_completed') orderCompletedCount++;
        else if (e.event_name === 'abandon_checkout') abandonedCount++;
    });

    const totalVisits = pageVisits ? pageVisits.length : 0;
    const viewToCartRate = viewCount > 0 ? (cartCount / viewCount) * 100 : 0;
    const cartToCheckoutRate = cartCount > 0 ? (beginCheckoutCount / cartCount) * 100 : 0;
    const checkoutToOrderRate = beginCheckoutCount > 0 ? (orderCompletedCount / beginCheckoutCount) * 100 : 0;
    const overallConversion = totalVisits > 0 ? (orderCompletedCount / totalVisits) * 100 : 0;

    // 4. Fetch Actual Website Orders
    const { data: orders } = await supabase
        .from('website_orders')
        .select('total_amount, status')
        .gte('created_at', sinceISO);

    const validOrders = orders || [];
    const totalOrders = validOrders.length;
    const totalRevenue = validOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

    return {
        periodDays,
        funnel: {
            totalPageVisits: totalVisits,
            totalProductViews: viewCount,
            totalAddToCart: cartCount,
            totalBeginCheckout: beginCheckoutCount,
            totalOrdersCompleted: orderCompletedCount,
            totalAbandoned: abandonedCount,
            viewToCartRate: Math.round(viewToCartRate * 10) / 10,
            cartToCheckoutRate: Math.round(cartToCheckoutRate * 10) / 10,
            checkoutToOrderRate: Math.round(checkoutToOrderRate * 10) / 10,
            overallConversionRate: Math.round(overallConversion * 10) / 10
        },
        topSearches,
        zeroResultSearches,
        topVisitedPages,
        totalOrders,
        totalRevenue
    };
}

export const DEFAULT_AI_BASE_URL = 'https://api.xkiro.com/v1';
export const DEFAULT_AI_MODEL = 'sensenova/sensenova-6.8-flash-lite';

export interface AiConfig {
    apiKey: string;
    baseUrl: string;
    model: string;
}

export function normalizeBaseUrl(url: string): string {
    return (url || '').trim().replace(/\/+$/, '');
}

/**
 * Read a single AI setting: database `settings` row first,
 * then `VITE_`-prefixed env var, then the built-in default.
 */
export async function getAiSetting(dbKey: string, envName: string, fallback: string): Promise<string> {
    try {
        const { data } = await supabase
            .from('settings')
            .select('value')
            .eq('key', dbKey)
            .maybeSingle();

        if (data?.value?.trim()) return data.value.trim();
    } catch {
        // ignore
    }
    return (import.meta as any).env?.[envName]?.trim() || fallback;
}

/**
 * Retrieve AI API Key from database settings or environment.
 */
export async function getGroqApiKey(): Promise<string> {
    return getAiSetting('ai_api_key', 'VITE_AI_API_KEY', '');
}

/** Retrieve AI Base URL (no trailing slash) from database settings or environment. */
export async function getAiBaseUrl(): Promise<string> {
    return normalizeBaseUrl(await getAiSetting('ai_base_url', 'VITE_AI_BASE_URL', DEFAULT_AI_BASE_URL));
}

/** Retrieve AI model id from database settings or environment. */
export async function getAiModel(): Promise<string> {
    return getAiSetting('ai_model', 'VITE_AI_MODEL', DEFAULT_AI_MODEL);
}

/** Load the full AI configuration (key + base URL + model) at once. */
export async function getAiConfig(): Promise<AiConfig> {
    const [apiKey, baseUrl, model] = await Promise.all([
        getGroqApiKey(),
        getAiBaseUrl(),
        getAiModel(),
    ]);
    return { apiKey, baseUrl, model };
}

/**
 * Save one or more AI settings (apiKey / baseUrl / model) to the database.
 * Only the provided fields are written; empty strings are ignored.
 */
export async function updateAiSettings(settings: { apiKey?: string; baseUrl?: string; model?: string }): Promise<boolean> {
    const rows: { key: string; value: string; updated_at: string }[] = [];
    const now = new Date().toISOString();
    if (settings.apiKey?.trim()) rows.push({ key: 'ai_api_key', value: settings.apiKey.trim(), updated_at: now });
    const baseUrl = settings.baseUrl ? normalizeBaseUrl(settings.baseUrl) : '';
    if (baseUrl) rows.push({ key: 'ai_base_url', value: baseUrl, updated_at: now });
    if (settings.model?.trim()) rows.push({ key: 'ai_model', value: settings.model.trim(), updated_at: now });
    if (rows.length === 0) return false;
    const { error } = await supabase.from('settings').upsert(rows);
    return !error;
}

/**
 * Save or update the AI API key in database settings.
 */
export async function updateGroqApiKey(apiKey: string): Promise<boolean> {
    return updateAiSettings({ apiKey });
}

/**
 * Fetch the latest cached AI diagnosis from the database.
 */
export async function getLatestAIInsight(): Promise<AIInsightRecord | null> {
    const { data, error } = await supabase
        .from('website_ai_insights')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) return null;
    return data as AIInsightRecord;
}

/**
 * Call the AI via the `ai-store-doctor` Edge Function.
 * Browsers block direct calls to api.xkiro.com (CORS, no ACAO header),
 * so the request must go server-side. Falls back to direct fetch only
 * when the function is unreachable (e.g. local dev without deploy),
 * with a clear error if the browser blocks it.
 */
async function callStoreDoctorAI(
    action: 'diagnose' | 'chat',
    messages: { role: string; content: string }[],
    temperature: number,
    maxTokens: number,
    config: AiConfig,
): Promise<string> {
    const baseUrl = normalizeBaseUrl(config.baseUrl) || DEFAULT_AI_BASE_URL;
    const model = config.model?.trim() || DEFAULT_AI_MODEL;
    const clientApiKey = config.apiKey;
    // 1. Preferred path in production: Edge Function (no CORS, key stays server-side safe).
    // In `vite dev` the /xkiro-ai proxy is used directly so a missing/unreachable
    // Edge Function doesn't spam the console with preflight errors.
    // Set VITE_USE_EDGE_AI=true to force the Edge path in dev (function must be deployed).
    const useEdge = !(import.meta as any).env?.DEV || (import.meta as any).env?.VITE_USE_EDGE_AI === 'true';
    if (useEdge) {
    try {
        const { data, error } = await supabase.functions.invoke('ai-store-doctor', {
            body: { action, messages, temperature, max_tokens: maxTokens, apiKey: clientApiKey || undefined, baseUrl, model },
        });
        if (!error && data?.content) return data.content as string;
        if (data?.error && !error) throw new Error(data.error);
        if (error) throw error;
    } catch (edgeErr: any) {
        // If the function returned a real AI error, surface it directly.
        const msg = edgeErr?.message || '';
        const ctx = (edgeErr as any)?.context;
        // FunctionsHttpError from a deployed function carries the JSON body — try to surface it.
        if (ctx && typeof ctx.json === 'function') {
            try {
                const body = await ctx.json();
                if (body?.error) throw new Error(body.error);
            } catch (e: any) {
                if (e?.message && !/body|json|already/i.test(e.message)) throw e;
            }
        }
        if (msg && !/Failed to fetch|Failed to send|Network|not found|404|Function/i.test(msg)) {
            throw edgeErr instanceof Error ? edgeErr : new Error(msg);
        }
        // Otherwise fall through to direct fetch below (function not deployed / unreachable).
    }
    }

    // 2. Fallback: direct browser call (works only if the API allows CORS).
    // In `vite dev` with the default provider, this goes through the /xkiro-ai
    // proxy above to dodge CORS. A custom base URL is called directly.
    const directUrl = (import.meta as any).env?.DEV && baseUrl === DEFAULT_AI_BASE_URL
        ? '/xkiro-ai/v1/chat/completions'
        : `${baseUrl}/chat/completions`;
    try {
        const response = await fetch(directUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${clientApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens: maxTokens
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`AI request failed (${response.status}): ${errText}`);
        }

        const result = await response.json();
        return result.choices?.[0]?.message?.content || 'No response generated.';
    } catch (directErr: any) {
        if (directErr?.message === 'Failed to fetch' || directErr?.name === 'TypeError') {
            throw new Error(
                'Browser blocked the direct AI request (CORS). Deploy the Edge Function: ' +
                '`supabase functions deploy ai-store-doctor` — the app calls it automatically.'
            );
        }
        throw directErr;
    }
}

/**
 * Run the full AI Diagnostic audit using AI and cache the report in Supabase.
 */
export async function generateAIStoreDiagnosis(periodDays: number = 7): Promise<AIInsightRecord> {
    const metrics = await fetchStoreAnalytics(periodDays);
    const config = await getAiConfig();

    if (!config.apiKey) {
        throw new Error('AI API Key is not configured. Please open AI Setup and save your key.');
    }

    const promptContent = `
You are the Senior E-Commerce Conversion Doctor & Growth Strategist for "Shopy Nepal", an e-commerce platform in Nepal.
Analyze the following behavioral analytics data from the past ${periodDays} days and diagnose why visitors may not be purchasing, where money is leaking, and what high-priority fixes should be made.

### E-COMMERCE DATA (Past ${periodDays} Days):
- **Total Page Visits**: ${metrics.funnel.totalPageVisits}
- **Product Page Views**: ${metrics.funnel.totalProductViews}
- **Added to Cart**: ${metrics.funnel.totalAddToCart} (${metrics.funnel.viewToCartRate}% view-to-cart rate)
- **Began Checkout**: ${metrics.funnel.totalBeginCheckout} (${metrics.funnel.cartToCheckoutRate}% cart-to-checkout rate)
- **Completed Orders**: ${metrics.funnel.totalOrdersCompleted} (${metrics.funnel.checkoutToOrderRate}% checkout completion rate)
- **Cart / Checkout Abandonments**: ${metrics.funnel.totalAbandoned}
- **Total Orders Recorded**: ${metrics.totalOrders}
- **Total Revenue (NPR)**: Rs. ${metrics.totalRevenue.toLocaleString()}

### TOP SEARCH TERMS:
${metrics.topSearches.length > 0 ? metrics.topSearches.map(s => `- "${s.query}": ${s.count} searches (${s.zeroResultsCount} zero-result)`).join('\n') : '- No search logs yet.'}

### MISSED DEMAND (Zero-Result Searches):
${metrics.zeroResultSearches.length > 0 ? metrics.zeroResultSearches.map(s => `- "${s.query}": ${s.zeroResultsCount} searches with 0 products found!`).join('\n') : '- None detected.'}

### MOST VISITED PAGES / PRODUCTS:
${metrics.topVisitedPages.length > 0 ? metrics.topVisitedPages.map(p => `- ${p.title} (${p.path}): ${p.count} visits`).join('\n') : '- No page visits recorded yet.'}

---

### INSTRUCTIONS:
Provide your diagnosis in clean, modern Markdown using this exact structure:

## 🩺 Executive Store Health Diagnosis
(2-3 punchy sentences grading the store health and conversion performance.)

## 🔍 Search Intent & Missed Revenue Opportunities
(Analyze what users are searching. Specifically call out items users searched for that had 0 results, and advise how to capture this demand.)

## 🚪 Funnel Bottlenecks (Why Users Leave Without Buying)
(Pinpoint the biggest conversion killer between View -> Cart -> Checkout -> Buy. Explain why users are dropping off.)

## 🎯 3 High-Impact Action Items For This Week
1. **[Action Item 1 Title]**: Exact, practical recommendation.
2. **[Action Item 2 Title]**: Exact, practical recommendation.
3. **[Action Item 3 Title]**: Exact, practical recommendation.

Keep advice direct, realistic, and tailored for online retail in Nepal.
`;

    const markdownSummary = await callStoreDoctorAI(
        'diagnose',
        [
            {
                role: 'system',
                content: 'You are an elite E-Commerce Conversion Optimization Consultant. You provide structured, data-driven, practical audits in crisp Markdown.'
            },
            {
                role: 'user',
                content: promptContent
            }
        ],
        0.3,
        900,
        config
    );

    let healthScore = 0;
    if (metrics.funnel.totalPageVisits > 0) {
        healthScore = 70;
        if (metrics.funnel.checkoutToOrderRate > 50) healthScore += 15;
        else if (metrics.funnel.checkoutToOrderRate < 20) healthScore -= 15;

        if (metrics.funnel.viewToCartRate > 15) healthScore += 10;
        else if (metrics.funnel.viewToCartRate < 5) healthScore -= 10;
        healthScore = Math.max(10, Math.min(98, healthScore));
    }

    const record: AIInsightRecord = {
        period_days: periodDays,
        summary_markdown: markdownSummary,
        health_score: healthScore,
        top_bottlenecks: metrics.zeroResultSearches.map(s => `Zero results for: ${s.query}`),
        action_items: [],
        raw_metrics: metrics
    };

    const { data: inserted, error: insertErr } = await supabase
        .from('website_ai_insights')
        .insert({
            period_days: periodDays,
            summary_markdown: record.summary_markdown,
            health_score: record.health_score,
            top_bottlenecks: record.top_bottlenecks,
            action_items: record.action_items,
            raw_metrics: record.raw_metrics,
            created_by: `AI Store Doctor (${config.model})`
        })
        .select('*')
        .single();

    if (!insertErr && inserted) {
        return inserted as AIInsightRecord;
    }

    return record;
}

/**
 * Chat with the AI using store context + a user message.
 */
export async function chatWithAI(
    userMessage: string,
    metrics: AggregatedStoreData,
    history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
    const config = await getAiConfig();
    if (!config.apiKey) throw new Error('AI API Key is not configured. Please open AI Setup and save your key.');

    const systemPrompt = `You are an expert E-Commerce Advisor for "Shopy Nepal", an online store in Nepal.
You have access to live store analytics data for the past ${metrics.periodDays} days:

STORE METRICS:
- Page Visits: ${metrics.funnel.totalPageVisits}
- Product Views: ${metrics.funnel.totalProductViews}
- Add to Cart: ${metrics.funnel.totalAddToCart} (${metrics.funnel.viewToCartRate}% view-to-cart)
- Begin Checkout: ${metrics.funnel.totalBeginCheckout} (${metrics.funnel.cartToCheckoutRate}% cart-to-checkout)
- Orders Completed: ${metrics.funnel.totalOrdersCompleted} (${metrics.funnel.checkoutToOrderRate}% checkout completion)
- Overall Conversion: ${metrics.funnel.overallConversionRate}%
- Total Revenue: Rs. ${metrics.totalRevenue.toLocaleString()}
- Total Orders: ${metrics.totalOrders}

TOP SEARCHES: ${metrics.topSearches.slice(0, 5).map(s => `"${s.query}" (${s.count}x)`).join(', ') || 'None'}
ZERO-RESULT SEARCHES: ${metrics.zeroResultSearches.slice(0, 5).map(s => `"${s.query}" (${s.zeroResultsCount}x)`).join(', ') || 'None'}

Answer questions concisely and practically. Use markdown formatting. Be direct and actionable.`;

    return callStoreDoctorAI(
        'chat',
        [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: userMessage }
        ],
        0.5,
        600,
        config
    );
}
