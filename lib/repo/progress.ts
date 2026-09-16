// Progression logic interaction + Charts
import { getDB } from '../db';
import { ExposureData, generateSuggestion, getInitialProgressionState, processExposure } from '../progression';
import { all, get, run } from '../sql';
import { Exercise, ProgressionState, ProgressionSuggestion, Set, Settings } from '../types';
import { getAIProgressionSuggestion } from '../ai/progression-ai';
import { PROGRESSION_MODEL_VERSION } from '../ai/model-manager';
import { getSettings } from './settings';
import { recordSuggestionShown } from './suggestions';

// ============================================
// PROGRESSION STATE
// ============================================

/**
 * Get progression state for an exercise
 */
export async function getProgressionState(exerciseId: string): Promise<ProgressionState | null> {
  const db = await getDB();
  return await get<ProgressionState>(
    db,
    'SELECT exercise_id, last_weight_lb, stall_count, progression_ceiling, watch_next_exposure FROM progression_state WHERE exercise_id = ?',
    [exerciseId]
  );
}

/**
 * Upsert progression state for an exercise
 */
export async function upsertProgressionState(state: ProgressionState): Promise<void> {
  const db = await getDB();
  await run(
    db,
    `INSERT INTO progression_state (exercise_id, last_weight_lb, stall_count, progression_ceiling, watch_next_exposure)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       last_weight_lb = excluded.last_weight_lb,
       stall_count = excluded.stall_count,
       progression_ceiling = excluded.progression_ceiling,
       watch_next_exposure = excluded.watch_next_exposure`,
    [state.exercise_id, state.last_weight_lb, state.stall_count, state.progression_ceiling, state.watch_next_exposure]
  );
}

/**
 * Get all exposures for an exercise ordered chronologically 
 * An exposure is a workout where at least 1 set was logged for the exercise
 */
export async function getExerciseExposures(exerciseId: string): Promise<ExposureData[]> {
  const db = await getDB();

  // Get all workout_exercises for this exercise with their workout info
  const workoutExercises = await all<{
    we_id: string;
    workout_id: string;
    started_at: number;
  }>(
    db,
    `SELECT we.id as we_id, we.workout_id, w.started_at
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.exercise_id = ? AND w.ended_at IS NOT NULL
     ORDER BY w.started_at ASC`,
    [exerciseId]
  );

  const exposures: ExposureData[] = [];

  for (const we of workoutExercises) {
    const sets = await all<Set>(
      db,
      'SELECT id, workout_exercise_id, set_index, weight_lb, reps, rpe, created_at FROM sets WHERE workout_exercise_id = ? ORDER BY set_index ASC',
      [we.we_id]
    );

    if (sets.length > 0) {
      exposures.push({
        workoutId: we.workout_id,
        workoutStartedAt: we.started_at,
        sets,
      });
    }
  }

  return exposures;
}

/**
 * Get the most recent exposure's sets for an exercise
 */
export async function getLastExposureSets(exerciseId: string): Promise<Set[] | null> {
  const db = await getDB();

  // Get recent exposures (check last 5 to find one with sets)
  // This handles cases where an exercise was added to a workout but skipped (0 sets)
  const recentWes = await all<{ we_id: string }>(
    db,
    `SELECT we.id as we_id
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.exercise_id = ? AND w.ended_at IS NOT NULL
     ORDER BY w.started_at DESC
     LIMIT 5`,
    [exerciseId]
  );

  for (const we of recentWes) {
    const sets = await all<Set>(
      db,
      'SELECT id, workout_exercise_id, set_index, weight_lb, reps, rpe, set_type, created_at FROM sets WHERE workout_exercise_id = ? ORDER BY set_index ASC',
      [we.we_id]
    );

    if (sets.length > 0) {
      return sets;
    }
  }

  return null;
}

/**
 * Replay an exercise's full history through the progression engine and return the resulting
 * state WITHOUT persisting it. This is the canonical definition of what progression_state
 * should hold at any moment; the stored row is only ever a cache of this.
 *
 * Returns null if the exercise no longer exists.
 */
export async function computeProgressionState(
  exerciseId: string,
  settings?: Settings
): Promise<ProgressionState | null> {
  const db = await getDB();

  // Get exercise for rep range info
  const exercise = await get<Exercise>(
    db,
    'SELECT id, name, muscle_group, is_custom, rep_range_min, rep_range_max FROM exercises WHERE id = ?',
    [exerciseId]
  );

  if (!exercise) return null;

  // Get user settings for weightJumpLb
  const effectiveSettings = settings || await getSettings();
  const weightJumpLb = effectiveSettings.weightJumpLb;

  // Get all exposures ordered chronologically
  const exposures = await getExerciseExposures(exerciseId);

  // Initialize state
  let state = getInitialProgressionState(exerciseId, exercise.rep_range_max);

  // Iterate through all exposures, applying progression logic
  for (const exposure of exposures) {
    state = processExposure(exposure, state, exercise, weightJumpLb);
  }

  return state;
}

/**
 * Recompute progression state from workout history
 * This MUST be called after any workout edit/delete to prevent drift
 */
export async function recomputeProgressionState(exerciseId: string, settings?: Settings): Promise<void> {
  const state = await computeProgressionState(exerciseId, settings);

  if (!state) {
    console.warn(`recomputeProgressionState: exercise ${exerciseId} not found`);
    return;
  }

  // Persist final state
  await upsertProgressionState(state);
}

/**
 * Recompute progression state for ALL exercises that have exposures
 * Useful after data import or major edits
 */
export async function recomputeAllProgressionStates(settings?: Settings): Promise<void> {
  const db = await getDB();

  // Get settings once if not provided
  const effectiveSettings = settings || await getSettings();

  // Get all exercises that have at least one exposure
  const exercisesWithHistory = await all<{ exercise_id: string }>(
    db,
    `SELECT DISTINCT we.exercise_id
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE w.ended_at IS NOT NULL`
  );

  for (const { exercise_id } of exercisesWithHistory) {
    await recomputeProgressionState(exercise_id, effectiveSettings);
  }
}

/** The numeric fields of ProgressionState that a fresh replay must reproduce exactly. */
type ProgressionStateField =
  | 'last_weight_lb'
  | 'stall_count'
  | 'progression_ceiling'
  | 'watch_next_exposure';

export interface ProgressionCacheDrift {
  exerciseId: string;
  exerciseName: string;
  /** 'missing_row' means history exists but nothing was ever cached for this exercise. */
  field: ProgressionStateField | 'missing_row';
  cached: number | null;
  expected: number | null;
}

/**
 * Diagnostic: compare every cached progression_state row against a fresh replay of history.
 *
 * progression_state is a cache whose correctness depends on every mutation path remembering to
 * call recomputeProgressionState. That's a convention, not something the type system enforces,
 * so this is the tool that actually checks it against real data. A non-empty result means some
 * write path skipped its recompute and the user's weight suggestions are being computed from
 * stale state.
 *
 * Read-only — it reports drift, it doesn't repair it. Run "Repair progression cache"
 * (recomputeAllProgressionStates) to fix what it finds.
 */
export async function findProgressionCacheDrift(settings?: Settings): Promise<ProgressionCacheDrift[]> {
  const db = await getDB();
  const effectiveSettings = settings || await getSettings();

  const exercisesWithHistory = await all<{ exercise_id: string; name: string }>(
    db,
    `SELECT DISTINCT we.exercise_id, e.name
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     JOIN exercises e ON e.id = we.exercise_id
     WHERE w.ended_at IS NOT NULL`
  );

  const drift: ProgressionCacheDrift[] = [];

  for (const { exercise_id, name } of exercisesWithHistory) {
    const expected = await computeProgressionState(exercise_id, effectiveSettings);
    if (!expected) continue;

    const cached = await getProgressionState(exercise_id);

    // An exercise with finished exposures but no cached row is itself drift — the suggestion
    // path will silently fall back to first-time defaults.
    if (!cached) {
      drift.push({
        exerciseId: exercise_id,
        exerciseName: name,
        field: 'missing_row',
        cached: null,
        expected: expected.last_weight_lb,
      });
      continue;
    }

    const fields: ProgressionStateField[] = [
      'last_weight_lb',
      'stall_count',
      'progression_ceiling',
      'watch_next_exposure',
    ];

    for (const field of fields) {
      const cachedValue = cached[field] ?? null;
      const expectedValue = expected[field] ?? null;
      if (cachedValue !== expectedValue) {
        drift.push({
          exerciseId: exercise_id,
          exerciseName: name,
          field,
          cached: cachedValue,
          expected: expectedValue,
        });
      }
    }
  }

  return drift;
}

/**
 * Get progression suggestion for an exercise
 * Returns suggested weight and reason code for UI display
 *
 * @param workoutId when provided, the returned suggestion is recorded to suggestion_log as
 *   "shown to the user in this workout". Pass it from anywhere the number is actually put in
 *   front of the user; omit it for background reads (trainer-chat context, insights) that
 *   would otherwise log recommendations nobody saw. Recording lives here rather than at the
 *   call sites because log.tsx alone fetches suggestions from six places.
 */
export async function getProgressionSuggestion(
  exerciseId: string,
  settings?: Settings,
  workoutId?: string | null
): Promise<ProgressionSuggestion> {
  const db = await getDB();

  // Get exercise
  const exercise = await get<Exercise>(
    db,
    'SELECT id, name, muscle_group, is_custom, rep_range_min, rep_range_max FROM exercises WHERE id = ?',
    [exerciseId]
  );

  if (!exercise) {
    throw new Error(`Exercise ${exerciseId} not found`);
  }

  // Get current progression state
  let state = await getProgressionState(exerciseId);

  // Get last exposure sets
  const lastSets = await getLastExposureSets(exerciseId);

  // Get user settings
  const effectiveSettings = settings || await getSettings();

  if (lastSets && lastSets.length > 0 && (!state || state.last_weight_lb === null)) {
    await recomputeProgressionState(exerciseId, effectiveSettings);
    state = await getProgressionState(exerciseId);
  }

  const ruleSuggestion = generateSuggestion(exercise, state, lastSets, effectiveSettings.weightJumpLb);

  // AI override (full-trust, gated by aiSuggestionsEnabled). Falls back to the rule engine
  // for first-time exercises, low confidence, or any runtime failure. Never mutates cached
  // progression_state — that stays rule-engine-derived and recomputable from history.
  let finalSuggestion = ruleSuggestion;
  if (effectiveSettings.aiSuggestionsEnabled !== false && ruleSuggestion.reasonCode !== 'FIRST_TIME') {
    const aiSuggestion = await getAIProgressionSuggestion(exercise, state, effectiveSettings.weightJumpLb);
    if (aiSuggestion) finalSuggestion = aiSuggestion;
  }

  // Audit what was shown, alongside the inputs that produced it. Awaited so the row is durable
  // before the caller renders — recordSuggestionShown swallows its own errors, so this can't
  // fail the suggestion.
  if (workoutId) {
    await recordSuggestionShown({
      workoutId,
      exerciseId,
      suggestion: finalSuggestion,
      weightJumpLb: effectiveSettings.weightJumpLb,
      state,
      modelVersion: PROGRESSION_MODEL_VERSION,
    });
  }

  return finalSuggestion;
}

/**
 * Update progression state after completing a workout
 * Called when a workout is finished
 */
export async function updateProgressionAfterWorkout(workoutId: string): Promise<void> {
  const db = await getDB();

  // Get all exercises from this workout
  const workoutExercises = await all<{ exercise_id: string }>(
    db,
    'SELECT DISTINCT exercise_id FROM workout_exercises WHERE workout_id = ?',
    [workoutId]
  );

  // Recompute progression state for each exercise
  for (const { exercise_id } of workoutExercises) {
    await recomputeProgressionState(exercise_id);
  }
}

// ============================================
// PROGRESS CHARTS (PRD §3F, §5)
// ============================================

export interface ProgressDataPoint {
  workoutDate: number; // timestamp
  maxWeightLb: number;
}

/**
 * Get top working weight per workout for an exercise (for progress charts)
 * Returns data points sorted by workout date ascending
 */
export async function getExerciseProgressData(exerciseId: string): Promise<ProgressDataPoint[]> {
  const db = await getDB();
  
  const rows = await all<{ workout_date: number; max_weight: number }>(
    db,
    `SELECT w.started_at as workout_date, MAX(s.weight_lb) as max_weight
     FROM sets s
     JOIN workout_exercises we ON s.workout_exercise_id = we.id
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.exercise_id = ?
       AND w.ended_at IS NOT NULL
     GROUP BY w.id
     ORDER BY w.started_at ASC`,
    [exerciseId]
  );

  return rows.map(row => ({
    workoutDate: row.workout_date,
    maxWeightLb: row.max_weight,
  }));
}

/**
 * Get exercises that have been used in workouts (for progress chart exercise picker)
 * Returns exercises with workout count, sorted by frequency
 */
export async function getExercisesWithWorkoutCount(): Promise<(Exercise & { workout_count: number })[]> {
  const db = await getDB();
  
  return await all<Exercise & { workout_count: number }>(
    db,
    `SELECT e.id, e.name, e.muscle_group, e.is_custom, e.rep_range_min, e.rep_range_max,
            COUNT(DISTINCT w.id) as workout_count
     FROM exercises e
     JOIN workout_exercises we ON e.id = we.exercise_id
     JOIN workouts w ON we.workout_id = w.id
     WHERE w.ended_at IS NOT NULL
     GROUP BY e.id
     ORDER BY workout_count DESC, e.name ASC`
  );
}
