// lib/repo/suggestions.ts
// Suggestion audit log: what the app recommended, and what the user actually did about it.
//
// WHY THIS EXISTS
// The sets table already records what was lifted. Nothing recorded what was *recommended*, and
// that half can't be recovered later:
//   - whether the ONNX model or the rule engine produced the number (confidence-gated, so it
//     varies session to session for the same exercise),
//   - the model's confidence at that moment,
//   - the weightJumpLb in effect, which lives in AsyncStorage, is user-editable, and is not
//     versioned — change it once and every past suggestion becomes unreconstructible.
//
// Pairing recommendation with outcome gives the Phase 1.3 retrain its strongest label: an
// override (user logs less than recommended) is the user saying the recommendation was wrong.
// See context-notes/ai_engine_plan.md §1.3.
//
// The log is append-only and local. It rides along in backups because it IS training data.

import { getDB } from '../db';
import { all, get, run } from '../sql';
import type { ProgressionState, ProgressionSuggestion } from '../types';
import { uuid } from './utils';

export interface SuggestionLogRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  suggested_weight_lb: number;
  suggested_ceiling: number;
  reason_code: string;
  source: 'ai' | 'rule_engine';
  confidence: number | null;
  model_version: string | null;
  weight_jump_lb: number;
  state_last_weight_lb: number | null;
  state_stall_count: number | null;
  state_ceiling: number | null;
  shown_at: number;
}

/**
 * Record a suggestion at the moment it is shown to the user.
 *
 * Idempotent per (workout, exercise): the UI recomputes suggestions on focus, swap, and set
 * entry, and only the FIRST one — the number the user actually reacted to — is the honest
 * label. INSERT OR IGNORE against the UNIQUE constraint keeps that one and drops the rest.
 *
 * Never throws: an audit log must not be able to break set logging.
 */
export async function recordSuggestionShown(args: {
  workoutId: string;
  exerciseId: string;
  suggestion: ProgressionSuggestion;
  weightJumpLb: number;
  state: ProgressionState | null;
  modelVersion?: string | null;
}): Promise<void> {
  try {
    const { workoutId, exerciseId, suggestion, weightJumpLb, state, modelVersion } = args;
    const db = await getDB();

    await run(
      db,
      `INSERT OR IGNORE INTO suggestion_log (
         id, workout_id, exercise_id, suggested_weight_lb, suggested_ceiling, reason_code,
         source, confidence, model_version, weight_jump_lb,
         state_last_weight_lb, state_stall_count, state_ceiling, shown_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        uuid(),
        workoutId,
        exerciseId,
        suggestion.suggestedWeightLb,
        suggestion.currentCeiling,
        suggestion.reasonCode,
        suggestion.source ?? 'rule_engine',
        suggestion.confidence ?? null,
        suggestion.source === 'ai' ? modelVersion ?? null : null,
        weightJumpLb,
        state?.last_weight_lb ?? null,
        state?.stall_count ?? null,
        state?.progression_ceiling ?? null,
        Date.now(),
      ]
    );
  } catch {
    // Deliberately silent. Losing one audit row is acceptable; failing a user's set is not.
  }
}

/** What the user actually did in response to a logged suggestion. */
export type SuggestionOutcome = 'followed' | 'went_heavier' | 'overrode_lighter' | 'not_attempted';

export interface SuggestionOutcomeRow {
  exerciseId: string;
  exerciseName: string;
  workoutId: string;
  shownAt: number;
  /** What was recommended. */
  suggestedWeightLb: number;
  suggestedCeiling: number;
  reasonCode: string;
  source: 'ai' | 'rule_engine';
  confidence: number | null;
  modelVersion: string | null;
  weightJumpLb: number;
  /** What actually happened, derived from the sets table. Null if the exercise was skipped. */
  actualTopWeightLb: number | null;
  actualTopReps: number | null;
  actualTopRpe: number | null;
  actualSetCount: number;
  outcome: SuggestionOutcome;
}

/**
 * Pair every logged suggestion with what was actually lifted in that same workout.
 *
 * Outcome is derived rather than stored, so editing a workout in History automatically corrects
 * the label instead of leaving a stale one behind. Only finished workouts are considered — an
 * in-progress session hasn't produced its answer yet.
 */
export async function getSuggestionOutcomes(limit = 500): Promise<SuggestionOutcomeRow[]> {
  const db = await getDB();
  const lim = Math.max(1, Math.min(5000, Math.floor(limit)));

  const rows = await all<{
    exercise_id: string;
    exercise_name: string;
    workout_id: string;
    shown_at: number;
    suggested_weight_lb: number;
    suggested_ceiling: number;
    reason_code: string;
    source: 'ai' | 'rule_engine';
    confidence: number | null;
    model_version: string | null;
    weight_jump_lb: number;
    actual_top_weight: number | null;
    actual_set_count: number;
  }>(
    db,
    `SELECT sl.exercise_id,
            e.name AS exercise_name,
            sl.workout_id,
            sl.shown_at,
            sl.suggested_weight_lb,
            sl.suggested_ceiling,
            sl.reason_code,
            sl.source,
            sl.confidence,
            sl.model_version,
            sl.weight_jump_lb,
            (SELECT MAX(s.weight_lb)
               FROM sets s
               JOIN workout_exercises we ON s.workout_exercise_id = we.id
              WHERE we.workout_id = sl.workout_id
                AND we.exercise_id = sl.exercise_id
                AND IFNULL(s.set_type, 'working') = 'working') AS actual_top_weight,
            (SELECT COUNT(s.id)
               FROM sets s
               JOIN workout_exercises we ON s.workout_exercise_id = we.id
              WHERE we.workout_id = sl.workout_id
                AND we.exercise_id = sl.exercise_id
                AND IFNULL(s.set_type, 'working') = 'working') AS actual_set_count
       FROM suggestion_log sl
       JOIN exercises e ON e.id = sl.exercise_id
       JOIN workouts w ON w.id = sl.workout_id
      WHERE w.ended_at IS NOT NULL
      ORDER BY sl.shown_at DESC
      LIMIT ${lim}`
  );

  const result: SuggestionOutcomeRow[] = [];

  for (const r of rows) {
    // Best set at the top weight: the reps/RPE that matter for labelling are the ones from the
    // heaviest working set, not an arbitrary one.
    let topReps: number | null = null;
    let topRpe: number | null = null;

    if (r.actual_top_weight !== null) {
      const top = await get<{ reps: number; rpe: number | null }>(
        db,
        `SELECT s.reps, s.rpe
           FROM sets s
           JOIN workout_exercises we ON s.workout_exercise_id = we.id
          WHERE we.workout_id = ? AND we.exercise_id = ?
            AND IFNULL(s.set_type, 'working') = 'working' AND s.weight_lb = ?
          ORDER BY s.reps DESC
          LIMIT 1`,
        [r.workout_id, r.exercise_id, r.actual_top_weight]
      );
      topReps = top?.reps ?? null;
      topRpe = top?.rpe ?? null;
    }

    result.push({
      exerciseId: r.exercise_id,
      exerciseName: r.exercise_name,
      workoutId: r.workout_id,
      shownAt: r.shown_at,
      suggestedWeightLb: r.suggested_weight_lb,
      suggestedCeiling: r.suggested_ceiling,
      reasonCode: r.reason_code,
      source: r.source,
      confidence: r.confidence,
      modelVersion: r.model_version,
      weightJumpLb: r.weight_jump_lb,
      actualTopWeightLb: r.actual_top_weight,
      actualTopReps: topReps,
      actualTopRpe: topRpe,
      actualSetCount: r.actual_set_count,
      outcome: classifyOutcome(r.suggested_weight_lb, r.actual_top_weight),
    });
  }

  return result;
}

/**
 * Compare recommendation to reality.
 *
 * The tolerance is half a pound rather than exact equality because weights round-trip through
 * REAL columns and text inputs; treating 134.9999 as an override would poison the label.
 */
function classifyOutcome(suggested: number, actual: number | null): SuggestionOutcome {
  if (actual === null) return 'not_attempted';
  const delta = actual - suggested;
  if (Math.abs(delta) < 0.5) return 'followed';
  return delta > 0 ? 'went_heavier' : 'overrode_lighter';
}

export interface SuggestionLogStats {
  totalLogged: number;
  withOutcome: number;
  followed: number;
  wentHeavier: number;
  overrodeLighter: number;
  notAttempted: number;
  bySource: { ai: number; rule_engine: number };
  distinctExercises: number;
  oldestAt: number | null;
  newestAt: number | null;
}

/**
 * Corpus health, for the Dev tools readout. `withOutcome` is the number that would actually
 * become training rows — that's the figure to watch accumulate, not `totalLogged`.
 */
export async function getSuggestionLogStats(): Promise<SuggestionLogStats> {
  const db = await getDB();

  const totals = await get<{
    total: number;
    ai: number;
    rule: number;
    exercises: number;
    oldest: number | null;
    newest: number | null;
  }>(
    db,
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN source = 'ai' THEN 1 ELSE 0 END) AS ai,
            SUM(CASE WHEN source = 'rule_engine' THEN 1 ELSE 0 END) AS rule,
            COUNT(DISTINCT exercise_id) AS exercises,
            MIN(shown_at) AS oldest,
            MAX(shown_at) AS newest
       FROM suggestion_log`
  );

  const outcomes = await getSuggestionOutcomes(5000);

  return {
    totalLogged: totals?.total ?? 0,
    withOutcome: outcomes.filter((o) => o.outcome !== 'not_attempted').length,
    followed: outcomes.filter((o) => o.outcome === 'followed').length,
    wentHeavier: outcomes.filter((o) => o.outcome === 'went_heavier').length,
    overrodeLighter: outcomes.filter((o) => o.outcome === 'overrode_lighter').length,
    notAttempted: outcomes.filter((o) => o.outcome === 'not_attempted').length,
    bySource: { ai: totals?.ai ?? 0, rule_engine: totals?.rule ?? 0 },
    distinctExercises: totals?.exercises ?? 0,
    oldestAt: totals?.oldest ?? null,
    newestAt: totals?.newest ?? null,
  };
}
