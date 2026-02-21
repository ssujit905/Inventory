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

module.exports = { sendMessage };
