const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

const { sendMessage } = require('./messenger');
const supabase = require('./supabase');

const app = express();
app.use(bodyParser.json());
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

    const raw = text.trim();
    const clean = normalize(raw);

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

    // 3. CHECK FAQ MATCH
    const { data: faqs } = await supabase.from('chatbot_faqs').select('*');
    if (faqs) {
        const match = faqs.find(f => clean.includes(normalize(f.question)));
        if (match) {
            await sendWithShortcuts(psid, { text: match.answer });
            return;
        }
    }

    // 4. CHECK PRODUCT MATCH
    const { data: products } = await supabase.from('chatbot_products').select('*');
    if (products) {
        const productMatch = products.find(p => clean.includes(normalize(p.name)));
        if (productMatch) {
            if (productMatch.image_url) {
                // Formatting Subtitle: Description + Price + Sizes
                let subtitle = ``;
                if (productMatch.sizes?.length > 0) {
                    subtitle += `Sizes: ${productMatch.sizes.join(', ')} | `;
                }
                subtitle += productMatch.description || 'No description available.';

                // Limit subtitle to 80 chars (Messenger API limit)
                if (subtitle.length > 80) subtitle = subtitle.substring(0, 77) + '...';

                await sendWithShortcuts(psid, {
                    attachment: {
                        type: "template",
                        payload: {
                            template_type: "generic",
                            elements: [{
                                title: `${productMatch.name} - NPR ${parseFloat(productMatch.price).toLocaleString()}`,
                                subtitle: subtitle,
                                image_url: productMatch.image_url,
                                buttons: [{
                                    type: "postback",
                                    title: "Order This Now",
                                    payload: `ORDER_${productMatch.id}`
                                }]
                            }]
                        }
                    }
                });
            } else {
                let response = `📦 *${productMatch.name}*\n\n`;
                response += `💰 Price: NPR ${parseFloat(productMatch.price).toLocaleString()}\n`;
                if (productMatch.sizes?.length > 0) {
                    response += `📏 Sizes: ${productMatch.sizes.join(', ')}\n`;
                }
                response += `\n📝 ${productMatch.description || ''}`;
                await sendWithShortcuts(psid, { text: response });
            }
            return;
        }
    }

    // 5. FALLBACK: HUMAN HANDOFF
    console.log(`[NOMATCH] No match for "${raw}". Notifying admin...`);
    const customerName = "Messenger User";

    await supabase.from('chatbot_notifications').insert([{
        psid,
        customer_name: customerName,
        last_message: raw,
        status: 'unresolved'
    }]);

    await sendWithShortcuts(psid, {
        text: "I have notified our team and will get back soon 🙏"
    });
}

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

app.post('/webhook', (req, res) => {
    const body = req.body;
    if (body.object === 'page') {
        body.entry.forEach(entry => {
            const webhookEvent = entry.messaging[0];
            const senderPsid = webhookEvent.sender.id;

            if (webhookEvent.message && webhookEvent.message.text) {
                handleMessage(senderPsid, webhookEvent.message.text);
            } else if (webhookEvent.postback) {
                handleMessage(senderPsid, webhookEvent.postback.payload || webhookEvent.postback.title);
            }
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Chatbot Command Center is live!'));
