# Messenger Chatbot (Rule-Based)

A rule-based Facebook Messenger chatbot built with Node.js that starts on the first customer message, supports English and Nepali, and collects complete order details.

## 🚀 Features
- **Auto-start on first message**: No trigger keyword required.
- **Bilingual flow**: Detects user language (`English`/`Nepali`) and replies in that same language for the whole session.
- **Step-by-step order capture**: Product, Quantity, Name, Phone, Address.
- **Validations**: Quantity must be numeric and phone must be 10 digits.
- **Local order store**: Saves orders in `chatbot/data/orders.json` (no inventory DB connection).
- **Messenger webhook ready**: Use with `ngrok` or your production HTTPS endpoint.

## 🛠 Setup Instructions

1. **Install Dependencies**:
   ```bash
   cd chatbot
   npm install
   ```

2. **Configure Environment Variables**:
   Open `.env` and fill in your Messenger credentials:
   - `VERIFY_TOKEN`: Any string (you'll set this in FB Developer Portal).
   - `PAGE_ACCESS_TOKEN`: From your Facebook Page settings.

3. **Start the Server**:
   ```bash
   npm start
   ```

4. **Expose with ngrok**:
   ```bash
   ngrok http 3000
   ```
   Copy the HTTPS URL and set it as your Webhook URL in Facebook Developer Portal (e.g., `https://xxxx.ngrok.io/webhook`).

## 🧩 Conversational Flow
1. **Start**: First message starts order flow immediately.
2. **Product**: Ask product name.
3. **Quantity**: Ask quantity (numbers only).
4. **Name**: Ask customer full name.
5. **Phone**: Ask 10-digit phone number.
6. **Address**: Ask full address.
7. **Complete**: Saves order to `chatbot/data/orders.json` and sends confirmation.
