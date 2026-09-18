/**
 * Smart Agent brain — Node.js port of Pasale Helper (projects/new/agent.py).
 * Hybrid cascade, Supabase-backed:
 *   Tier 0: multi-turn COD order state machine (Rs 0)
 *   Tier 1: fast rules + fuzzy product match (Rs 0)
 *   Tier 2: auto-FAQ cache in chatbot_faqs (Rs 0)
 *   Tier 3: LLM fallback (same provider as AI Store Doctor) + auto-cache
 *
 * Pure logic (listen/detect/think/speak/order-transitions) is sync and
 * unit-testable. Only FAQ/LLM/order-persist touch the network/DB.
 */

const DEFAULT_SHOP = {
    shop_name: 'KTM Gadget Store',
    tagline: 'Best electronics & accessories in town',
    location: {
        address: "New Road, Pako, Kathmandu (Opposite to People's Plaza)",
        map_hint: 'New Road Gate bata 100 meters bhitra, Pako galli',
        delivery: {
            inside_valley: { available: true, charge_npr: 100, timing: 'Same day or within 24 hours' },
            outside_valley: { available: true, charge_npr: 200, timing: '2-3 business days via courier' },
        },
    },
    hours: { schedule: '10:00 AM - 8:00 PM', days_open: 'Sunday to Friday', closed_day: 'Saturday (Online orders still taken)' },
    payments: { accepted: ['eSewa', 'Khalti', 'Fonepay QR', 'Cash on Delivery (COD) inside valley'] },
    policy: { human_handoff_message: 'Namaste! Yo kurako lagi hamro shop owner dai lai message forward gareko chu. Chittai tapailai direct reply aauchha hai 🙏' },
};

// --- text utils -----------------------------------------------------------

function listen(rawMessage) {
    if (!rawMessage) return '';
    let text = String(rawMessage).toLowerCase().trim();
    text = text.replace(/\bxa\b/g, 'cha')
        .replace(/\bparxa\b/g, 'parcha')
        .replace(/\bhunxa\b/g, 'huncha')
        .replace(/\bkatti\b/g, 'kati')
        .replace(/\bplz\b|\bplss\b|\bpls\b/g, 'please')
        .replace(/\bsmrtwatch\b|\bsmartwach\b|\bwatcch\b|\bghaddi\b/g, 'watch')
        .replace(/\bdilevery\b|\bdelivry\b|\bdilivary\b|\bdeliveryy\b/g, 'delivery')
        .replace(/\bkhallti\b/g, 'khalti')
        .replace(/\beswa\b/g, 'esewa')
        .replace(/\bpaant\b|\bpents\b|\bpantt\b/g, 'pant')
        .replace(/\bpeice\b|\bpiecr\b|\bpices\b|\bpice\b/g, 'piece')
        .replace(/\bwota\b|\bota\b|\bwata\b/g, 'wota')
        .replace(/\bchahinxa\b|\bchahinx\b/g, 'chahiyo');
    return text;
}

/** Detect customer language: 'en' for English, 'roman' for Roman Nepali / Devanagari mix. */
function detectLang(rawMessage) {
    const text = ` ${String(rawMessage || '').toLowerCase()} `;
    if (/[\u0900-\u097F]/.test(text)) return 'roman';
    const markers = ['kati', 'katiho', 'cha', 'chha', 'chahiyo', 'chahinxa', 'huncha', 'hunxa', 'hunchha',
        'kata', 'kaha', 'kasari', 'kina', 'kun', 'ke', 'malai', 'timi', 'tapai', 'tapailai', 'hajur',
        'ho', 'xa', 'parcha', 'parchha', 'milcha', 'garnu', 'garna', 'dinu', 'dinus', 'bhandinu',
        'pathaidinu', 'linu', 'kinnu', 'kinne', 'chahiyeko', 'bhayo', 'dai', 'khulla', 'khulcha',
        'baje', 'samma', 'aaja', 'thau', 'paisa', 'rupaiya', 'samman'];
    for (const m of markers) {
        if (new RegExp(`\\b${m}\\b`).test(text)) return 'roman';
    }
    return 'en';
}

/** Language of a STORED answer: 'en', 'roman', or 'dev' (Devanagari). */
function answerLang(text) {
    const t = String(text || '');
    if (/[\u0900-\u097F]/.test(t)) return 'dev';
    return detectLang(t);
}

/** Strict rule: reply language must equal query language.
 *  English query -> only an English answer may serve.
 *  Nepali (roman/dev) query -> only a Roman Nepali answer may serve.
 *  Devanagari answers never serve (replies are always Roman Nepali, never Devanagari).
 */
function langMatch(queryLang, ansLang) {
    if (queryLang === 'en') return ansLang === 'en';
    return ansLang === 'roman';
}

/** Extract quantity from patterns like "2 piece", "3 pcs", "2 wota" (typo-tolerant). */
function parseQuantity(cleanText) {
    const m = (cleanText || '').match(/(\d+)\s*(pieces?|pcs|wota)\b/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 && n <= 500 ? n : null;
}

function normalizeQuestion(text) {
    return listen(text).replace(/[^\w\s\u0900-\u097F]/g, '').replace(/\s+/g, ' ').trim();
}

// Levenshtein similarity ratio (difflib.get_close_matches cutoff 0.82 equivalent)
function similarity(a, b) {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const m = a.length, n = b.length;
    if (Math.abs(m - n) / Math.max(m, n) > 0.3) return 0;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return 1 - prev[n] / Math.max(m, n);
}

function toAgentProduct(row) {
    if (!row) return null;
    const priceNpr = Number(row.price_npr ?? row.price ?? 0) || 0;
    return {
        id: String(row.id),
        name: row.name || 'Product',
        aliases: row.aliases || [],
        price_npr: priceNpr,
        bundle_deals: row.bundle_deals || row.bundleDeals || [],
        stock_status: row.stock_status || row.stockStatus || 'In Stock',
        colors: row.colors || [],
        sizes: row.sizes || [],
        specs: row.specs || {},
        warranty: row.warranty || '',
        image_url: row.image_url || row.imageUrl || '',
        description: row.description || '',
        _row: row,
    };
}

function detectProduct(cleanText, products) {
    if (!cleanText || !products || products.length === 0) return null;
    const text = ` ${cleanText} `;

    // 1. Devanagari direct match
    const devMap = [
        { dev: 'घडी', keys: ['watch', 'ghadi', 'smartwatch', 'ultra'] },
        { dev: 'इयरबड', keys: ['earbud', 'earphone', 'ucool', 'airbass'] },
        { dev: 'प्यान्ट', keys: ['pant', 'pants', 'stretchable', 'jeans', 'cotton'] },
    ];
    for (const { dev, keys } of devMap) {
        if (text.includes(dev)) {
            const hit = products.find((p) => keys.some((k) =>
                p.name.toLowerCase().includes(k) || (p.aliases || []).map(String).map((a) => a.toLowerCase()).includes(k)));
            if (hit) return hit;
        }
    }

    // 2. Exact alias substring match
    const aliasToProd = new Map();
    for (const prod of products) {
        const tokens = [prod.name.toLowerCase(), String(prod.id).toLowerCase(),
            ...(prod.aliases || []).map((a) => String(a).toLowerCase())];
        for (const t of tokens) {
            if (t && !aliasToProd.has(t)) aliasToProd.set(t, prod);
        }
    }
    for (const [alias, prod] of aliasToProd) {
        if (alias.length >= 3 && text.includes(alias)) return prod;
    }

    // 3. Fuzzy word match (cutoff 0.82, min word len 4)
    const words = cleanText.match(/\w+/g) || [];
    const allAliases = [...aliasToProd.keys()];
    for (const w of words) {
        if (w.length < 4) continue;
        let best = null, bestScore = 0.82;
        for (const alias of allAliases) {
            if (Math.abs(alias.length - w.length) > 3) continue;
            const s = similarity(w, alias);
            if (s > bestScore) { bestScore = s; best = alias; }
        }
        if (best) return aliasToProd.get(best);
    }
    return null;
}

const pickLang = (session, cleanText) => session?.lang || 'roman';
const say = (lang, en, ro) => (lang === 'en' ? en : ro);

// Delivery zones + fees (single source of truth; keep in sync with shop profile).
const INSIDE_KEYWORDS = ['inside valley', 'inside', 'valley vitra', 'kathmandu', 'ktm', 'lalitpur', 'patan',
    'bhaktapur', 'kritipur'];
const OUTSIDE_KEYWORDS = ['outside valley', 'outside', 'pokhara', 'butwal', 'biratnagar', 'chitwan',
    'bharatpur', 'hetauda', 'dharan', 'nepalgunj', 'dhangadhi', 'birgunj'];

function insideFee(shop) {
    return Number(shop?.location?.delivery?.inside_valley?.charge_npr ?? 100) || 0;
}
function outsideFee(shop) {
    return Number(shop?.location?.delivery?.outside_valley?.charge_npr ?? 200) || 0;
}

/** Classify a delivery address into a valley zone, or null when ambiguous. */
function detectZone(cleanText, area = '') {
    const t = ` ${cleanText} ${String(area || '').toLowerCase()} `;
    if (OUTSIDE_KEYWORDS.some((k) => t.includes(k))) return 'outside';
    if (INSIDE_KEYWORDS.some((k) => t.includes(k))) return 'inside';
    const low = cleanText.toLowerCase();
    if (VALLEY_AREAS.some((a) => low.includes(a.toLowerCase()))) return 'inside';
    return null;
}

function feeForZone(zone, shop) {
    const s = shop || DEFAULT_SHOP;
    return zone === 'outside' ? outsideFee(s) : insideFee(s);
}
function zoneLabel(zone, lang) {
    if (zone === 'outside') return lang === 'en' ? 'Outside Valley' : 'Valley bahira';
    return lang === 'en' ? 'Inside Valley' : 'Valley vitra';
}

// --- order state machine (pure transitions; caller persists) ---------------

function nextOrderStep(session, cleanText, matchedProduct, products, rawMessage = '') {
    const orderWords = ['order', 'kinnu', 'linu', 'pathaidinu', 'kinne', 'deliver garidinus', 'buy', 'pathaunus', 'chahiyo'];
    const isOrderStart = orderWords.some((w) => cleanText.includes(w));
    const isOrderPayload = cleanText.startsWith('order_');
    const qty = parseQuantity(cleanText);

    if (session.step === 'IDLE' && (isOrderStart || isOrderPayload || (qty && (matchedProduct || session.product)))) {
        let prod = matchedProduct || session.product;
        if (isOrderPayload) {
            const wanted = cleanText.replace(/^order_/, '');
            prod = (products || []).find((p) => String(p.id) === wanted) || prod;
        }
        prod = prod || session.product || (products || [])[0];
        if (!prod) return { handled: false, reply: null, session };
        session = { ...session, step: 'AWAITING_COLOR_SIZE', product: prod, qty: qty || session.qty || null };
        const lang = pickLang(session, cleanText);
        const colors = prod.colors || [];
        const sizes = (prod.sizes || []).filter((s) => s !== 'Standard');
        const opts = [];
        if (colors.length) opts.push(`Colors: ${colors.join(', ')}`);
        if (sizes.length) opts.push(`Sizes: ${sizes.join(', ')}`);
        const optText = opts.length ? ` (${opts.join(' | ')})` : '';
        return { handled: true, reply: say(lang, `Great! To order ${prod.name}, which color/size would you like?${optText} 🎨`, `Hajur! ${prod.name} order garna tapailai kun color/size chahiyeko ho?${optText} 🎨`), session };
    }
    if (session.step === 'AWAITING_COLOR_SIZE') {
        const lang = pickLang(session, cleanText);
        // Quantity-first reply ("2 piecr" -> "2 piece", or bare "2"): capture qty, keep asking color/size.
        // Combined reply ("black 2 piece"): capture both, move to address.
        const q = parseQuantity(cleanText) || (/^\d+$/.test(cleanText.trim()) ? parseInt(cleanText.trim(), 10) : null);
        const rest = cleanText.replace(/\d+\s*(pieces?|pcs|wota)\b/g, ' ').replace(/\s+/g, ' ').trim();
        if (q && rest) {
            session = { ...session, color: rest.slice(0, 40), qty: q, step: 'AWAITING_ADDRESS' };
            return { handled: true, reply: say(lang, `${q} pieces, ${rest} — noted! 👍 Now your delivery address 📍`, `${q} piece, ${rest} — noted! 👍 Aba delivery address bhandinu na 📍`), session };
        }
        if (q && !session.qty) {
            session = { ...session, qty: q };
            const prod = session.product || (products || [])[0];
            const colors = (prod?.colors || []).filter(Boolean);
            const hint = colors.length ? ` (e.g. ${colors.slice(0, 3).join(', ')})` : '';
            return { handled: true, reply: say(lang, `${q} pieces noted! 👍 Which color/size would you like?${hint} 🎨`, `${q} piece noted! 👍 Kun color/size chahiyeko ho?${hint} 🎨`), session };
        }
        session = { ...session, color: cleanText.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Standard', step: 'AWAITING_ADDRESS' };
        return { handled: true, reply: say(lang, 'Noted! Now please send your delivery address (place / chowk / house number) 📍', 'Noted! Aba tapanko delivery address (Thau / Chowk / Ghar number) bhandinu na 📍'), session };
    }
    if (session.step === 'AWAITING_ADDRESS') {
        const lang = pickLang(session, cleanText);
        const address = String(cleanText).slice(0, 200);
        const zone = detectZone(cleanText);
        if (zone) {
            const fee = feeForZone(zone);
            session = { ...session, address, zone, delivery_fee: fee, step: 'AWAITING_PHONE' };
            return { handled: true, reply: say(lang,
                `Address confirmed! Delivery fee ${zoneLabel(zone, lang)}: Rs ${fee}. Please send your 10-digit phone number (e.g. 98XXXXXXXX) so our delivery rider can contact you 📱`,
                `Address confirm bhayo! Delivery charge ${zoneLabel(zone, lang)}: Rs ${fee}. Delivery dai le contact garna tapanko 10-digit phone number (e.g. 98XXXXXXXX) pathaidinu hola 📱`), session };
        }
        session = { ...session, address, step: 'AWAITING_ZONE' };
        return { handled: true, reply: say(lang,
            'Noted! Is your address inside the valley or outside? (reply: inside / outside) 📍',
            'Noted! Tapanko address valley vitra ho ki bahira? (inside / outside lekhnus) 📍'), session };
    }
    if (session.step === 'AWAITING_ZONE') {
        const lang = pickLang(session, cleanText);
        const zone = detectZone(cleanText);
        if (zone) {
            const fee = feeForZone(zone);
            session = { ...session, zone, delivery_fee: fee, step: 'AWAITING_PHONE' };
            return { handled: true, reply: say(lang,
                `Got it — ${zoneLabel(zone, lang)}, delivery fee Rs ${fee}. Please send your 10-digit phone number (e.g. 98XXXXXXXX) 📱`,
                `Bujhiyo — ${zoneLabel(zone, lang)}, delivery charge Rs ${fee}. Aba 10-digit phone number pathaidinu hola 📱`), session };
        }
        return { handled: true, reply: say(lang,
            'Please reply with "inside" (valley) or "outside" (out of valley) 📍',
            'Kripaya "inside" (valley vitra) ki "outside" (bahira) lekhnus 📍'), session };
    }
    if (session.step === 'AWAITING_PHONE') {
        const lang = pickLang(session, cleanText);
        const digits = cleanText.replace(/[\s-]/g, '');
        const m = digits.match(/\b(98\d{8}|97\d{8})\b/);
        if (m) {
            const phone = m[1];
            session = { ...session, phone, step: 'AWAITING_NAME' };
            return { handled: true, reply: say(lang, 'Thanks! Lastly, please send your full name for the delivery slip 👤', 'Dhanyabad! Antima, delivery slip ko lagi tapanko pura naam bhandinu na 👤'), session };
        }
        return { handled: true, reply: say(lang, 'Please send a valid 10-digit Nepali phone number (e.g. 98XXXXXXXX) 🙏', 'Kripaya valid 10-digit Nepali phone number (e.g. 98XXXXXXXX) pathaidinu hola hai 🙏'), session };
    }
    if (session.step === 'AWAITING_NAME') {
        const lang = pickLang(session, cleanText);
        // Use the raw message to preserve the customer's name casing.
        const name = String(rawMessage || cleanText).replace(/\s+/g, ' ').trim().slice(0, 60);
        const looksPhone = /(\d[\s-]*){7,}/.test(name);
        if (name.length < 2 || looksPhone) {
            return { handled: true, reply: say(lang, 'Please send your full name (e.g. Ram Sharma) 👤', 'Kripaya tapanko pura naam bhandinu na (e.g. Ram Sharma) 👤'), session };
        }
        session = { ...session, name };
        const prod = session.product || (products || [])[0];
        const qty = session.qty || 1;
        const unitPrice = prod?.price_npr ?? 0;
        const zone = session.zone || detectZone(session.address || '') || 'inside';
        const fee = session.delivery_fee ?? feeForZone(zone);
        const orderData = {
            customer_name: session.name,
            customer_phone: session.phone,
            delivery_address: session.address || 'Kathmandu',
            product_id: prod?._row?.id ?? prod?.id ?? null,
            product_name: prod?.name ?? 'Item',
            selected_color: session.color || null,
            selected_size: session.size || null,
            quantity: qty,
            delivery_fee: fee,
            delivery_zone: zone,
            total_price: unitPrice * qty + fee,
        };
            const receiptProduct = prod;
            const rlang = session.lang || lang;
            session = { step: 'IDLE', product: null, color: null, size: null, name: 'Customer', address: null, phone: null, lang: rlang };
            const receipt = rlang === 'en'
                ? `🎉 Order Confirmed!\n━━━━━━━━━━━━━━━━━━\n` +
                  `👤 Name: ${orderData.customer_name}\n` +
                  `📦 Item: ${receiptProduct?.name ?? orderData.product_name} (${orderData.selected_color || 'Standard'}) x ${orderData.quantity}\n` +
                  `🚚 Delivery (${zoneLabel(orderData.delivery_zone, 'en')}): Rs ${Number(orderData.delivery_fee).toLocaleString()}\n` +
                  `💵 Total: Rs ${Number(orderData.total_price).toLocaleString()} (Cash on Delivery)\n` +
                  `📍 Address: ${orderData.delivery_address}\n` +
                  `📞 Phone: ${orderData.customer_phone}\n` +
                  `🚚 Expected Delivery: within 24-48 hours\n━━━━━━━━━━━━━━━━━━\n` +
                  `Our delivery rider will call you before arriving. Thank you! 🙏`
                : `🎉 Order Confirmed!\n━━━━━━━━━━━━━━━━━━\n` +
                  `👤 Name: ${orderData.customer_name}\n` +
                  `📦 Item: ${receiptProduct?.name ?? orderData.product_name} (${orderData.selected_color || 'Standard'}) x ${orderData.quantity}\n` +
                  `🚚 Delivery (${zoneLabel(orderData.delivery_zone, 'roman')}): Rs ${Number(orderData.delivery_fee).toLocaleString()}\n` +
                  `💵 Total: Rs ${Number(orderData.total_price).toLocaleString()} (Cash on Delivery)\n` +
                  `📍 Address: ${orderData.delivery_address}\n` +
                  `📞 Phone: ${orderData.customer_phone}\n` +
                  `🚚 Expected Delivery: 24-48 hours vitra\n━━━━━━━━━━━━━━━━━━\n` +
                  `Hamro delivery dai le aunu agadi phone garnu huncha. Dhanyabad! 🙏`;
            return { handled: true, reply: receipt, session, orderData };
    }
    return { handled: false, reply: null, session };
}

// --- Tier 1 rules ------------------------------------------------------------

// Cities + well-known Kathmandu-valley neighborhoods for area disambiguation.
const CITY_MAP = {
    kathmandu: 'Kathmandu', ktm: 'Kathmandu',
    lalitpur: 'Lalitpur', patan: 'Lalitpur',
    bhaktapur: 'Bhaktapur', kritipur: 'Kritipur',
    pokhara: 'Pokhara', butwal: 'Butwal', biratnagar: 'Biratnagar',
};
const VALLEY_CITIES = new Set(['Kathmandu', 'Lalitpur', 'Bhaktapur', 'Kritipur']);
const VALLEY_AREAS = ['New Road', 'Putalisadak', 'Baneshwor', 'Kalimati', 'Kalanki', 'Koteshwor',
    'Chabahil', 'Boudha', 'Kapan', 'Balaju', 'Gongabu', 'Swayambhu', 'Thankot', 'Jawalakhel', 'Pulchowk'];

function findCity(cleanText) {
    for (const [key, name] of Object.entries(CITY_MAP)) {
        if (new RegExp(`\\b${key}\\b`).test(cleanText)) return name;
    }
    return null;
}

function findArea(cleanText) {
    const low = ` ${cleanText} `;
    for (const a of VALLEY_AREAS) {
        if (low.includes(` ${a.toLowerCase()} `)) return a;
    }
    return null;
}

function thinkRules(cleanText, matchedProduct) {
    const has = (words) => words.some((w) => cleanText.includes(w));
    // STOP / opt-out first: never argue, never sell, never escalate
    if (/\bstop\b/.test(cleanText) || has(['unsubscribe', 'do not text', "don't text", 'dont text', 'do not message', 'stop messaging', 'stop texting', 'no more messages', 'message nagara'])) {
        return { intent: 'STOP', product: null };
    }
    // Greetings first: never escalate a simple hello
    if (/^(hi|hello|hey|hlo|yo|namaste|pranam|namaskar)\b/.test(cleanText) || cleanText === 'hi' || has(['namaste', 'namaskar'])) {
        return { intent: 'GREETING', product: matchedProduct };
    }
    if (has(['exchange', 'return', 'tracking', 'track', 'complain', 'wholesale', 'discount', 'aipugenah', 'pugena', 'ferna', 'warranty claim'])) {
        return { intent: 'UNKNOWN_HANDOFF', product: matchedProduct };
    }
    if (has(['cash on delivery', 'cod', 'esewa', 'khalti', 'fonepay', 'payment', 'pay', 'online pay', 'qr'])) {
        return { intent: 'PAYMENT_QUERY', product: matchedProduct };
    }
    if (has(['delivery', 'deliver', 'courier', 'pathauna', 'outside valley', 'valley vitra', 'delivery charge'])) {
        return { intent: 'DELIVERY_QUERY', product: matchedProduct };
    }
    // Area disambiguation: bare city ("kathmandu") -> ask WHICH PLACE in the city.
    // Neighborhood ("kalimati") -> confirm delivery + ask which item.
    // (Runs before generic LOCATION so a city never just dumps the shop address.)
    const area = findArea(cleanText);
    if (area && !matchedProduct) {
        return { intent: 'AREA_QUERY', product: null, area, isCity: false };
    }
    const city = findCity(cleanText);
    if (city && !matchedProduct) {
        return { intent: 'AREA_QUERY', product: null, area: city, isCity: true };
    }
    // Location (shop address + city/area names so bare "kathmandu" answers instead of looping)
    if (has(['location', 'kata ho', 'address', 'thau', 'पसल कहाँ', 'kaha cha', 'kata cha', 'where',
        'kathmandu', 'ktm', 'lalitpur', 'patan', 'bhaktapur', 'kritipur', 'pokhara',
        'butwal', 'biratnagar', 'nepal'])) {
        return { intent: 'LOCATION_QUERY', product: matchedProduct };
    }
    if (has(['open', 'close', 'baje', 'khulla', 'khulcha', 'timing', 'time', 'aaja', 'samma']) && !matchedProduct) {
        return { intent: 'HOURS_QUERY', product: matchedProduct };
    }
    if (has(['available', 'stock', 'cha ki', 'baki cha'])) {
        return { intent: 'AVAILABILITY_QUERY', product: matchedProduct };
    }
    if (has(['price', 'kati', 'rate', 'cost', 'parcha', 'mulya', 'मूल्य'])) {
        return { intent: 'PRICE_QUERY', product: matchedProduct };
    }
    // Bare quantity ("2 piecr" -> "2 piece"): never escalate, ask which item
    // Bare number ("2") is also treated as a quantity.
    const qtyOnly = parseQuantity(cleanText) || (/^\d+$/.test(cleanText.trim()) ? parseInt(cleanText.trim(), 10) : null);
    if (qtyOnly && qtyOnly > 0 && qtyOnly <= 500 && !matchedProduct) {
        return { intent: 'QUANTITY_QUERY', product: null, qty: qtyOnly };
    }
    if (matchedProduct) return { intent: 'PRICE_QUERY', product: matchedProduct };
    return { intent: 'UNKNOWN_HANDOFF', product: null };
}

// --- Tier 3 mouth ------------------------------------------------------------

function speakRuleTemplate(intent, product, shop, products = [], opts = {}) {
    const s = shop || DEFAULT_SHOP;
    const lang = opts.lang || 'roman';
    const en = lang === 'en';
    const greeting = en ? 'Hello! ' : 'Namaste! ';
    if (intent === 'GREETING') {
        return en
            ? `${greeting}🙏 Welcome to ${(s.shop_name || 'our shop')}! Ask me about price, stock, delivery, or location. Which item are you looking for? 📦`
            : `${greeting}🙏 ${(s.shop_name || 'hamro shop')} ma welcome! Price, stock, delivery, location — जे सोध्नु छ सोध्नुस्. Kun item herna chahanuhuncha? 📦`;
    }
    if (intent === 'QUANTITY_QUERY') {
        const q = opts.qty || '';
        return en
            ? `${greeting}${q ? `${q} pieces 👍 ` : ''}Which item would you like? Please tell me the item name 📦`
            : `${greeting}${q ? `${q} piece ko lagi 👍 ` : ''}Kun item chahiyeko ho? Item ko naam bhandinu na 📦`;
    }
    if (intent === 'STOP') {
        return en
            ? `Sorry for the trouble! We won't message you again unless you reach out. 🙏`
            : `Maaf garnus! Tapainle message nagaresamma hamro bata kunai message aaudaina. 🙏`;
    }
    if (intent === 'AREA_QUERY') {
        const place = opts.area || 'that city';
        if (opts.isCity === false) {
            // Known neighborhood: confirm delivery, ask which item
            return en
                ? `${place} — great, we deliver there! Inside-valley delivery Rs 100 (same day / 24 hrs). Which item would you like? 📦`
                : `${place} — delivery huncha! Valley vitra Rs 100 (same day / 24 hrs). Kun item chahiyeko ho? 📦`;
        }
        // Bare city: ask WHICH PLACE inside it
        return en
            ? `Which place in ${place}? Please send your chowk, street, or nearby landmark so we can arrange delivery 📍`
            : `${place} ko kun thau ma ho? Chowk / street / najikko landmark bhandinu na, delivery milaauchhau 📍`;
    }
    const fmt = (n) => Number(n || 0).toLocaleString();
    if (intent === 'PRICE_QUERY') {
        if (product) {
            const deal = product.bundle_deals?.length ? ` (Special offer: ${product.bundle_deals[0].note || ''})` : '';
            return en
                ? `${greeting}${product.name} costs Rs ${fmt(product.price_npr)}${deal}. Want one? Just reply 'order' and I'll guide you! 📦`
                : `${greeting}${product.name} ko price Rs ${fmt(product.price_npr)} ho${deal}. Chahiyema 'order' lekhnus — ma guide garchu! 📦`;
        }
        const items = products.slice(0, 4).map((p) => `${p.name} (Rs ${fmt(p.price_npr)})`).join(', ');
        return en
            ? `${greeting}Our items: ${items}. Which one would you like?`
            : `${greeting}Hamro items: ${items}. Tapailai kun chahi item chahiyeko ho?`;
    }
    if (intent === 'AVAILABILITY_QUERY') {
        if (product) {
            const colors = product.colors?.length ? (en ? ` Colors: ${product.colors.join(', ')}.` : ` Colors: ${product.colors.join(', ')}.`) : '';
            return en
                ? `${greeting}Yes, ${product.name} is currently ${product.stock_status || 'In Stock'}!${colors} Price: Rs ${fmt(product.price_npr)}.`
                : `${greeting}Hajur, ${product.name} currently ${product.stock_status || 'In Stock'} cha!${colors} Price Rs ${fmt(product.price_npr)} ho.`;
        }
        return en
            ? `${greeting}All our products are in stock. Which item are you looking for?`
            : `${greeting}Hajur, hamro sabai products in stock chan. Kun item chahiyeko ho?`;
    }
    if (intent === 'LOCATION_QUERY') {
        const loc = s.location || {};
        return en
            ? `${greeting}Our shop is at ${loc.address || 'Kathmandu'} (${loc.map_hint || ''}). Feel free to visit! 📍`
            : `${greeting}Hamro shop ${loc.address || 'Kathmandu'} ma cha (${loc.map_hint || ''}). Aayera visit garna saknuhuncha! 📍`;
    }
    if (intent === 'DELIVERY_QUERY') {
        const inV = s.location?.delivery?.inside_valley || {};
        const outV = s.location?.delivery?.outside_valley || {};
        return en
            ? `${greeting}We deliver all over Nepal! 🚚\n- Inside Valley: Rs ${inV.charge_npr ?? 100} (${inV.timing || '24 hrs'})\n- Outside Valley: Rs ${outV.charge_npr ?? 200} (${outV.timing || '2-3 days'})`
            : `${greeting}Hajur, delivery all over Nepal huncha! 🚚\n- Inside Valley: Rs ${inV.charge_npr ?? 100} (${inV.timing || '24 hrs'})\n- Outside Valley: Rs ${outV.charge_npr ?? 200} (${outV.timing || '2-3 days'})`;
    }
    if (intent === 'HOURS_QUERY') {
        const h = s.hours || {};
        return en
            ? `${greeting}Our shop is open ${h.days_open || 'Sunday to Friday'}, ${h.schedule || '10 AM - 8 PM'}. Online orders are accepted anytime!`
            : `${greeting}Hamro shop ${h.days_open || 'Sunday to Friday'} ${h.schedule || '10 AM - 8 PM'} samma khulla huncha. Online orders jahile pani accept huncha!`;
    }
    if (intent === 'PAYMENT_QUERY') {
        const methods = (s.payments?.accepted || ['eSewa', 'Khalti', 'Cash on Delivery']).join(', ');
        return en
            ? `${greeting}We accept ${methods}! Cash on delivery is available inside the valley.`
            : `${greeting}Hajur, payment ma ${methods} sabai accept huncha! Cash on delivery inside valley available cha.`;
    }
    return en
        ? "Hello! I've forwarded this to our shop owner. You'll get a direct reply soon 🙏"
        : s.policy?.human_handoff_message || 'Dai le chittai reply dinuhuncha 🙏';
}

async function askLlmBrain({ apiKey, baseUrl, model }, customerMessage, shop, products) {
    const system = `You are 'Pasale Helper' for '${(shop || DEFAULT_SHOP).shop_name}'. ` +
        `LANGUAGE RULE (strict): detect the customer's language and reply ONLY in it. ` +
        `English message -> reply ONLY in English. Roman Nepali message -> reply ONLY in Roman Nepali. ` +
        `Nepali (Devanagari) message -> reply ONLY in Nepali. Never mix. ` +
        `Keep it short (1-2 sentences). Only answer using the shop facts provided below. ` +
        `If the question is about complaints or unverified discounts, politely reply that you forwarded to the owner.\n\n` +
        `SHOP FACTS:\n${JSON.stringify(shop || DEFAULT_SHOP).slice(0, 4000)}\n` +
        `PRODUCTS:\n${JSON.stringify((products || []).map((p) => ({ name: p.name, price_npr: p.price_npr, colors: p.colors, sizes: p.sizes, warranty: p.warranty }))).slice(0, 4000)}`;
    const payload = {
        model,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: customerMessage },
        ],
        temperature: 0.2,
        max_tokens: 100,
    };
    // One retry on transient capacity/rate errors before giving up to handoff.
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 4000));
        let resp;
        try {
            resp = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(12000),
            });
        } catch (e) {
            lastErr = e;
            continue;
        }
        if (resp.ok) {
            const data = await resp.json();
            const content = (data.choices?.[0]?.message?.content || '').trim();
            // Empty model output counts as failure so the caller escalates to a human
            // instead of sending a hollow reply.
            if (!content) { lastErr = new Error('LLM empty response'); continue; }
            return content;
        }
        const t = await resp.text().catch(() => '');
        lastErr = new Error(`LLM ${resp.status}: ${t.slice(0, 200)}`);
        if (resp.status !== 429 && resp.status !== 503) break;
    }
    throw lastErr instanceof Error ? lastErr : new Error('LLM request failed');
}

class SmartAgent {
    constructor() {
        this.sessions = new Map();
    }

    getSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            this.sessions.set(sessionId, { step: 'IDLE', product: null, color: null, size: null, name: 'Customer', address: null, phone: null, qty: null, lang: 'roman' });
        }
        return this.sessions.get(sessionId);
    }

    // Sync offline pipeline used by benchmark (rules + order flow only)
    processOffline(rawMessage, products, sessionId = 'bench') {
        const agentProducts = (products || []).map(toAgentProduct);
        const clean = listen(rawMessage);
        const lang = detectLang(rawMessage);
        const matched = detectProduct(clean, agentProducts);
        let session = this.getSession(sessionId);
        session.lang = lang;
        const orderRes = nextOrderStep(session, clean, matched, agentProducts, rawMessage);
        this.sessions.set(sessionId, orderRes.session);
        if (orderRes.handled) {
            return { raw: rawMessage, source: 'order_flow', cost: 'Rs 0.00', intent: 'ORDER_PROCESSING', product: matched?.id || null, reply: orderRes.reply };
        }
        const { intent, product, qty, area, isCity } = thinkRules(clean, matched);
        if (intent !== 'UNKNOWN_HANDOFF') {
            return { raw: rawMessage, source: 'rules', cost: 'Rs 0.00', intent, product: product?.id || null, reply: speakRuleTemplate(intent, product, DEFAULT_SHOP, agentProducts, { qty, lang, area, isCity }) };
        }
        return { raw: rawMessage, source: 'rules_escalation', cost: 'Rs 0.00', intent: 'UNKNOWN_HANDOFF', product: product?.id || null, reply: speakRuleTemplate('UNKNOWN_HANDOFF', null, DEFAULT_SHOP, agentProducts) };
    }
}

module.exports = {
    DEFAULT_SHOP, listen, normalizeQuestion, similarity, toAgentProduct, parseQuantity, detectLang, answerLang, langMatch,
    detectProduct, nextOrderStep, thinkRules, speakRuleTemplate, askLlmBrain, SmartAgent,
    CITY_MAP, VALLEY_CITIES, VALLEY_AREAS, findCity, findArea,
};
