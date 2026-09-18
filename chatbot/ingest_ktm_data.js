/**
 * Train the smart agent on real KTM Gadget Messenger history.
 * Mirrors projects/new/ingest_ktm_data.py but writes to Supabase:
 *   - chatbot_faqs: top recurring customer Q&As (hit_count = frequency)
 *   - chatbot_products: 3 real products (update by name, else insert)
 *
 * Usage:
 *   node ingest_ktm_data.js --dry-run   # preview counts, no writes
 *   node ingest_ktm_data.js             # write FAQs (+products if allowed)
 *
 * FAQ inserts work with the anon key (RLS policy from add_smart_agent_upgrade.sql).
 * Product writes need SUPABASE_SERVICE_ROLE_KEY in .env; otherwise a
 * seed_ktm_products.sql file is generated for one-click run in SQL Editor.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.argv.includes('--dry-run');
const MESSAGES_DIR = path.join(__dirname, "this_profile's_activity_across_facebook", 'messages');
const FALLBACK_SQL = path.join(__dirname, 'seed_ktm_products.sql');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : supabase;

function normalize(text) {
    return (text || '').toLowerCase().replace(/[^\w\s\u0900-\u097F]/g, '').replace(/\s+/g, ' ').trim();
}

function collectJsonFiles(dir) {
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const a of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!a.isDirectory()) continue;
        const sub = path.join(dir, a.name);
        for (const b of fs.readdirSync(sub, { withFileTypes: true })) {
            const target = b.isDirectory() ? path.join(sub, b.name) : sub;
            let files = [];
            try {
                files = fs.readdirSync(target).filter((f) => /^message_.*\.json$/.test(f)).map((f) => path.join(target, f));
            } catch { /* skip */ }
            out.push(...files);
        }
    }
    return out;
}

const REAL_PRODUCTS = [
    {
        name: 'Ucool Soul 100 hrs Wireless Earbuds',
        description: 'Deep bass stereo with ENC noise cancellation. 100 hours playtime with charging case. Free delivery inside Kathmandu valley.',
        price: 3000, aliases: ['ucool', 'ucool soul', 'earbuds', 'soul', 'earphone', '100 hrs'],
        colors: ['Black', 'White'], sizes: ['Standard'], stock_status: 'In Stock',
        warranty: '6 months warranty',
        bundle_deals: [{ qty: 2, price: 5500 }],
        specs: { battery: '100 hours playtime with charging case', sound: 'Deep bass stereo with ENC noise cancellation' },
        image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500',
    },
    {
        name: 'Chinese Stretchable Slim Fit Pant',
        description: 'High grade stretchable cotton blend, comfortable slim fit. Special offer: Rs 2,500 for 2 pieces.',
        price: 1400, aliases: ['pant', 'pants', 'chinese pant', 'stretchable', 'jeans', 'cotton pant'],
        colors: ['Black', 'Navy Blue', 'Dark Grey', 'Khaki'], sizes: ['28', '30', '32', '34', '36'], stock_status: 'In Stock',
        warranty: '7 days size exchange guarantee',
        bundle_deals: [{ qty: 2, price: 2500, note: 'Rs 2500 for 2 pairs' }],
        specs: { fabric: 'High grade stretchable cotton blend', fit: 'Comfortable slim fit with elastic flex' },
        image_url: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=500',
    },
    {
        name: 'Smartwatch Ultra 2 (Bluetooth Calling)',
        description: '2.0 inch HD display, IP68 water resistant, HD Bluetooth calling. 2-3 days active use.',
        price: 3200, aliases: ['watch', 'smartwatch', 'ghadi', 'ultra 2', 'घडी'],
        colors: ['Orange', 'Matte Black', 'Silver'], sizes: ['49mm dial'], stock_status: 'In Stock',
        warranty: '6 months replacement warranty',
        bundle_deals: [{ qty: 2, price: 6000 }],
        specs: { battery: '2 to 3 days active use, 7 days standby', waterproof: 'IP68 water resistant', calling: 'HD Bluetooth calling' },
        image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500',
    },
];

function sqlEscape(s) {
    return String(s ?? '').replace(/'/g, "''");
}
const TEXT_ARRAY_COLS = new Set(['aliases', 'colors', 'sizes']);
function toSqlLiteral(col, v) {
    if (v === null || v === undefined) return 'NULL';
    if (TEXT_ARRAY_COLS.has(col)) return `ARRAY[${(v || []).map((x) => `'${sqlEscape(x)}'`).join(',')}]`;
    if (typeof v === 'object') return `'${sqlEscape(JSON.stringify(v))}'::jsonb`;
    if (typeof v === 'number') return String(v);
    return `'${sqlEscape(v)}'`;
}

async function main() {
    console.log('🚀 KTM Gadget training ingestion (Supabase target)');
    const files = collectJsonFiles(MESSAGES_DIR);
    console.log(`📁 Found ${files.length} conversation files.`);
    if (files.length === 0) {
        console.error('No message files found. Nothing to do.');
        process.exit(1);
    }

    // 1. Extract customer -> shop Q&A pairs
    const qaPairs = [];
    for (const f of files) {
        try {
            const data = JSON.parse(fs.readFileSync(f, 'utf8'));
            const msgs = (data.messages || []).slice().reverse();
            for (let i = 0; i < msgs.length - 1; i++) {
                const c = msgs[i], n = msgs[i + 1];
                const cs = c.sender_name || '', ns = n.sender_name || '';
                if (cs !== 'Ktm Gadget' && ns === 'Ktm Gadget') {
                    const q = (c.content || '').trim(), a = (n.content || '').trim();
                    if (q.length > 2 && a.length > 1) qaPairs.push({ q, a });
                }
            }
        } catch { /* skip unreadable */ }
    }
    console.log(`✅ Extracted ${qaPairs.length} real Q&A pairs.`);

    // 2. Group by normalized question, rank by frequency
    const groups = new Map();
    for (const { q, a } of qaPairs) {
        const nq = normalize(q);
        if (nq.length <= 4) continue;
        if (!groups.has(nq)) groups.set(nq, { raw: q, answers: [] });
        groups.get(nq).answers.push(a);
    }
    const ranked = [...groups.entries()].sort((x, y) => y[1].answers.length - x[1].answers.length);
    const JUNK = new Set(['ok', 'hlo', 'yes', 'no']);
    const top = [];
    for (const [nq, g] of ranked) {
        if (top.length >= 100) break;
        const freq = {};
        for (const a of g.answers) freq[a] = (freq[a] || 0) + 1;
        const best = Object.entries(freq).sort((x, y) => y[1] - x[1])[0][0];
        if (best.trim().length <= 3 || JUNK.has(best.trim().toLowerCase())) continue;
        top.push({ nq, raw: g.raw, answer: best, hits: g.answers.length });
    }
    console.log(`📊 Top ${top.length} recurring FAQs selected.`);

    if (DRY_RUN) {
        console.log('\n--- DRY RUN preview (top 10) ---');
        top.slice(0, 10).forEach((t, i) => console.log(`${i + 1}. [x${t.hits}] Q: ${t.raw.slice(0, 70)}\n   A: ${t.answer.slice(0, 90)}`));
        console.log(`\nWould insert ${top.length} FAQs + upsert ${REAL_PRODUCTS.length} products.`);
        return;
    }

    // 3. Skip FAQs already cached (by normalized_question)
    let existing = new Set();
    try {
        const { data } = await supabase.from('chatbot_faqs').select('normalized_question');
        (data || []).forEach((r) => r.normalized_question && existing.add(r.normalized_question));
    } catch (e) {
        console.error('[FAQ] existing-rows fetch failed (run add_smart_agent_upgrade.sql first):', e.message);
        process.exit(1);
    }
    const fresh = top.filter((t) => !existing.has(t.nq));
    console.log(`⏭️  ${top.length - fresh.length} already cached, ${fresh.length} new.`);

    // 4. Insert FAQs in batches
    let inserted = 0;
    for (let i = 0; i < fresh.length; i += 50) {
        const batch = fresh.slice(i, i + 50).map((t) => ({
            question: t.raw.slice(0, 500),
            answer: t.answer,
            normalized_question: t.nq.slice(0, 500),
            hit_count: t.hits,
            is_ai_cached: false,
            category: 'ktm_gadget',
            shop_id: 'shop_ktm_gadget',
        }));
        const { error } = await supabaseAdmin.from('chatbot_faqs').insert(batch);
        if (error) {
            // Pre-migration fallback: legacy columns only
            const legacy = batch.map((b) => ({ question: b.question, answer: b.answer }));
            const { error: e2 } = await supabaseAdmin.from('chatbot_faqs').insert(legacy);
            if (e2) { console.error('[FAQ] batch insert failed:', e2.message); break; }
            inserted += legacy.length;
        } else inserted += batch.length;
    }
    console.log(`✅ Inserted ${inserted} FAQs into chatbot_faqs.`);

    // 5. Products: upsert by name, else emit SQL fallback
    const { data: rows } = await supabase.from('chatbot_products').select('id, name');
    const byName = new Map((rows || []).map((r) => [r.name.toLowerCase(), r.id]));
    const sqlStmts = [];
    let prodOk = 0;
    for (const p of REAL_PRODUCTS) {
        const payload = {
            description: p.description, price: p.price, aliases: p.aliases,
            colors: p.colors, sizes: p.sizes, stock_status: p.stock_status,
            warranty: p.warranty, bundle_deals: p.bundle_deals, specs: p.specs,
            image_url: p.image_url, shop_id: 'shop_ktm_gadget',
        };
        const hitId = byName.get(p.name.toLowerCase());
        if (hitId) {
            const { error } = await supabaseAdmin.from('chatbot_products').update(payload).eq('id', hitId);
            if (!error) { prodOk++; continue; }
        } else {
            const { error } = await supabaseAdmin.from('chatbot_products').insert([{ name: p.name, ...payload }]);
            if (!error) { prodOk++; continue; }
        }
        const cols = ['name', ...Object.keys(payload)];
        const vals = cols.map((c) => toSqlLiteral(c, c === 'name' ? p.name : payload[c])).join(', ');
        sqlStmts.push(`INSERT INTO public.chatbot_products (${cols.join(', ')}) VALUES (${vals}) ON CONFLICT (id) DO NOTHING;`);
    }
    if (sqlStmts.length) {
        const header = '-- KTM Gadget real products (product writes need service_role; run in SQL Editor)\n';
        fs.writeFileSync(FALLBACK_SQL, header + sqlStmts.join('\n') + '\n');
        console.log(`⚠️  ${sqlStmts.length} product writes blocked by RLS (anon key). Run ./seed_ktm_products.sql in SQL Editor, or add SUPABASE_SERVICE_ROLE_KEY to .env and re-run.`);
    } else {
        if (fs.existsSync(FALLBACK_SQL)) fs.unlinkSync(FALLBACK_SQL);
        console.log(`✅ Upserted ${prodOk} real products into chatbot_products.`);
    }
    console.log('🎉 Training ingestion complete!');
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
