const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const { sendMessage, sendQuickReplies, sendProductCard } = require('./messenger');
const supabase = require('./supabase');
const { supabaseAdmin } = require('./supabase');
const {
    DEFAULT_SHOP, listen, normalizeQuestion, toAgentProduct, detectLang, answerLang, langMatch,
    detectProduct, nextOrderStep, thinkRules, speakRuleTemplate, askLlmBrain, SmartAgent,
    VALLEY_CITIES, VALLEY_AREAS,
} = require('./smartAgent');
const { getLlmConfig } = require('./smartConfig');

const smartAgent = new SmartAgent();

const app = express();
app.use(bodyParser.json({
    verify: (req, _res, buffer) => {
        req.rawBody = buffer;
    }
}));
app.use(cors());

// In-memory sessions
const userSessions = new Map();

// Helper to normalize text for matching
function normalize(text) {
    return text.toLowerCase().trim()
        .replace(/[^\w\s\u0900-\u097F]/gi, ''); // Keep alphanumeric and Devanagari
}

async function getChatbotStatus() {
    try {
        const { data } = await supabase.from('settings').select('value').eq('key', 'chatbot_enabled').maybeSingle();
        return data ? data.value === 'true' : true;
    } catch (e) {
        return true;
    }
}

async function handleMessage(psid, text) {
    const enabled = await getChatbotStatus();
    if (!enabled) return;

    const raw = String(text || '').trim();
    if (!raw) return;
    const clean = listen(raw);
    const cleanNorm = normalizeQuestion(raw);

    // 1. FETCH SHORTCUTS (Quick Replies)
    const { data: shortcuts } = await supabase
        .from('chatbot_shortcuts')
        .select('label, payload')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

    const quickReplies = shortcuts?.map(s => ({
        content_type: "text",
        title: s.label,
        payload: s.payload
    })) || [];

    const sendWithShortcuts = async (psid, messageObj) => {
        if (quickReplies.length > 0) {
            messageObj.quick_replies = quickReplies;
        }
        return sendMessage(psid, messageObj);
    };

    // 2. CHECK HUMAN HANDOFF STATUS
    const { data: activeHandoff } = await supabase
        .from('chatbot_notifications')
        .select('id')
        .eq('psid', psid)
        .eq('status', 'unresolved')
        .maybeSingle();

    if (activeHandoff) {
        console.log(`[HANDOFF] Manual mode active for ${psid}. Ignoring message.`);
        return;
    }

    // 3. LOAD PRODUCTS (smart catalog with aliases/colors/stock)
    const { data: productRows } = await supabase.from('chatbot_products').select('*');
    const products = (productRows || []).map(toAgentProduct);

    // Session memory: remember last mentioned product for follow-ups like "price kati ho?"
    // Language follows the customer's latest message (English -> English, Roman Nepali -> Roman Nepali).
    let session = smartAgent.getSession(psid);
    const lang = detectLang(raw);
    session.lang = lang;
    let matched = detectProduct(camelSafe(clean), products);
    if (!matched && session.product && /price|kati|rate|cost|parcha|mulya|available|stock|cha ki|order|kinnu|linu/.test(clean)) {
        matched = session.product;
    } else if (matched) {
        session.product = matched;
    }

    // 4. TIER 0 — ORDER STATE MACHINE (multi-turn COD capture, Rs 0)
    const orderRes = nextOrderStep(session, clean, matched, products);
    smartAgent.sessions.set(psid, orderRes.session);
    if (orderRes.handled) {
        if (orderRes.orderData) {
            const od = orderRes.orderData;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(od.product_id || ''));
            try {
                await supabaseAdmin.from('chatbot_orders').insert([{
                    psid,
                    customer_phone: od.customer_phone,
                    delivery_address: od.delivery_address,
                    product_id: isUuid ? od.product_id : null,
                    product_name: od.product_name,
                    selected_color: od.selected_color,
                    selected_size: od.selected_size,
                    quantity: od.quantity || 1,
                    total_price: od.total_price,
                    status: 'pending',
                }]);
            } catch (e) {
                console.error('[ORDER] save failed:', e.message);
            }
        }
        await sendWithShortcuts(psid, { text: orderRes.reply });
        return;
    }

    // 5. TIER 1 — FAST RULES (Rs 0)
    const { intent, product, qty, area, isCity } = thinkRules(clean, matched);
    if (intent !== 'UNKNOWN_HANDOFF') {
        // Area disambiguation: bare city -> ask which place (+ area buttons for valley cities);
        // known neighborhood / other no-product intents -> product buttons.
        if (intent === 'AREA_QUERY' && isCity !== false && area && VALLEY_CITIES.has(area)) {
            const reply = speakRuleTemplate(intent, null, DEFAULT_SHOP, products, { qty, lang, area, isCity });
            const options = VALLEY_AREAS.slice(0, 10).map((a) => ({ title: a.slice(0, 20), payload: a }));
            await sendQuickReplies(psid, reply, options);
            return;
        }
        // Product disambiguation fallback: no specific item -> ask with quick-reply buttons
        // (also used for greetings / bare quantities so the chat starts with one-tap options)
        if (((intent === 'PRICE_QUERY' || intent === 'AVAILABILITY_QUERY' || intent === 'QUANTITY_QUERY' || intent === 'AREA_QUERY') && !product && products.length > 0) ||
            (intent === 'GREETING' && products.length > 0)) {
            const reply = speakRuleTemplate(intent, null, DEFAULT_SHOP, products, { qty, lang, area, isCity });
            const options = products.slice(0, 6).map((p) => ({ title: p.name.slice(0, 20), payload: p.name }));
            await sendQuickReplies(psid, reply, options);
            if (quickReplies.length > 0) await sendMessage(psid, { text: 'Tap a button above 👆 or type your question.', quick_replies: quickReplies });
            return;
        }
        if ((intent === 'PRICE_QUERY' || intent === 'AVAILABILITY_QUERY') && product && product.image_url) {
            const row = product._row || {};
            let subtitle = '';
            if (row.sizes?.length > 0) subtitle += `Sizes: ${row.sizes.join(', ')} | `;
            subtitle += row.description || row.warranty || 'In Stock • Same Day Delivery';
            if (subtitle.length > 80) subtitle = subtitle.substring(0, 77) + '...';
            await sendProductCard(psid, {
                title: `${product.name} - NPR ${Number(product.price_npr).toLocaleString()}`,
                subtitle,
                image_url: product.image_url,
                productId: product.id,
            });
            await sendWithShortcuts(psid, { text: speakRuleTemplate(intent, product, DEFAULT_SHOP, products, { lang }) });
            return;
        }
        await sendWithShortcuts(psid, { text: speakRuleTemplate(intent, product, DEFAULT_SHOP, products, { lang }) });
        return;
    }

    // 6. TIER 2 — AUTO-FAQ CACHE (Rs 0): exact normalized match, then legacy substring
    // Wrapped in try/catch so the bot keeps working before add_smart_agent_upgrade.sql is run.
    if (cleanNorm.length > 1) {
        try {
            const { data: cached, error: cacheErr } = await supabase
                .from('chatbot_faqs')
                .select('id, answer, hit_count')
                .eq('normalized_question', cleanNorm)
                .limit(1)
                .maybeSingle();
            if (cacheErr) throw cacheErr;
            if (cached) {
                // STRICT language rule: a cached answer serves ONLY when its
                // language matches the customer's message. Otherwise fall
                // through (LLM will answer in the right language and cache it).
                if (!langMatch(lang, answerLang(cached.answer))) {
                    console.log(`[LANG] cache skipped (query:${lang})`);
                } else {
                    try {
                        await supabaseAdmin.from('chatbot_faqs').update({ hit_count: (cached.hit_count || 0) + 1 }).eq('id', cached.id);
                    } catch { /* non-fatal */ }
                    await sendWithShortcuts(psid, { text: cached.answer });
                    return;
                }
            }
        } catch (e) {
            console.error('[FAQ-CACHE] skipped (run add_smart_agent_upgrade.sql):', e.message);
        }
    }
    const { data: faqs } = await supabase.from('chatbot_faqs').select('*');
    if (faqs) {
        // Legacy substring fallback: only match substantial questions (6+ chars).
        // One-word entries like "Order" would otherwise hijack any message
        // containing that word and starve the LLM tier. Short inputs are already
        // covered by exact-match cache above + GREETING/rules intents.
        const match = faqs.find(f => {
            const nq = normalizeQuestion(f.question);
            if (nq.length < 6 || !clean.includes(nq)) return false;
            // STRICT language rule (same as exact cache above).
            if (!langMatch(lang, answerLang(f.answer))) return false;
            return true;
        });
        if (match) {
            try {
                if (!match.normalized_question) {
                    await supabaseAdmin.from('chatbot_faqs').update({ normalized_question: cleanNorm, hit_count: (match.hit_count || 0) + 1 }).eq('id', match.id);
                } else {
                    await supabaseAdmin.from('chatbot_faqs').update({ hit_count: (match.hit_count || 0) + 1 }).eq('id', match.id);
                }
            } catch { /* non-fatal */ }
            await sendWithShortcuts(psid, { text: match.answer });
            return;
        }
    }

    // 7. TIER 3 — LLM FALLBACK + auto-cache, else human handoff escalation
    const { apiKey, baseUrl, model } = await getLlmConfig();
    if (apiKey) {
        try {
            const reply = await askLlmBrain({ apiKey, baseUrl, model }, raw, DEFAULT_SHOP, products);
            try {
                const { error: faqErr } = await supabaseAdmin.from('chatbot_faqs').insert([{
                    question: raw.slice(0, 500),
                    answer: reply,
                    normalized_question: cleanNorm.slice(0, 500),
                    is_ai_cached: true,
                    hit_count: 1,
                    category: 'general',
                    shop_id: 'shop_ktm_gadget',
                }]);
                if (faqErr) throw faqErr;
            } catch {
                try { // pre-migration fallback: legacy columns only
                    await supabaseAdmin.from('chatbot_faqs').insert([{ question: raw.slice(0, 500), answer: reply }]);
                } catch { /* cache is best-effort */ }
            }
            await sendWithShortcuts(psid, { text: reply });
            return;
        } catch (e) {
            console.error(`[LLM] fallback failed: ${e.message}`);
        }
    }

    // 8. FALLBACK: HUMAN HANDOFF + escalate ticket.
    // Loop-breaker: if this customer already has an open ticket, do NOT pile
    // up duplicates — just reassure once. (retries legacy column set so
    // handoff survives before migration is run)
    console.log(`[NOMATCH] No match for "${raw}". Notifying admin...`);
    try {
        const { data: openTicket } = await supabaseAdmin.from('chatbot_notifications')
            .select('id').eq('psid', psid).eq('status', 'unresolved').limit(1).maybeSingle();
        if (!openTicket) {
            try {
                const { error: escErr } = await supabaseAdmin.from('chatbot_notifications').insert([{
                    psid,
                    customer_name: 'Messenger User',
                    last_message: raw,
                    customer_message: raw,
                    shop_id: 'shop_ktm_gadget',
                    status: 'unresolved'
                }]);
                if (escErr) throw escErr;
            } catch (e) {
                console.error('[HANDOFF] smart insert failed, retrying legacy:', e.message);
                try {
                    await supabaseAdmin.from('chatbot_notifications').insert([{
                        psid, customer_name: 'Messenger User', last_message: raw, status: 'unresolved'
                    }]);
                } catch (e2) {
                    console.error('[HANDOFF] insert failed:', e2.message);
                }
            }
        } else {
            console.log(`[HANDOFF] ticket already open for ${psid}, skipping duplicate.`);
        }
    } catch (e) {
        console.error('[HANDOFF] ticket check failed:', e.message);
    }

    await sendWithShortcuts(psid, {
        text: speakRuleTemplate('UNKNOWN_HANDOFF', null, DEFAULT_SHOP, products, { lang })
    });
}

// listen() lowercases already; guard non-string inputs from postback payloads
function camelSafe(s) { return typeof s === 'string' ? s : String(s || ''); }

app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// Verify that POSTs really came from Meta before processing a Messenger event.
// Set FACEBOOK_APP_SECRET in production; leaving it unset preserves local testing.
app.use('/webhook', (req, res, next) => {
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appSecret || req.method !== 'POST') return next();

    const received = req.get('x-hub-signature-256');
    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(req.rawBody || '').digest('hex')}`;

    if (!received || received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
        return res.sendStatus(403);
    }
    next();
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'inventory-chatbot-smart-agent', version: '2.0.0' });
});

app.post('/webhook', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            (entry.messaging || []).forEach(webhookEvent => {
                const senderPsid = webhookEvent.sender && webhookEvent.sender.id;
                if (!senderPsid) return;

                // Quick-reply tap (product disambiguation buttons)
                if (webhookEvent.message && webhookEvent.message.quick_reply && webhookEvent.message.quick_reply.payload) {
                    console.log(`[IN] PSID:${senderPsid} | quick_reply: ${webhookEvent.message.quick_reply.payload}`);
                    handleMessage(senderPsid, webhookEvent.message.quick_reply.payload).catch((e) => console.error('[WEBHOOK] handleMessage failed:', e.message));
                } else if (webhookEvent.message && webhookEvent.message.text) {
                    console.log(`[IN] PSID:${senderPsid} | Text: "${webhookEvent.message.text}"`);
                    handleMessage(senderPsid, webhookEvent.message.text).catch((e) => console.error('[WEBHOOK] handleMessage failed:', e.message));
                } else if (webhookEvent.postback) {
                    console.log(`[IN] PSID:${senderPsid} | postback: ${webhookEvent.postback.payload || webhookEvent.postback.title}`);
                    handleMessage(senderPsid, webhookEvent.postback.payload || webhookEvent.postback.title).catch((e) => console.error('[WEBHOOK] handleMessage failed:', e.message));
                }
            });
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

if (require.main === module) {
    app.listen(process.env.PORT || 3000, () => console.log('Chatbot Command Center (smart agent) is live!'));
}

module.exports = { app, handleMessage, smartAgent };
