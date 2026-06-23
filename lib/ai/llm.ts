// lib/ai/llm.ts
// Phase 7.3: the Personal Trainer Bot's query layer.
//
// `buildTrainerContext` (llm-context.ts) assembles a grounded prompt ON-DEVICE from SQLite.
// This module is the thin boundary that turns a user question + that context into a streamed
// answer. Today it runs against a LOCAL MOCK so the whole flow — context builder → streaming
// → chat UI — is real and testable with zero cloud cost or secrets. When the backend proxy
// lands, only `runTrainerQuery` changes; the UI and context builder stay put.

import { buildTrainerContext } from './llm-context';

// Flip to false once a real proxy endpoint is wired. Kept explicit so it's obvious in dev
// that answers are synthesized locally, not from a hosted model.
export const TRAINER_BOT_MOCK = true;

export interface TrainerQueryOptions {
  // When the user is asking about a specific lift, its recommendation/reasoning is appended
  // to the grounded context.
  exerciseId?: string;
}

/**
 * Whether the trainer bot can answer right now. In mock mode it's always available (no
 * network needed). Once the cloud proxy exists this will check connectivity + entitlement.
 */
export function isTrainerBotAvailable(): boolean {
  return TRAINER_BOT_MOCK; // always on in dev; real check added with the proxy
}

// =============================================================================
// Mock answer synthesis (dev only)
// =============================================================================
//
// Pulls the relevant block(s) straight out of the grounded context so a developer can SEE,
// end-to-end, that the bot is grounded in this user's real data. Deliberately not "smart" —
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
      parts.push('Use recovery to pick today\'s focus — freshest muscles first:');
      parts.push(recovery);
    }
    if (recent) {
      parts.push('And what you\'ve already hit recently:');
      parts.push(recent);
    }
  } else if (/stall|plateau|stuck|not progress/.test(q)) {
    if (progression) {
      parts.push('Here\'s where your lifts stand — watch the stalled ones:');
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
    '_(Local preview — answers are grounded in your data but generated on-device. Full coaching arrives when the trainer model is connected.)_',
  );

  return parts.join('\n\n');
}

// =============================================================================
// Public query API
// =============================================================================

/**
 * Streams the trainer's answer to `question`, grounded in the user's on-device data.
 * Yields incremental text chunks (append them as they arrive). In mock mode the answer is
 * synthesized locally; the streaming shape matches what a real token stream will deliver.
 */
export async function* runTrainerQuery(
  question: string,
  options: TrainerQueryOptions = {},
): AsyncGenerator<string, void, unknown> {
  const context = await buildTrainerContext(options.exerciseId);

  if (!TRAINER_BOT_MOCK) {
    // Placeholder for the real proxy call: POST { question, context } and yield streamed
    // tokens. Intentionally unreachable until the backend exists.
    throw new Error('Trainer bot proxy not configured');
  }

  const answer = synthesizeMockAnswer(question, context, !!options.exerciseId);

  // Stream word-by-word to exercise the incremental-render path the real model will use.
  const tokens = answer.match(/\S+\s*/g) ?? [answer];
  for (const token of tokens) {
    await new Promise((r) => setTimeout(r, 18));
    yield token;
  }
}
