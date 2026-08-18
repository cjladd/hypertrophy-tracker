// lib/ai/trainer-config.ts
// Trainer-bot backend configuration. `EXPO_PUBLIC_*` env vars are inlined into the JS bundle
// by Expo at build time, so these read synchronously with no async/native calls.
//
// NOTE: the token here ships in the app bundle — it is a SOFT gate (keeps the proxy endpoint
// from being trivially open), not a real secret. The real secret (the OpenAI key) lives only
// in the Worker. Real subscription/entitlement gating arrives in Phase 8.

const PROXY_URL = (process.env.EXPO_PUBLIC_TRAINER_PROXY_URL ?? '').trim();
const PROXY_TOKEN = (process.env.EXPO_PUBLIC_TRAINER_PROXY_TOKEN ?? '').trim();

/** The proxy endpoint + bearer token, or null when the app hasn't been pointed at a proxy. */
export function getProxyConfig(): { url: string; token: string } | null {
  if (!PROXY_URL) return null;
  return { url: PROXY_URL, token: PROXY_TOKEN };
}

/** True once a proxy URL is configured. When false, the app uses the on-device mock. */
export function isProxyConfigured(): boolean {
  return PROXY_URL.length > 0;
}
