// lib/ai/features.ts
// Feature engineering — builds input vectors for both ONNX models from SQLite data.
//
// All functions return valid (non-null) vectors with sensible defaults so the
// models can always run. Callers never need to check for missing data.

import { getDB } from '@/lib/db';
import { MuscleGroup } from '@/lib/types';
import { runRecoveryInference } from './model-manager';
import { getRecoveryScore, upsertRecoveryScore } from './repo';
import { ProgressionFeatureVector, RecoveryFeatureVector } from './types';

// Default RPE when none is recorded (neutral/moderate effort)
const DEFAULT_RPE = 8.0;
// Neutral recovery score used when no score is cached
const NEUTRAL_RECOVERY_SCORE = 75;

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Least-squares linear regression slope over (x, y) pairs.
 * Returns 0 if fewer than 2 data points.
 */
function linearSlope(points: Array<{ x: number; y: number }>): number {
  const n = points.length;
  if (n < 2) return 0;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

/** Returns the top working set (highest weight) from an array of sets. */
function topWorkingSet(
  sets: Array<{ weight_lb: number; reps: number; rpe: number | null; set_type: string }>,
): { weight_lb: number; reps: number; rpe: number } | null {
  const working = sets.filter((s) => s.set_type === 'working');
  if (working.length === 0) return null;
  const top = working.reduce((best, s) => (s.weight_lb > best.weight_lb ? s : best));
  return { weight_lb: top.weight_lb, reps: top.reps, rpe: top.rpe ?? DEFAULT_RPE };
}

/** Counts working sets in an array. */
function workingSetCount(
  sets: Array<{ set_type: string }>,
): number {
  return sets.filter((s) => s.set_type === 'working').length;
}

// =============================================================================
// 4-week volume trend for a single exercise
// =============================================================================

/**
 * Returns the linear slope of working-set count per week over the past 4 weeks.
 * Positive = volume increasing, negative = decreasing, 0 = stable or insufficient data.
 */
async function computeVolumeTrend4wk(exerciseId: string): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const fourWeeksAgo = now - 28 * 24 * 60 * 60 * 1000;

  const rows = await db.getAllAsync<{ week_index: number; set_count: number }>(
    `SELECT
       CAST((w.started_at - ?) / (7 * 24 * 60 * 60 * 1000) AS INTEGER) AS week_index,
       COUNT(s.id) AS set_count
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE we.exercise_id = ?
       AND s.set_type = 'working'
       AND w.ended_at IS NOT NULL
       AND w.started_at >= ?
     GROUP BY week_index
     ORDER BY week_index ASC`,
    [fourWeeksAgo, exerciseId, fourWeeksAgo],
  );

  if (rows.length < 2) return 0;
  return linearSlope(rows.map((r) => ({ x: r.week_index, y: r.set_count })));
}

// =============================================================================
// 4-week volume trend for a muscle group
// =============================================================================

async function computeMuscleTrend4wk(muscleGroup: MuscleGroup): Promise<number> {
  const db = await getDB();
  const now = Date.now();
  const fourWeeksAgo = now - 28 * 24 * 60 * 60 * 1000;

  const rows = await db.getAllAsync<{ week_index: number; set_count: number }>(
    `SELECT
       CAST((w.started_at - ?) / (7 * 24 * 60 * 60 * 1000) AS INTEGER) AS week_index,
       COUNT(s.id) AS set_count
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN exercises e ON we.exercise_id = e.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE e.muscle_group = ?
       AND s.set_type = 'working'
       AND w.ended_at IS NOT NULL
       AND w.started_at >= ?
     GROUP BY week_index
     ORDER BY week_index ASC`,
    [fourWeeksAgo, muscleGroup, fourWeeksAgo],
  );

  if (rows.length < 2) return 0;
  return linearSlope(rows.map((r) => ({ x: r.week_index, y: r.set_count })));
}

// =============================================================================
// Progression Feature Vector (Model 1 input)
// =============================================================================

interface ExposureRow {
  workout_id: string;
  started_at: number;
  weight_lb: number;
  reps: number;
  rpe: number | null;
  set_type: string;
}

/**
 * Builds the 15-dimensional feature vector for the progressive overload model.
 *
 * @param exerciseId   The exercise to build features for.
 * @param weightJumpLb User's configured weight increment (from Settings).
 * @returns Feature vector, or null if this exercise has never been logged
 *          (so the rule engine can be used directly for the FIRST_TIME case).
 */
export async function buildProgressionFeatureVector(
  exerciseId: string,
  weightJumpLb: number,
): Promise<ProgressionFeatureVector | null> {
  const db = await getDB();

  // --- Exercise config ---
  const exercise = await db.getFirstAsync<{
    rep_range_min: number;
    rep_range_max: number;
    muscle_group: MuscleGroup;
  }>(
    `SELECT rep_range_min, rep_range_max, muscle_group FROM exercises WHERE id = ?`,
    [exerciseId],
  );
  if (!exercise) return null;

  // --- Progression state ---
  const state = await db.getFirstAsync<{
    last_weight_lb: number | null;
    stall_count: number;
    progression_ceiling: number;
  }>(
    `SELECT last_weight_lb, stall_count, progression_ceiling
     FROM progression_state WHERE exercise_id = ?`,
    [exerciseId],
  );

  // --- Two most recent completed exposures ---
  // Step 1: get the two most recent workout_exercise rows with ended workouts
  const recentWEs = await db.getAllAsync<{ we_id: string; workout_id: string; started_at: number }>(
    `SELECT we.id AS we_id, we.workout_id, w.started_at
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.exercise_id = ? AND w.ended_at IS NOT NULL
     ORDER BY w.started_at DESC
     LIMIT 10`,
    [exerciseId],
  );

  // Collect exposures (only those with at least one working set)
  const exposures: Array<{ workout_id: string; started_at: number; sets: ExposureRow[] }> = [];
  for (const we of recentWEs) {
    if (exposures.length >= 2) break;
    const sets = await db.getAllAsync<ExposureRow>(
      `SELECT ? AS workout_id, ? AS started_at, weight_lb, reps, rpe, set_type
       FROM sets WHERE workout_exercise_id = ? ORDER BY set_index ASC`,
      [we.workout_id, we.started_at, we.we_id],
    );
    const hasWorking = sets.some((s) => s.set_type === 'working');
    if (hasWorking) exposures.push({ workout_id: we.workout_id, started_at: we.started_at, sets });
  }

  // If there are no exposures, this exercise has never been logged — return null
  // so the caller knows to use the rule engine's FIRST_TIME path directly.
  if (exposures.length === 0) return null;

  const current = exposures[0];
  const previous = exposures[1] ?? null;

  const currentTop = topWorkingSet(current.sets);
  if (!currentTop) return null; // exposure exists but has no working sets (shouldn't happen)

  const prevTop = previous ? topWorkingSet(previous.sets) : null;

  // --- Days since last session ---
  const daysSinceLast =
    previous
      ? (current.started_at - previous.started_at) / (24 * 60 * 60 * 1000)
      : 0;

  // --- 4-week volume trend ---
  const volumeTrend4wk = await computeVolumeTrend4wk(exerciseId);

  // --- Recovery score for this muscle group ---
  const cachedScore = await getRecoveryScore(exercise.muscle_group);
  const recoveryScore = cachedScore?.score ?? NEUTRAL_RECOVERY_SCORE;

  return {
    current_weight_lb: currentTop.weight_lb,
    top_set_reps: currentTop.reps,
    top_set_rpe: currentTop.rpe,
    working_set_count: workingSetCount(current.sets),
    rep_range_min: exercise.rep_range_min,
    rep_range_max: exercise.rep_range_max,
    weight_jump_lb: weightJumpLb,
    stall_count: state?.stall_count ?? 0,
    progression_ceiling: state?.progression_ceiling ?? exercise.rep_range_max,
    prev_weight_lb: prevTop?.weight_lb ?? 0,
    prev_top_reps: prevTop?.reps ?? 0,
    prev_rpe: prevTop?.rpe ?? DEFAULT_RPE,
    days_since_last: daysSinceLast,
    volume_trend_4wk: volumeTrend4wk,
    recovery_score: recoveryScore,
  };
}

// =============================================================================
// Recovery Feature Vector (Model 2 input)
// =============================================================================

/**
 * Builds the 12-dimensional feature vector for the recovery readiness model.
 * Always returns a valid vector (never throws).
 */
export async function buildRecoveryFeatureVector(
  muscleGroup: MuscleGroup,
): Promise<RecoveryFeatureVector> {
  const db = await getDB();
  const now = Date.now();
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ms14d = 14 * 24 * 60 * 60 * 1000;
  const cutoff7d = now - ms7d;
  const cutoff14d = now - ms14d;

  // --- Working sets in last 7 and 14 days ---
  const sets7d = await db.getAllAsync<{ rpe: number | null; started_at: number }>(
    `SELECT s.rpe, w.started_at
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN exercises e ON we.exercise_id = e.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE e.muscle_group = ?
       AND s.set_type = 'working'
       AND w.ended_at IS NOT NULL
       AND w.started_at >= ?`,
    [muscleGroup, cutoff7d],
  );

  const sets14d = await db.getAllAsync<{ started_at: number }>(
    `SELECT w.started_at
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN exercises e ON we.exercise_id = e.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE e.muscle_group = ?
       AND s.set_type = 'working'
       AND w.ended_at IS NOT NULL
       AND w.started_at >= ? AND w.started_at < ?`,
    [muscleGroup, cutoff14d, cutoff7d],
  );

  const total_sets_7d = sets7d.length;
  const total_sets_14d = sets7d.length + sets14d.length;

  const rpesWithValues = sets7d.filter((s) => s.rpe !== null).map((s) => s.rpe as number);
  const avg_rpe_7d = rpesWithValues.length > 0
    ? rpesWithValues.reduce((a, b) => a + b, 0) / rpesWithValues.length
    : DEFAULT_RPE;
  const max_rpe_7d = rpesWithValues.length > 0
    ? Math.max(...rpesWithValues)
    : DEFAULT_RPE;

  // --- Unique sessions (distinct workout days) in last 7d ---
  const sessionDays = new Set(
    sets7d.map((s) => Math.floor(s.started_at / (24 * 60 * 60 * 1000))),
  );
  const sessions_7d = sessionDays.size;

  // --- Days since last session for this muscle group ---
  const lastSession = await db.getFirstAsync<{ started_at: number }>(
    `SELECT w.started_at
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN exercises e ON we.exercise_id = e.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE e.muscle_group = ?
       AND s.set_type = 'working'
       AND w.ended_at IS NOT NULL
     ORDER BY w.started_at DESC LIMIT 1`,
    [muscleGroup],
  );
  const days_since_last_session = lastSession
    ? (now - lastSession.started_at) / (24 * 60 * 60 * 1000)
    : 999; // never trained → very stale

  // --- Stall ratio across exercises in this muscle group ---
  const progressionStates = await db.getAllAsync<{ stall_count: number }>(
    `SELECT ps.stall_count
     FROM progression_state ps
     JOIN exercises e ON ps.exercise_id = e.id
     WHERE e.muscle_group = ?`,
    [muscleGroup],
  );
  const MAX_STALL = 3;
  const stall_ratio =
    progressionStates.length > 0
      ? progressionStates.reduce((s, r) => s + Math.min(r.stall_count / MAX_STALL, 1), 0) /
        progressionStates.length
      : 0;

  // --- Health samples ---
  const latestHRV = await db.getFirstAsync<{ value: number }>(
    `SELECT value FROM health_samples WHERE sample_type = 'hrv' ORDER BY recorded_at DESC LIMIT 1`,
  );
  const latestHR = await db.getFirstAsync<{ value: number }>(
    `SELECT value FROM health_samples WHERE sample_type = 'resting_hr' ORDER BY recorded_at DESC LIMIT 1`,
  );
  const sleepRows = await db.getAllAsync<{ value: number }>(
    `SELECT value FROM health_samples
     WHERE sample_type = 'sleep_duration' AND recorded_at >= ?
     ORDER BY recorded_at DESC LIMIT 7`,
    [cutoff7d],
  );

  const hrv_latest = latestHRV?.value ?? 0;
  const resting_hr_latest = latestHR?.value ?? 0;
  const sleep_hours_avg_7d =
    sleepRows.length > 0
      ? sleepRows.reduce((s, r) => s + r.value, 0) / sleepRows.length
      : 0;
  const has_health_data =
    hrv_latest > 0 || resting_hr_latest > 0 || sleep_hours_avg_7d > 0 ? 1 : 0;

  // --- 4-week volume trend ---
  const volume_trend_4wk = await computeMuscleTrend4wk(muscleGroup);

  return {
    total_sets_7d,
    total_sets_14d,
    avg_rpe_7d,
    max_rpe_7d,
    sessions_7d,
    days_since_last_session,
    stall_ratio,
    hrv_latest,
    resting_hr_latest,
    sleep_hours_avg_7d,
    volume_trend_4wk,
    has_health_data,
  };
}

// =============================================================================
// Heuristic recovery scoring (Phase 0 + Phase 3 fallback)
// =============================================================================
//
// Based on Israetel MEV/MRV landmarks and Nuckols volume recommendations.
// Used until the ONNX recovery model is trained and bundled (Phase 4).
// Score: 100 = fully recovered, 0 = severely fatigued.

/**
 * Computes a heuristic recovery score (0–100) from a RecoveryFeatureVector.
 * This is the pre-ONNX fallback used in Phase 0–3.
 */
export function computeHeuristicRecoveryScore(vec: RecoveryFeatureVector): number {
  let score = 100;

  // --- Volume fatigue (max –30) ---
  if (vec.total_sets_7d > 20) score -= 30;
  else if (vec.total_sets_7d > 15) score -= 20;
  else if (vec.total_sets_7d > 10) score -= 10;
  else if (vec.total_sets_7d > 5) score -= 4;

  // --- RPE fatigue (max –20) ---
  if (vec.avg_rpe_7d > 9.0) score -= 20;
  else if (vec.avg_rpe_7d > 8.5) score -= 12;
  else if (vec.avg_rpe_7d > 8.0) score -= 6;
  else if (vec.avg_rpe_7d > 7.5) score -= 2;

  // --- Recovery credit from rest (+/– 20) ---
  if (vec.days_since_last_session >= 5) score += 15;
  else if (vec.days_since_last_session >= 3) score += 8;
  else if (vec.days_since_last_session >= 2) score += 3;
  else if (vec.days_since_last_session < 1) score -= 10;

  // --- Stall fatigue indicator (max –15) ---
  if (vec.stall_ratio > 0.6) score -= 15;
  else if (vec.stall_ratio > 0.4) score -= 8;
  else if (vec.stall_ratio > 0.2) score -= 3;

  // --- Volume trend (max –10 / +5) ---
  if (vec.volume_trend_4wk > 3) score -= 10;  // sharp ramp-up → fatigue accumulation
  else if (vec.volume_trend_4wk > 1.5) score -= 5;
  else if (vec.volume_trend_4wk < -1) score += 5; // tapering → recovering

  // --- Health signals (only applied when data is present) ---
  if (vec.has_health_data) {
    // HRV — lower than usual = fatigued, higher = recovered
    const HRV_BASELINE = 65; // ms population average
    if (vec.hrv_latest > 0) {
      const hrvRatio = vec.hrv_latest / HRV_BASELINE;
      if (hrvRatio < 0.7) score -= 12;
      else if (hrvRatio < 0.85) score -= 6;
      else if (hrvRatio > 1.2) score += 5;
    }

    // Resting HR — elevated HR = fatigued
    const HR_BASELINE = 65; // bpm population average
    if (vec.resting_hr_latest > 0) {
      const hrRatio = vec.resting_hr_latest / HR_BASELINE;
      if (hrRatio > 1.15) score -= 8;
      else if (hrRatio > 1.07) score -= 4;
      else if (hrRatio < 0.92) score += 3;
    }

    // Sleep — < 6h impairs recovery significantly
    if (vec.sleep_hours_avg_7d > 0) {
      if (vec.sleep_hours_avg_7d < 5.5) score -= 15;
      else if (vec.sleep_hours_avg_7d < 6.5) score -= 8;
      else if (vec.sleep_hours_avg_7d < 7.0) score -= 3;
      else if (vec.sleep_hours_avg_7d >= 8.0) score += 5;
    }
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

// =============================================================================
// Batch recovery score computation
// =============================================================================

const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'shoulder', 'tricep', 'bicep',
  'quads', 'hamstrings', 'glutes', 'calves',
  'core', 'lower_back', 'upper_back', 'lats',
];

// RecoveryFeatureVector field order — MUST match the recovery model's training/export
// (scripts/train_recovery_model) and the ONNX input tensor.
const RECOVERY_FEATURE_ORDER: (keyof RecoveryFeatureVector)[] = [
  'total_sets_7d', 'total_sets_14d', 'avg_rpe_7d', 'max_rpe_7d', 'sessions_7d',
  'days_since_last_session', 'stall_ratio', 'hrv_latest', 'resting_hr_latest',
  'sleep_hours_avg_7d', 'volume_trend_4wk', 'has_health_data',
];

/**
 * Computes and caches recovery scores for all 12 muscle groups (Phase 4).
 * Tries the ONNX recovery model first (model_version 'onnx_v1'); on any failure
 * (web, model unloadable, etc.) falls back to the heuristic ('heuristic').
 * Called by AIContext on mount and after each workout completion.
 */
export async function computeAndCacheAllRecoveryScores(): Promise<void> {
  for (const muscleGroup of ALL_MUSCLE_GROUPS) {
    try {
      const vec = await buildRecoveryFeatureVector(muscleGroup);
      let score: number;
      let modelVersion: string;
      try {
        score = await runRecoveryInference(RECOVERY_FEATURE_ORDER.map((k) => vec[k]));
        modelVersion = 'onnx_v1';
      } catch {
        score = computeHeuristicRecoveryScore(vec);
        modelVersion = 'heuristic';
      }
      await upsertRecoveryScore(muscleGroup, score, modelVersion);
    } catch (e) {
      console.warn(`Failed to compute recovery score for ${muscleGroup}:`, e);
    }
  }
}
