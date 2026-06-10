// lib/ai/progression-ai.ts
// Phase 1.7: AI progression suggestion. Builds the 15-feature vector from SQLite, runs the
// trained ONNX classifier, and maps its action -> a ProgressionSuggestion. Returns null
// (caller falls back to the rule engine) for first-time exercises, low confidence, or any
// runtime failure. The model is trusted at confidence >= threshold in BOTH directions.
//
// IMPORTANT: this only produces the *displayed* suggestion. It never mutates progression_state
// (stall_count / ceiling), which stays 100% rule-engine-derived and recomputable from history.

import { PROGRESSION_DEFAULTS, getReasonMessage } from '@/lib/progression';
import type {
  Exercise,
  ProgressionReasonCode,
  ProgressionState,
  ProgressionSuggestion,
} from '@/lib/types';
import { buildProgressionFeatureVector } from './features';
import { runProgressionInference, type ProgressionAction } from './model-manager';
import type { ProgressionFeatureVector } from './types';

// Below this confidence we defer to the rule engine (matches ProgressionPrediction spec).
const CONFIDENCE_THRESHOLD = 0.6;

// Exact field order of ProgressionFeatureVector — MUST match train_model.py FEATURE_COLS
// and the order the ONNX input tensor expects.
const FEATURE_ORDER: (keyof ProgressionFeatureVector)[] = [
  'current_weight_lb', 'top_set_reps', 'top_set_rpe', 'working_set_count',
  'rep_range_min', 'rep_range_max', 'weight_jump_lb', 'stall_count',
  'progression_ceiling', 'prev_weight_lb', 'prev_top_reps', 'prev_rpe',
  'days_since_last', 'volume_trend_4wk', 'recovery_score',
];

type Decision = {
  suggestedWeightLb: number;
  currentCeiling: number;
  reasonCode: ProgressionReasonCode;
};

// Map a model action -> concrete weight/ceiling using the SAME mechanics as the rule engine
// (ratio-threshold triple progression, 10% reset). This keeps an AI "INCREASE" on a light
// isolation lift expanding the rep ceiling instead of making a too-large 5 lb jump.
function actionToDecision(
  action: ProgressionAction,
  state: ProgressionState,
  exercise: Exercise,
  weightJumpLb: number,
): Decision {
  const lastWeight = state.last_weight_lb as number;
  const repRangeMax = exercise.rep_range_max;
  const ceiling = Math.max(state.progression_ceiling || repRangeMax, repRangeMax);
  const { ratioThreshold, ceilingStep1, ceilingStep2, resetPct, resetRoundLb } = PROGRESSION_DEFAULTS;

  if (action === 'RESET') {
    const resetWeight = Math.round((lastWeight * resetPct) / resetRoundLb) * resetRoundLb;
    return { suggestedWeightLb: resetWeight, currentCeiling: repRangeMax, reasonCode: 'RESET_10PCT' };
  }

  if (action === 'HOLD') {
    return { suggestedWeightLb: lastWeight, currentCeiling: ceiling, reasonCode: 'HOLD_NOT_AT_CEILING' };
  }

  // INCREASE — respect the engine's ratio / triple-progression mechanics
  const ratio = lastWeight > 0 ? weightJumpLb / lastWeight : 1;
  if (ratio < ratioThreshold) {
    return { suggestedWeightLb: lastWeight + weightJumpLb, currentCeiling: repRangeMax, reasonCode: 'INCREASE' };
  }
  if (ceiling < ceilingStep1) {
    return { suggestedWeightLb: lastWeight, currentCeiling: ceilingStep1, reasonCode: 'EXPAND_CEILING_15' };
  }
  if (ceiling < ceilingStep2) {
    return { suggestedWeightLb: lastWeight, currentCeiling: ceilingStep2, reasonCode: 'EXPAND_CEILING_20' };
  }
  return { suggestedWeightLb: lastWeight + weightJumpLb, currentCeiling: repRangeMax, reasonCode: 'INCREASE_AFTER_20' };
}

/**
 * Returns an AI ProgressionSuggestion, or null to signal "use the rule engine":
 *   - first-time exercise (no feature vector) or missing state
 *   - model confidence < CONFIDENCE_THRESHOLD
 *   - any ONNX runtime failure (e.g. web, or model not loadable)
 */
export async function getAIProgressionSuggestion(
  exercise: Exercise,
  state: ProgressionState | null,
  weightJumpLb: number,
): Promise<ProgressionSuggestion | null> {
  if (!state || state.last_weight_lb == null) return null;

  const vec = await buildProgressionFeatureVector(exercise.id, weightJumpLb);
  if (!vec) return null; // first-time exercise → caller uses rule engine

  let result;
  try {
    result = await runProgressionInference(FEATURE_ORDER.map((k) => vec[k]));
  } catch (e) {
    console.warn('[ai] progression inference failed, falling back to rule engine:', e);
    return null;
  }
  if (result.confidence < CONFIDENCE_THRESHOLD) return null;

  const d = actionToDecision(result.action, state, exercise, weightJumpLb);
  return {
    exerciseId: exercise.id,
    suggestedWeightLb: d.suggestedWeightLb,
    currentCeiling: d.currentCeiling,
    reasonCode: d.reasonCode,
    reasonMessage: getReasonMessage(d.reasonCode, {
      weightJumpLb,
      currentCeiling: d.currentCeiling,
      suggestedWeight: d.suggestedWeightLb,
      stallCount: state.stall_count,
    }),
    source: 'ai',
    confidence: result.confidence,
  };
}
