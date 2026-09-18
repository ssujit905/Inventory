/**
 * Offline benchmark for the smart agent brain (no Supabase / LLM needed).
 * Mirrors projects/new/nepali_messages.json (20 cases).
 * Run: node test_smart_agent.js
 */
const { SmartAgent, toAgentProduct } = require('./src/smartAgent');
const cases = require('./data/smart_benchmark_cases.json');

const TEST_PRODUCTS = [
    { id: 'watch_ultra', name: 'Smartwatch Ultra 2', aliases: ['watch', 'smartwatch', 'ultra 2', 'ghadi'], price: 3200, colors: ['Black', 'Orange', 'Silver'], sizes: ['49mm'], stock_status: 'In Stock', warranty: '6 months replacement warranty', image_url: '' },
    { id: 'earbuds_pro', name: 'AirBass Wireless Earbuds Pro', aliases: ['earbuds', 'airpods', 'earphone', 'bluetooth', 'earbud'], price: 1850, colors: ['White', 'Matte Black'], sizes: [], stock_status: 'In Stock', warranty: '3 months warranty', image_url: '' },
    { id: 'fast_charger', name: '65W GaN Fast Charger (Type-C)', aliases: ['charger', 'fast charger', 'adapter', 'gan'], price: 1500, colors: ['White'], sizes: [], stock_status: 'In Stock', warranty: '6 months warranty', image_url: '' },
].map(toAgentProduct);

function run() {
    const agent = new SmartAgent();
    let correct = 0;
    console.log('\n===========================================================================');
    console.log('SMART AGENT BENCHMARK (Node port: fuzzy + rules + order flow, offline)');
    console.log('===========================================================================');
    cases.forEach((item, i) => {
        const res = agent.processOffline(item.customer_message, TEST_PRODUCTS, `bench_${item.id}`);
        const intentOk = res.intent === item.expected_intent;
        let prodOk = true;
        if (item.expected_product) {
            prodOk = !!res.product && (
                res.product === item.expected_product ||
                (res.product.includes('watch') && item.expected_product.includes('watch')) ||
                (res.product.includes('earbud') && item.expected_product.includes('earbud')) ||
                (res.product.includes('charger') && item.expected_product.includes('charger'))
            );
        }
        const pass = intentOk && prodOk;
        if (pass) correct++;
        console.log(`\n[${pass ? '✅ PASS' : '❌ FAIL'}] Msg #${item.id}: "${item.customer_message}"`);
        console.log(`  -> Handler: [${res.source.toUpperCase()}] | Cost: ${res.cost}`);
        console.log(`  -> Intent: ${res.intent} (Expected: ${item.expected_intent})${item.expected_product ? ` | Product: ${res.product} (Expected: ${item.expected_product})` : ''}`);
        console.log(`  -> Reply: "${String(res.reply).slice(0, 70)}..."`);
        if (i === cases.length - 1) {
            console.log('\n===========================================================================');
            console.log(`📊 ACCURACY SCORE: ${correct}/${cases.length} (${((correct / cases.length) * 100).toFixed(1)}%)`);
            console.log('===========================================================================\n');
            process.exit(correct === cases.length ? 0 : 1);
        }
    });
}

run();
