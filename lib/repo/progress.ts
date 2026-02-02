// Progression logic interaction + Charts
import { getDB } from '../db';
import { ExposureData, generateSuggestion, getInitialProgressionState, processExposure } from '../progression';
import { all, get, run } from '../sql';
import { Exercise, ProgressionState, ProgressionSuggestion, Set, Settings } from '../types';
import { getSettings } from './settings';

// ============================================
// PROGRESSION STATE (prog_engine.md)
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
 * Get all exposures for an exercise ordered chronologically (prog_engine.md §10)
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
 * Recompute progression state from workout history (prog_engine.md §10)
 * This MUST be called after any workout edit/delete to prevent drift
 */
export async function recomputeProgressionState(exerciseId: string, settings?: Settings): Promise<void> {
  const db = await getDB();

  // Get exercise for rep range info
  const exercise = await get<Exercise>(
    db,
    'SELECT id, name, muscle_group, is_custom, rep_range_min, rep_range_max FROM exercises WHERE id = ?',
    [exerciseId]
  );

  if (!exercise) {
    console.warn(`recomputeProgressionState: exercise ${exerciseId} not found`);
    return;
  }

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

/**
 * Get progression suggestion for an exercise (prog_engine.md §11)
 * Returns suggested weight and reason code for UI display
 */
export async function getProgressionSuggestion(exerciseId: string, settings?: Settings): Promise<ProgressionSuggestion> {
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

  return generateSuggestion(exercise, state, lastSets, effectiveSettings.weightJumpLb);
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
