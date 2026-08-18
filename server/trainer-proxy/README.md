# Trainer Bot proxy (Cloudflare Worker)

Backend for the Hypertrophy Helper **Personal Trainer Bot** (Phase 7). It is the only place
the OpenAI API key lives — the app builds a grounded prompt on-device and POSTs it here; the
Worker calls `gpt-4o-mini` and streams the answer back as plain text.

This is a **standalone npm project** (its own `node_modules`), intentionally separate from the
Expo app so Metro never bundles it.

## Endpoint

```
POST /chat
Authorization: Bearer <APP_ACCESS_TOKEN>
Content-Type: application/json

{ "system": "<grounded context>", "question": "...", "stream": true, "maxTokens": 800 }
```

- `stream: true` (default) → `text/plain` stream of answer deltas.
- `stream: false` → `text/plain` full answer (used for proactive insights).
- `401` bad/missing token · `429` over the daily per-IP limit (50) · `400` bad body · `502` upstream error.

## One-time setup

```bash
cd server/trainer-proxy
npm install

# 1. Create the KV namespace for the rate limiter, then paste the printed id into wrangler.toml
wrangler kv namespace create RATE_LIMIT

# 2. Store secrets (never committed)
wrangler secret put OPENAI_API_KEY     # your OpenAI key
wrangler secret put APP_ACCESS_TOKEN   # a long random string

# 3. Deploy
wrangler deploy                        # prints https://trainer-proxy.<subdomain>.workers.dev
```

Then in the **repo root** `.env` (see `.env.example`):

```
EXPO_PUBLIC_TRAINER_PROXY_URL=https://trainer-proxy.<subdomain>.workers.dev/chat
EXPO_PUBLIC_TRAINER_PROXY_TOKEN=<the same APP_ACCESS_TOKEN>
```

Restart Metro so the new env is inlined. Until this is set, the app falls back to the on-device
mock and works fine.

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in OPENAI_API_KEY + APP_ACCESS_TOKEN
npm run dev                      # http://localhost:8787

curl -N -X POST http://localhost:8787/chat \
  -H "Authorization: Bearer <APP_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"system":"You are a coach.","question":"Say hi in five words.","stream":true}'
```

## Notes / TODO (Phase 8)

- The bearer token is a **soft gate** (it ships in the app bundle). It only keeps the endpoint
  from being trivially open; the real secret (the OpenAI key) stays here. Replace with real
  subscription/entitlement validation when RevenueCat lands.
- Rate limiting is **per IP** (KV) as a stand-in until there is a per-user identity.
