// lib/progression.ts
// Progression Engine implementation
// Deterministic rules that map logged sets -> next-session suggestion

import type {
  Exercise,
  ProgressionReasonCode,
  ProgressionState,
  ProgressionSuggestion,
  Set,
} from './types';

// ============================================================================
// §2 Parameters (defaults)
// ============================================================================

export const PROGRESSION_DEFAULTS = {
  weightJumpLb: 5,           // User setting (global)
  repRangeMin: 8,            // Per-exercise setting
  repRangeMax: 12,           // Per-exercise setting
  rpeSoftGate: 9.5,          // Soft gate for RPE
  ratioThreshold: 0.10,      // If increment/weight >= 0.10, jump is "too large"
  ceilingStep1: 15,          // First rep-ceiling expansion target
  ceilingStep2: 20,          // Second rep-ceiling expansion target
  stallThreshold: 3,         // 3 consecutive non-success exposures triggers reset
  resetPct: 0.90,            // Reset weight is 10% reduction
  resetRoundLb: 5,           // Reset weight rounds to nearest 5 lb
  warmupRpeThreshold: 6,     // Sets with RPE <= 6 are considered warm-ups
} as const;

// ============================================================================
// §4 RPE Handling (sanitization + imputation)
// ============================================================================

/**
 * Get effective RPE for a set
 * - Returns actual RPE if present
 * - Returns null if unknown (do not impute values)
 */
export function imputeRPE(set: Set): number | null {
  return set.rpe;
}

/**
 * Get UI anchor string for RPE value
 */
export function getRPEAnchorLabel(rpe: number): string {
  if (rpe >= 10) return "Could not do another rep";
  if (rpe >= 9) return "Could do 1 more rep";
  if (rpe >= 8) return "Could do 2 more reps";
  return "Warm-up / speed work";
}

// ============================================================================
// §5 Success Evaluation (top-set driven)
// ============================================================================

export interface SuccessEvaluation {
  success: boolean;
  conditionalSuccess: boolean;  // A && C true but RPE=10
  topSet: Set;
  topReps: number;
  imputedRpe: number | null;
  hasBackoff: boolean;
  failureReason?: 'NOT_AT_CEILING' | 'RPE_TOO_HIGH' | 'NOT_ENOUGH_SETS';
}

/**
 * Evaluate success for an exposure
 * Top-set driven with guardrail against "one-set wonders"
 */
export function evaluateSuccess(
  sets: Set[],
  progressionCeiling: number,
  repRangeMin: number
): SuccessEvaluation {
  if (sets.length === 0) {
    throw new Error('Cannot evaluate success with no sets');
  }

  // Filter out warm-up sets (explicitly marked)
  const workingSets = sets.filter(s => s.set_type !== 'warmup');

  // Fallback: If all sets were warm-ups, use the original sets (first set)
  // This prevents crashing if user only did light work
  const efficientSets = workingSets.length > 0 ? workingSets : sets;

  const topSet = efficientSets[0];
  const hasBackoff = efficientSets.length >= 2;
  const topReps = topSet.reps;
  const imputedRpe = imputeRPE(topSet);

  // Success conditions:
  // A (Reps): topReps >= ceiling
  // B (RPE soft gate): topRpe <= rpeSoftGate OR topRpe is Unknown (benefit of doubt)
  // C (Volume): hasBackoff == true
  const conditionA = topReps >= progressionCeiling;
  const conditionB = imputedRpe === null || imputedRpe <= PROGRESSION_DEFAULTS.rpeSoftGate;
  const conditionC = hasBackoff;

  const success = conditionA && conditionB && conditionC;

  // RPE=10 progress trap handling (conditional success)
  // If A && C are true but topRpe == 10, allow progression with watch flag
  const conditionalSuccess = conditionA && conditionC && imputedRpe === 10 && !success;

  // Determine failure reason if not success
  let failureReason: SuccessEvaluation['failureReason'];
  if (!success && !conditionalSuccess) {
    if (!conditionA) {
      failureReason = 'NOT_AT_CEILING';
    } else if (!conditionB) {
      failureReason = 'RPE_TOO_HIGH';
    } else if (!conditionC) {
      failureReason = 'NOT_ENOUGH_SETS';
    }
  }

  return {
    success,
    conditionalSuccess,
    topSet,
    topReps,
    imputedRpe,
    hasBackoff,
    failureReason,
  };
}

// ============================================================================
// §6-7 Progression Decision
// ============================================================================

export interface ProgressionDecision {
  nextWeightLb: number;
  newStallCount: number;
  newProgressionCeiling: number;
  setWatchNextExposure: boolean;
  reasonCode: ProgressionReasonCode;
}

/**
 * Round weight to nearest increment (default 5 lb)
 */
export function roundToNearest(value: number, roundTo: number): number {
  return Math.round(value / roundTo) * roundTo;
}

/**
 * Make progression decision based on success evaluation
 */
export function makeProgressionDecision(
  evaluation: SuccessEvaluation,
  currentState: {
    lastWeightLb: number;
    stallCount: number;
    progressionCeiling: number;
    watchNextExposure: boolean;
  },
  exercise: Pick<Exercise, 'rep_range_min' | 'rep_range_max'>,
  weightJumpLb: number = PROGRESSION_DEFAULTS.weightJumpLb
): ProgressionDecision {
  const { lastWeightLb, stallCount, progressionCeiling, watchNextExposure } = currentState;
  const { success, conditionalSuccess, topReps, failureReason } = evaluation;
  const repRangeMax = exercise.rep_range_max;
  const repRangeMin = exercise.rep_range_min;

  // §8 Watch mode: detecting false positives after RPE=10 progression
  if (watchNextExposure && topReps < repRangeMin) {
    // Clear drop below minimum - treat prior progression as false positive
    const resetWeight = roundToNearest(lastWeightLb * PROGRESSION_DEFAULTS.resetPct, PROGRESSION_DEFAULTS.resetRoundLb);
    return {
      nextWeightLb: resetWeight,
      newStallCount: 0,
      newProgressionCeiling: repRangeMax,
      setWatchNextExposure: false,
      reasonCode: 'RESET_AFTER_DROP',
    };
  }

  // Invalid weight edge case
  if (lastWeightLb <= 0) {
    return {
      nextWeightLb: lastWeightLb,
      newStallCount: stallCount,
      newProgressionCeiling: progressionCeiling,
      setWatchNextExposure: false,
      reasonCode: 'HOLD_NOT_AT_CEILING',
    };
  }

  const ratio = weightJumpLb / lastWeightLb;

  // §6.1 If success or conditional success
  if (success || conditionalSuccess) {
    // Case 1: normal increments (ratio < ratioThreshold)
    if (ratio < PROGRESSION_DEFAULTS.ratioThreshold) {
      return {
        nextWeightLb: lastWeightLb + weightJumpLb,
        newStallCount: 0,
        newProgressionCeiling: repRangeMax,
        setWatchNextExposure: conditionalSuccess, // Set watch if RPE=10 progression
        reasonCode: 'INCREASE',
      };
    }

    // Case 2: jump too large (ratio >= ratioThreshold) — triple progression
    if (progressionCeiling < PROGRESSION_DEFAULTS.ceilingStep1) {
      return {
        nextWeightLb: lastWeightLb,
        newStallCount: 0,
        newProgressionCeiling: PROGRESSION_DEFAULTS.ceilingStep1,
        setWatchNextExposure: conditionalSuccess,
        reasonCode: 'EXPAND_CEILING_15',
      };
    } else if (progressionCeiling < PROGRESSION_DEFAULTS.ceilingStep2) {
      return {
        nextWeightLb: lastWeightLb,
        newStallCount: 0,
        newProgressionCeiling: PROGRESSION_DEFAULTS.ceilingStep2,
        setWatchNextExposure: conditionalSuccess,
        reasonCode: 'EXPAND_CEILING_20',
      };
    } else {
      // progressionCeiling >= 20, finally increment
      return {
        nextWeightLb: lastWeightLb + weightJumpLb,
        newStallCount: 0,
        newProgressionCeiling: repRangeMax,
        setWatchNextExposure: conditionalSuccess,
        reasonCode: 'INCREASE_AFTER_20',
      };
    }
  }

  // §6.2 If success == false: HOLD
  const newStallCount = stallCount + 1;

  // §7 Stall management: if stall count reaches threshold, trigger reset
  if (newStallCount >= PROGRESSION_DEFAULTS.stallThreshold) {
    const resetWeight = roundToNearest(lastWeightLb * PROGRESSION_DEFAULTS.resetPct, PROGRESSION_DEFAULTS.resetRoundLb);
    return {
      nextWeightLb: resetWeight,
      newStallCount: 0,
      newProgressionCeiling: repRangeMax,
      setWatchNextExposure: false,
      reasonCode: 'RESET_10PCT',
    };
  }

  // Hold with appropriate reason code
  let reasonCode: ProgressionReasonCode;
  switch (failureReason) {
    case 'NOT_AT_CEILING':
      reasonCode = 'HOLD_NOT_AT_CEILING';
      break;
    case 'RPE_TOO_HIGH':
      reasonCode = 'HOLD_RPE_TOO_HIGH';
      break;
    case 'NOT_ENOUGH_SETS':
      reasonCode = 'HOLD_NOT_ENOUGH_SETS';
      break;
    default:
      reasonCode = 'HOLD_NOT_AT_CEILING';
  }

  return {
    nextWeightLb: lastWeightLb,
    newStallCount,
    newProgressionCeiling: progressionCeiling,
    setWatchNextExposure: false,
    reasonCode,
  };
}

// ============================================================================
// §11 Reason Code Messages for UI
// ============================================================================

/**
 * Get human-readable message for a reason code
 */
export function getReasonMessage(
  reasonCode: ProgressionReasonCode,
  context?: {
    weightJumpLb?: number;
    currentCeiling?: number;
    newCeiling?: number;
    suggestedWeight?: number;
    stallCount?: number;
  }
): string {
  switch (reasonCode) {
    case 'INCREASE':
      return `Great work! Add ${context?.weightJumpLb ?? 5} lb.`;
    case 'EXPAND_CEILING_15':
      return `Weight jump is large relative to load. Build to 15 reps before adding weight.`;
    case 'EXPAND_CEILING_20':
      return `Keep building strength. Hit 20 reps before adding weight.`;
    case 'INCREASE_AFTER_20':
      return `Excellent endurance! Time to add ${context?.weightJumpLb ?? 5} lb and reset to your base rep range.`;
    case 'HOLD_NOT_AT_CEILING':
      return `Keep pushing! Hit ${context?.currentCeiling ?? 12} reps to progress.`;
    case 'HOLD_RPE_TOO_HIGH':
      return `Good reps, but RPE was high. Nail this weight with more in reserve.`;
    case 'HOLD_NOT_ENOUGH_SETS':
      return `Add a second set to confirm strength before progressing.`;
    case 'RESET_10PCT':
      return `Plateau detected. Resetting load by 10% to rebuild momentum.`;
    case 'RESET_AFTER_DROP':
      return `Performance dropped after last increase. Resetting to rebuild.`;
    case 'FIRST_TIME':
      return `First time? Start with a weight you can do for ${context?.currentCeiling ?? 12} reps.`;
    default:
      return '';
  }
}

// ============================================================================
// Exposure Processing (for recomputation)
// ============================================================================

export interface ExposureData {
  workoutId: string;
  workoutStartedAt: number;
  sets: Set[];
}

/**
 * Process a single exposure and return updated state
 * Used for both real-time updates and historical recomputation
 */
export function processExposure(
  exposure: ExposureData,
  currentState: ProgressionState,
  exercise: Pick<Exercise, 'rep_range_min' | 'rep_range_max'>,
  weightJumpLb: number
): ProgressionState {
  if (exposure.sets.length === 0) {
    return currentState;
  }

  const ceiling = Math.max(
    currentState.progression_ceiling || exercise.rep_range_max,
    exercise.rep_range_max
  );

  const evaluation = evaluateSuccess(exposure.sets, ceiling, exercise.rep_range_min);
  const topSet = evaluation.topSet;

  const decision = makeProgressionDecision(
    evaluation,
    {
      lastWeightLb: topSet.weight_lb, // Use current exposure's top set weight
      stallCount: currentState.stall_count,
      progressionCeiling: ceiling,
      watchNextExposure: currentState.watch_next_exposure === 1,
    },
    exercise,
    weightJumpLb
  );

  return {
    exercise_id: currentState.exercise_id,
    last_weight_lb: topSet.weight_lb,
    stall_count: decision.newStallCount,
    progression_ceiling: decision.newProgressionCeiling,
    watch_next_exposure: decision.setWatchNextExposure ? 1 : 0,
  };
}

/**
 * Get initial progression state for an exercise (no prior history)
 */
export function getInitialProgressionState(
  exerciseId: string,
  repRangeMax: number
): ProgressionState {
  return {
    exercise_id: exerciseId,
    last_weight_lb: null,
    stall_count: 0,
    progression_ceiling: repRangeMax,
    watch_next_exposure: 0,
  };
}

/**
 * Generate a progression suggestion for UI display
 */
export function generateSuggestion(
  exercise: Exercise,
  state: ProgressionState | null,
  lastExposureSets: Set[] | null,
  weightJumpLb: number
): ProgressionSuggestion {
  const repRangeMax = exercise.rep_range_max;

  // First time - no prior data
  if (!state || state.last_weight_lb === null || !lastExposureSets || lastExposureSets.length === 0) {
    return {
      exerciseId: exercise.id,
      suggestedWeightLb: 0, // User picks starting weight
      currentCeiling: repRangeMax,
      reasonCode: 'FIRST_TIME',
      reasonMessage: getReasonMessage('FIRST_TIME', { currentCeiling: repRangeMax }),
    };
  }

  const ceiling = Math.max(state.progression_ceiling || repRangeMax, repRangeMax);
  const evaluation = evaluateSuccess(lastExposureSets, ceiling, exercise.rep_range_min);

  const decision = makeProgressionDecision(
    evaluation,
    {
      lastWeightLb: state.last_weight_lb,
      stallCount: state.stall_count,
      progressionCeiling: ceiling,
      watchNextExposure: state.watch_next_exposure === 1,
    },
    exercise,
    weightJumpLb
  );

  return {
    exerciseId: exercise.id,
    suggestedWeightLb: decision.nextWeightLb,
    currentCeiling: decision.newProgressionCeiling,
    reasonCode: decision.reasonCode,
    reasonMessage: getReasonMessage(decision.reasonCode, {
      weightJumpLb,
      currentCeiling: decision.newProgressionCeiling,
      suggestedWeight: decision.nextWeightLb,
      stallCount: decision.newStallCount,
    }),
  };
}
