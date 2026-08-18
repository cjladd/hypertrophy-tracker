// lib/ai/llm-insights.ts
// Phase 7.4: model-written proactive coaching insights.
//
// The template generators in coaching.ts detect a trigger and compose a fallback message.
// `maybeLLMInsight` wraps the final write: when the trainer proxy is configured AND the user
// has enabled trainer insights (ai_settings.llm_enabled), it asks the model for a short,
// grounded note and stores it as source:'llm'. Otherwise — or on timeout/error — it stores the
// template text as source:'template'. Same triggers, same dedup, richer output when available.

import { runTrainerCompletion } from './llm';
import { insertInsight, getAISettings } from './repo';
import { isProxyConfigured } from './trainer-config';
import type { CoachingInsight, InsightType } from './types';
import type { MuscleGroup } from '@/lib/types';

const LLM_TIMEOUT_MS = 5000;
const INSIGHT_MAX_TOKENS = 120;

interface InsightTarget {
  muscle_group?: MuscleGroup;
  exercise_id?: string;
}

/** LLM insights require both a configured proxy and the user opt-in flag. */
async function llmInsightsEnabled(): Promise<boolean> {
  if (!isProxyConfigured()) return false;
  try {
    return (await getAISettings()).llm_enabled;
  } catch {
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('llm insight timed out')), ms)),
  ]);
}

function directive(triggerDescription: string): string {
  return (
    'In 1-2 sentences (under 40 words), write a direct, encouraging coaching note for the user ' +
    'about the following, grounded in their data above. No preamble, no markdown, no quotes.\n\n' +
    `What just happened: ${triggerDescription}`
  );
}

/**
 * Writes a coaching insight — model-generated when enabled, template otherwise. `triggerDescription`
 * is the plain-English situation handed to the model; `fallbackContent` is the template text used
 * when the LLM path is off or unavailable.
 */
export async function maybeLLMInsight(
  insight_type: InsightType,
  triggerDescription: string,
  fallbackContent: string,
  options: InsightTarget = {},
): Promise<CoachingInsight> {
  if (await llmInsightsEnabled()) {
    try {
      const note = await withTimeout(
        runTrainerCompletion(directive(triggerDescription), {
          exerciseId: options.exercise_id,
          maxTokens: INSIGHT_MAX_TOKENS,
        }),
        LLM_TIMEOUT_MS,
      );
      const clean = note.trim();
      if (clean) return insertInsight(insight_type, clean, 'llm', options);
    } catch {
      // fall through to the template
    }
  }
  return insertInsight(insight_type, fallbackContent, 'template', options);
}
