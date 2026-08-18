// server/trainer-proxy/src/index.ts
// Personal Trainer Bot backend proxy (Phase 7.1) — Cloudflare Worker.
//
// The app builds a GROUNDED context string on-device (see lib/ai/llm-context.ts) and POSTs
// { system, question } here. This Worker is the only place the OpenAI key lives — the app
// never sees it. It gates the endpoint behind a shared bearer token (a soft gate until real
// subscription checking lands in Phase 8), applies a per-IP daily rate limit, calls OpenAI
// gpt-4o-mini, and streams back PLAIN-TEXT deltas so the client stays trivial.
//
// Endpoint: POST /chat
//   headers: Authorization: Bearer <APP_ACCESS_TOKEN>
//   body:    { system: string, question: string, stream?: boolean, maxTokens?: number }
//   200:     stream=true  -> text/plain stream of answer deltas
//            stream=false -> text/plain full answer (used by proactive insights, 7.4)

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const DAILY_LIMIT = 50; // per IP; stand-in for per-user limit until Phase 8 identity exists
const DEFAULT_MAX_TOKENS = 800;

interface Env {
  OPENAI_API_KEY: string;
  APP_ACCESS_TOKEN: string;
  RATE_LIMIT?: KVNamespace; // optional: absent → rate limiting is skipped
}

interface ChatBody {
  system?: string;
  question?: string;
  stream?: boolean;
  maxTokens?: number;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...CORS_HEADERS },
  });
}

/** Best-effort per-IP daily counter. Returns true if the caller is over the limit. */
async function isRateLimited(env: Env, ip: string): Promise<boolean> {
  if (!env.RATE_LIMIT) return false; // no KV bound → don't block (dev convenience)
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const key = `${ip}:${day}`;
  try {
    const current = parseInt((await env.RATE_LIMIT.get(key)) ?? '0', 10);
    if (current >= DAILY_LIMIT) return true;
    // Not atomic, but adequate for a soft per-IP cap. Expire after 2 days.
    await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 60 * 60 * 48 });
    return false;
  } catch {
    return false; // never fail a request because the limiter had a hiccup
  }
}

/** Transforms OpenAI's SSE stream into a plain-text stream of just the answer deltas. */
function toPlainTextStream(openaiBody: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = openaiBody.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // last element may be a partial line — keep it
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          controller.close();
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta: string | undefined = json?.choices?.[0]?.delta?.content;
          if (delta) controller.enqueue(encoder.encode(delta));
        } catch {
          // keepalive comment or a split frame — ignore
        }
      }
    },
    cancel() {
      void reader.cancel();
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/chat') {
      return textResponse('Not found', 404);
    }

    // --- Auth: shared bearer token (soft gate; real entitlement check is Phase 8) ---
    const auth = request.headers.get('Authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!env.APP_ACCESS_TOKEN || token !== env.APP_ACCESS_TOKEN) {
      return textResponse('Unauthorized', 401);
    }

    // --- Rate limit (per IP, per day) ---
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (await isRateLimited(env, ip)) {
      return textResponse('Daily query limit reached. Try again tomorrow.', 429);
    }

    // --- Parse + validate ---
    let body: ChatBody;
    try {
      body = (await request.json()) as ChatBody;
    } catch {
      return textResponse('Invalid JSON body', 400);
    }
    const question = (body.question ?? '').trim();
    if (!question) return textResponse('Missing "question"', 400);
    const system = body.system ?? '';
    const stream = body.stream !== false; // default true
    const maxTokens = Math.min(Math.max(body.maxTokens ?? DEFAULT_MAX_TOKENS, 16), 2000);

    // --- Call OpenAI ---
    const messages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: question },
    ];
    let openaiRes: Response;
    try {
      openaiRes = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: MODEL, messages, stream, max_tokens: maxTokens, temperature: 0.5 }),
      });
    } catch {
      return textResponse('Upstream request failed', 502);
    }

    if (!openaiRes.ok) {
      const detail = await openaiRes.text().catch(() => '');
      return textResponse(`Model error (${openaiRes.status}). ${detail.slice(0, 300)}`, 502);
    }

    if (!stream) {
      // Non-streaming: return the full answer text (proactive insights, 7.4).
      try {
        const json = (await openaiRes.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        return textResponse(json.choices?.[0]?.message?.content ?? '', 200);
      } catch {
        return textResponse('Malformed model response', 502);
      }
    }

    if (!openaiRes.body) return textResponse('Empty model response', 502);
    return new Response(toPlainTextStream(openaiRes.body), {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...CORS_HEADERS },
    });
  },
};
