# Messenger Chatbot — Smart Agent (Supabase-backed)

Node.js + Express Facebook Messenger agent with a hybrid-cascade brain
(ported from Pasale Helper): fuzzy Roman-Nepali product match, multi-turn
COD order capture, Supabase FAQ auto-cache, and LLM fallback. All data lives
in Supabase — no SQLite, no Python runtime.

## 🚀 Smart pipeline (per message, Rs 0 first)

1. **Tier 0 — Order state machine**: `IDLE → COLOR/SIZE → ADDRESS → PHONE → saved to chatbot_orders`. Phone validated to 10 digits starting 98/97.
2. **Tier 1 — Fast rules**: price / availability / location / delivery / hours / payment intents in Roman Nepali, Nepali, and English, with exact + fuzzy (0.82) product match and Devanagari support.
3. **Tier 2 — FAQ auto-cache**: exact `normalized_question` match in `chatbot_faqs` (bumps `hit_count`); legacy substring fallback for old rows.
4. **Tier 3 — LLM fallback** (Groq/Gemini/DeepSeek, OpenAI-compatible): short 1–2 sentence Roman-Nepali reply, auto-cached to `chatbot_faqs` so repeats cost Rs 0. No key → human-handoff escalation into `chatbot_notifications`.
5. Product disambiguation: unknown item → quick-reply buttons; matched item with image → rich product card + `ORDER_<id>` postback.

## 🛠 Setup

1. **Supabase migration** (required for orders + smart columns; bot runs in legacy mode without it):
   Run `add_smart_agent_upgrade.sql` (repo root) in the Supabase SQL Editor.
2. **Install / configure**:
   ```bash
   cd chatbot
   npm install
   ```
   `.env`: `VERIFY_TOKEN`, `PAGE_ACCESS_TOKEN`, `FACEBOOK_APP_SECRET`,
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `SUPABASE_SERVICE_ROLE_KEY`
   (bot writes via RLS-safe fallback when absent), optional
   `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` (or set `llm_*` in the
   `settings` table / Command Center → Smart Brain card).
3. **Verify**: `npm test` — offline 20-case benchmark, must be 20/20.
4. **Start**: `npm start` (`GET /health`, `GET/POST /webhook`), expose with ngrok.

## 🧩 Files

- `src/smartAgent.js` — pure brain (listen/fuzzy/rules/order-machine/templates/LLM).
- `src/smartConfig.js` — LLM config (env → settings table).
- `src/index.js` — Express webhook + Supabase pipeline orchestration.
- `src/messenger.js` — text / quick-replies / product cards.
- `test_smart_agent.js` + `data/smart_benchmark_cases.json` — 20/20 benchmark.
- Dashboards: desktop + mobile `ChatbotPage.tsx` manage catalog (aliases, colors, stock, warranty), Brain FAQs (AI badge, hits), COD Orders, handoff, and LLM settings.
