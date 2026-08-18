// lib/ai/llm.ts
// Phase 7: the Personal Trainer Bot's query layer.
//
// `buildTrainerContext` (llm-context.ts) assembles a grounded prompt ON-DEVICE from SQLite.
// This module turns a user question + that context into a streamed answer. When a backend
// proxy is configured (EXPO_PUBLIC_TRAINER_PROXY_URL), it streams the real model (gpt-4o-mini)
// through the proxy — the OpenAI key never touches the device. With no proxy configured it
// falls back to a LOCAL MOCK so the whole pipe (context → stream → UI) stays testable in dev
// with zero setup. Only the final grounded string ever leaves the device.

import { fetch as streamFetch } from 'expo/fetch';
import { buildTrainerContext } from './llm-context';
import { getProxyConfig, isProxyConfigured } from './trainer-config';

const CHAT_MAX_TOKENS = 800;
const INSIGHT_MAX_TOKENS = 120;

export interface TrainerQueryOptions {
  // When the user is asking about a specific lift, its recommendation/reasoning is appended
  // to the grounded context.
  exerciseId?: string;
}

/**
 * Whether the trainer bot can answer right now. Always true: it uses the proxy when configured
 * and the on-device mock otherwise.
 */
export function isTrainerBotAvailable(): boolean {
  return true;
}

// =============================================================================
// Proxy transport
// =============================================================================

async function postToProxy(
  system: string,
  question: string,
  stream: boolean,
  maxTokens: number,
) {
  const cfg = getProxyConfig();
  if (!cfg) throw new Error('Trainer proxy not configured');
  return streamFetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ system, question, stream, maxTokens }),
  });
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function friendlyError(status: number, detail: string): string {
  if (status === 401) return 'Trainer access is not authorized. Check the app configuration.';
  if (status === 429) return "You've hit today's question limit. Try again tomorrow.";
  return `Trainer is unavailable right now (${status}). ${detail.slice(0, 200)}`.trim();
}

// =============================================================================
// Mock answer synthesis (dev fallback when no proxy is configured)
// =============================================================================
//
// Pulls the relevant block(s) straight out of the grounded context so a developer can SEE,
// end-to-end, that the pipe is grounded in this user's real data. Deliberately not "smart" —
// it routes the question to the right section and quotes it. The real model replaces this.

/** Splits the grounded context into header -> body sections. */
function parseContextBlocks(context: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const chunk of context.split('\n\n')) {
    const newline = chunk.indexOf('\n');
    if (newline === -1) continue; // IDENTITY line, no body
    const header = chunk.slice(0, newline).trim();
    const body = chunk.slice(newline + 1).trim();
    blocks.set(header, body);
  }
  return blocks;
}

/** Finds the first block whose header starts with `prefix`. */
function findBlock(blocks: Map<string, string>, prefix: string): string | null {
  for (const [header, body] of blocks) {
    if (header.startsWith(prefix)) return body;
  }
  return null;
}

function synthesizeMockAnswer(question: string, context: string, hasExercise: boolean): string {
  const blocks = parseContextBlocks(context);
  const q = question.toLowerCase();

  const recovery = findBlock(blocks, 'RECOVERY');
  const recent = findBlock(blocks, 'RECENT TRAINING');
  const progression = findBlock(blocks, 'PROGRESSION STATE');
  const signals = findBlock(blocks, 'ACTIVE SIGNALS');
  const recommendation = findBlock(blocks, 'CURRENT RECOMMENDATION');

  const parts: string[] = [];

  if (hasExercise || /\bwhy\b|weight|heavy|load|how much/.test(q)) {
    if (recommendation) {
      parts.push("Here's what the app is recommending and why:");
      parts.push(recommendation);
    } else if (progression) {
      parts.push('Based on your recent progression:');
      parts.push(progression);
    }
  } else if (/recover|sore|ready|fatigue|rest|tired/.test(q)) {
    if (recovery) {
      parts.push('Your recovery by muscle group right now:');
      parts.push(recovery);
    }
  } else if (/train|today|workout|what should|do next/.test(q)) {
    if (recovery) {
      parts.push("Use recovery to pick today's focus — freshest muscles first:");
      parts.push(recovery);
    }
    if (recent) {
      parts.push("And what you've already hit recently:");
      parts.push(recent);
    }
  } else if (/stall|plateau|stuck|not progress/.test(q)) {
    if (progression) {
      parts.push("Here's where your lifts stand — watch the stalled ones:");
      parts.push(progression);
    }
    if (signals) {
      parts.push('Active signals worth noting:');
      parts.push(signals);
    }
  } else if (/volume|sets|how much work/.test(q)) {
    if (recent) {
      parts.push('Your logged volume over the last two weeks:');
      parts.push(recent);
    }
  }

  // Fallback: a grounded snapshot.
  if (parts.length === 0) {
    if (recovery) {
      parts.push('Quick read on your current state:');
      parts.push(recovery);
    }
    if (recent) {
      parts.push('Recent training:');
      parts.push(recent);
    }
    if (parts.length === 0) {
      parts.push(
        "I don't have enough logged data yet to answer from your history. Log a few workouts and ask again.",
      );
    }
  }

  parts.push(
    '_(Local preview — answers are grounded in your data but generated on-device. Connect the trainer proxy for full coaching.)_',
  );

  return parts.join('\n\n');
}

/** Streams the mock answer word-by-word to exercise the incremental-render path. */
async function* mockStream(
  question: string,
  context: string,
  hasExercise: boolean,
): AsyncGenerator<string, void, unknown> {
  const answer = synthesizeMockAnswer(question, context, hasExercise);
  const tokens = answer.match(/\S+\s*/g) ?? [answer];
  for (const token of tokens) {
    await new Promise((r) => setTimeout(r, 18));
    yield token;
  }
}

// =============================================================================
// Public query API
// =============================================================================

/**
 * Streams the trainer's answer to `question`, grounded in the user's on-device data.
 * Yields incremental text chunks (append them as they arrive). Uses the backend proxy when
 * configured; otherwise synthesizes a grounded answer locally.
 */
export async function* runTrainerQuery(
  question: string,
  options: TrainerQueryOptions = {},
): AsyncGenerator<string, void, unknown> {
  const context = await buildTrainerContext(options.exerciseId);

  if (!isProxyConfigured()) {
    yield* mockStream(question, context, !!options.exerciseId);
    return;
  }

  const res = await postToProxy(context, question, true, CHAT_MAX_TOKENS);
  if (!res.ok) {
    throw new Error(friendlyError(res.status, await safeText(res)));
  }

  const body = res.body;
  // Graceful fallback if this runtime doesn't expose a readable stream (e.g. Expo Go).
  if (!body || typeof body.getReader !== 'function') {
    const text = await res.text();
    if (text) yield text;
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) yield chunk;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}

/**
 * One-shot (non-streaming) trainer completion, grounded in the user's data. Used by the
 * proactive-insight generator (7.4). Throws if no proxy is configured — callers gate on
 * `isProxyConfigured()` first and fall back to templates.
 */
export async function runTrainerCompletion(
  question: string,
  options: { exerciseId?: string; maxTokens?: number } = {},
): Promise<string> {
  if (!isProxyConfigured()) throw new Error('Trainer proxy not configured');
  const context = await buildTrainerContext(options.exerciseId);
  const res = await postToProxy(context, question, false, options.maxTokens ?? INSIGHT_MAX_TOKENS);
  if (!res.ok) {
    throw new Error(friendlyError(res.status, await safeText(res)));
  }
  return (await res.text()).trim();
}
