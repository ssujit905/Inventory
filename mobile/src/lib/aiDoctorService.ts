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

/**
 * Retrieve Groq API Key from database settings or environment.
 */
export async function getGroqApiKey(): Promise<string> {
    try {
        const { data } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'groq_api_key')
            .maybeSingle();

        if (data?.value) return data.value.trim();
    } catch {
        // ignore
    }
    return (import.meta as any).env?.VITE_GROQ_API_KEY || '';
}

/**
 * Save or update the Groq API key in database settings.
 */
export async function updateGroqApiKey(apiKey: string): Promise<boolean> {
    const { error } = await supabase
        .from('settings')
        .upsert({
            key: 'groq_api_key',
            value: apiKey.trim(),
            updated_at: new Date().toISOString()
        });
    return !error;
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
 * Run the full AI Diagnostic audit using Groq Cloud AI and cache the report in Supabase.
 */
export async function generateAIStoreDiagnosis(periodDays: number = 7): Promise<AIInsightRecord> {
    const metrics = await fetchStoreAnalytics(periodDays);
    const apiKey = await getGroqApiKey();

    if (!apiKey) {
        throw new Error('Groq API Key is not configured. Please set your API key.');
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

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'qwen/qwen3.8-27b',
            messages: [
                {
                    role: 'system',
                    content: 'You are an elite E-Commerce Conversion Optimization Consultant. You provide structured, data-driven, practical audits in crisp Markdown.'
                },
                {
                    role: 'user',
                    content: promptContent
                }
            ],
            temperature: 0.3,
            max_tokens: 1500
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq AI request failed (${response.status}): ${errText}`);
    }

    const result = await response.json();
    const markdownSummary = result.choices?.[0]?.message?.content || 'No diagnosis generated.';

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
            created_by: 'Groq Cloud AI (Qwen 3.8 27B)'
        })
        .select('*')
        .single();

    if (!insertErr && inserted) {
        return inserted as AIInsightRecord;
    }

    return record;
}
