# Messenger Chatbot — 24/7 Cloud Deployment

A rule-based Facebook Messenger chatbot built with Node.js. Deployed on Railway for 24/7 uptime — no laptop required.

## 🚀 How It Works
1. Customer sends a message to your Facebook Page
2. Facebook sends it to your webhook (Railway server)
3. Bot checks FAQs → Products → Human Handoff
4. Response sent back via Messenger API

## ☁️ Production Deployment (Railway)

The bot is deployed at Railway. To redeploy, just push to the `main` branch — Railway auto-deploys.

**Webhook URL:** `https://<your-app>.up.railway.app/webhook`

### Environment Variables (set in Railway dashboard)
| Variable | Description |
|----------|-------------|
| `VERIFY_TOKEN` | Your Facebook webhook verify token |
| `PAGE_ACCESS_TOKEN` | From your Facebook Page settings |
| `FACEBOOK_APP_SECRET` | Your Meta app secret (for webhook signature verification) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |

## 💻 Local Development (with ngrok)

1. **Install Dependencies**:
   ```bash
   cd chatbot
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` and fill in your credentials.

3. **Start with ngrok tunnel**:
   ```bash
   npm run start:local
   ```
   This starts the server AND opens your static ngrok tunnel simultaneously.

## 🧩 Conversational Logic

| Priority | Action |
|----------|--------|
| 1 | Check if chatbot is enabled (DB setting) |
| 2 | Check if human handoff is active for this user |
| 3 | Match against FAQs (keyword match) |
| 4 | Match against Products (keyword match → rich card) |
| 5 | Fallback: notify admin + tell user human is coming |

Quick Reply shortcuts are appended to every response automatically.

## 📦 Deploy a New Instance

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set Root Directory: `chatbot/`
4. Add environment variables in Railway dashboard
5. Get your Railway URL and set it as the Facebook webhook
