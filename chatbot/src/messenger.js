const axios = require('axios');
require('dotenv').config();

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

/**
 * Sends a message to a Messenger user
 * @param {string} senderPsid - The Page-Scoped ID of the user
 * @param {object} response - The message object (e.g., { text: 'Hello', quick_replies: [...] })
 */
async function sendMessage(senderPsid, response) {
    try {
        const requestBody = {
            recipient: { id: senderPsid },
            message: response,
            messaging_type: 'RESPONSE'
        };

        await axios.post(`https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, requestBody);
        console.log(`[OUT] Message to ${senderPsid}: ${response.text || 'Template/Media'}`);
    } catch (error) {
        const errData = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[ERROR] Send failed: ${errData}`);
    }
}

async function sendQuickReplies(senderPsid, text, options = []) {
    const quick_replies = options.slice(0, 11).map((o) => ({
        content_type: 'text',
        title: String(o.title || '').slice(0, 20),
        payload: String(o.payload || o.title || '').slice(0, 1000),
    }));
    return sendMessage(senderPsid, quick_replies.length ? { text, quick_replies } : { text });
}

async function sendProductCard(senderPsid, { title, subtitle, image_url, productId }) {
    return sendMessage(senderPsid, {
        attachment: {
            type: 'template',
            payload: {
                template_type: 'generic',
                elements: [{
                    title: String(title || 'Product').slice(0, 80),
                    subtitle: String(subtitle || 'In Stock • Same Day Delivery').slice(0, 80),
                    image_url: image_url || undefined,
                    buttons: [{
                        type: 'postback',
                        title: 'Order This Now',
                        payload: `ORDER_${productId}`,
                    }],
                }],
            },
        },
    });
}

module.exports = { sendMessage, sendQuickReplies, sendProductCard };
