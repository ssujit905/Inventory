const supabase = require('./supabase');

const CACHE_MS = 60 * 1000;
let cache = { at: 0, values: {} };

async function getSetting(key, fallback = '') {
    const now = Date.now();
    if (now - cache.at < CACHE_MS && key in cache.values) return cache.values[key];
    try {
        const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
        if (data && typeof data.value === 'string') {
            cache.values[key] = data.value;
            cache.at = now;
            return data.value;
        }
    } catch { /* fall through to env */ }
    return fallback;
}

/**
 * Same provider as AI Store Doctor, always: xkiro endpoint + sensenova model
 * by default, key from shared settings. Chatbot-specific llm_* overrides win.
 */
async function getLlmConfig() {
    const apiKey = (process.env.LLM_API_KEY
        || await getSetting('llm_api_key', '')
        || await getSetting('ai_api_key', '')).trim();
    const baseUrl = (process.env.LLM_BASE_URL
        || await getSetting('llm_base_url', '')
        || await getSetting('ai_base_url', 'https://api.xkiro.com/v1')).replace(/\/+$/, '');
    const model = (process.env.LLM_MODEL
        || await getSetting('llm_model', '')
        || await getSetting('ai_model', 'sensenova/sensenova-6.8-flash-lite')).trim()
        || 'sensenova/sensenova-6.8-flash-lite';
    return { apiKey, baseUrl, model };
}

function clearConfigCache() {
    cache = { at: 0, values: {} };
}

module.exports = { getSetting, getLlmConfig, clearConfigCache };
