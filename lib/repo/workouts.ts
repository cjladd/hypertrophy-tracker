import { getDB } from '../db';
import { all, get, run } from '../sql';
import { Exercise, Set, Workout, WorkoutExercise } from '../types';
import { uuid } from './utils';

// ============================================
// WORKOUTS
// ============================================

const STALE_WORKOUT_MS = 6 * 60 * 60 * 1000;

async function finalizeStaleWorkouts(maxAgeMs: number): Promise<void> {
  const db = await getDB();
  const cutoff = Date.now() - maxAgeMs;

  const staleWorkouts = await all<{
    id: string;
    set_count: number;
    last_set_at: number | null;
  }>(
    db,
    `SELECT w.id,
            COUNT(s.id) as set_count,
            MAX(s.created_at) as last_set_at
     FROM workouts w
     LEFT JOIN workout_exercises we ON we.workout_id = w.id
     LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.ended_at IS NULL AND w.started_at <= ?
     GROUP BY w.id`,
    [cutoff]
  );

  for (const workout of staleWorkouts) {
    if (workout.set_count === 0) {
      await run(db, 'DELETE FROM workouts WHERE id = ?', [workout.id]);
      continue;
    }

    const endedAt = workout.last_set_at ?? Date.now();
    await run(
      db,
      'UPDATE workouts SET ended_at = ? WHERE id = ? AND ended_at IS NULL',
      [endedAt, workout.id]
    );
  }
}

export async function startWorkout(templateId?: string): Promise<Workout> {
  const db = await getDB();
  const id = uuid();
  const now = Date.now();
  await run(
    db,
    'INSERT INTO workouts (id, started_at, template_id) VALUES (?,?,?)',
    [id, now, templateId ?? null]
  );
  return { id, started_at: now, ended_at: null, template_id: templateId ?? null, routine_day_id: null, notes: null };
}

export async function finishWorkout(workoutId: string, notes?: string): Promise<void> {
  const db = await getDB();
  await run(
    db,
    'UPDATE workouts SET ended_at = ?, notes = ? WHERE id = ?',
    [Date.now(), notes ?? null, workoutId]
  );
}

export async function updateWorkoutNotes(workoutId: string, notes: string): Promise<void> {
  const db = await getDB();
  await run(db, 'UPDATE workouts SET notes = ? WHERE id = ?', [notes, workoutId]);
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  const db = await getDB();
  // CASCADE will handle workout_exercises and sets
  await run(db, 'DELETE FROM workouts WHERE id = ?', [workoutId]);
}

export async function getWorkout(id: string): Promise<Workout | null> {
  const db = await getDB();
  return await get<Workout>(
    db,
    'SELECT id, started_at, ended_at, template_id, routine_day_id, notes FROM workouts WHERE id = ?',
    [id]
  );
}

export async function listRecentWorkouts(limit = 20): Promise<Workout[]> {
  const db = await getDB();
  await finalizeStaleWorkouts(STALE_WORKOUT_MS);
  const lim = Math.max(1, Math.min(1000, Math.floor(limit)));
  return await all<Workout>(
    db,
    `SELECT id, started_at, ended_at, template_id, routine_day_id, notes
     FROM workouts
     WHERE ended_at IS NOT NULL
     ORDER BY ended_at DESC
     LIMIT ${lim}`
  );
}

export async function getLastWorkout(): Promise<Workout | null> {
  const db = await getDB();
  return await get<Workout>(
    db,
    `SELECT id, started_at, ended_at, template_id, routine_day_id, notes
     FROM workouts
     WHERE ended_at IS NOT NULL
     ORDER BY ended_at DESC
     LIMIT 1`
  );
}

/**
 * Get an active (unfinished) workout that has at least one logged set.
 * Auto-deletes empty incomplete workouts to prevent orphan records.
 * Returns null if no resumable workout exists.
 */
export async function getActiveWorkoutForResume(): Promise<Workout | null> {
  const db = await getDB();
  await finalizeStaleWorkouts(STALE_WORKOUT_MS);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const cutoff = Date.now() - STALE_WORKOUT_MS;
  const minStart = Math.max(startOfToday, cutoff);

  const row = await get<
    Workout & { set_count: number }
  >(
    db,
    `SELECT w.id, w.started_at, w.ended_at, w.template_id, w.routine_day_id, w.notes,
            COUNT(s.id) as set_count
     FROM workouts w
     LEFT JOIN workout_exercises we ON we.workout_id = w.id
     LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.ended_at IS NULL AND w.started_at >= ?
     GROUP BY w.id
     ORDER BY w.started_at DESC
     LIMIT 1`,
    [minStart]
  );

  if (!row) return null;

  if (row.set_count === 0) {
    await deleteWorkout(row.id);
    return null;
  }

  return row;
}

// ============================================
// WORKOUT EXERCISES (junction table)
// ============================================

export async function addWorkoutExercise(workoutId: string, exerciseId: string, orderIndex: number): Promise<WorkoutExercise> {
  const db = await getDB();
  const id = uuid();
  await run(
    db,
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index) VALUES (?,?,?,?)',
    [id, workoutId, exerciseId, orderIndex]
  );
  return { id, workout_id: workoutId, exercise_id: exerciseId, order_index: orderIndex };
}

export async function getWorkoutExercises(workoutId: string): Promise<(WorkoutExercise & { exercise: Exercise })[]> {
  const db = await getDB();
  return await all<WorkoutExercise & { exercise: Exercise }>(
    db,
    `SELECT we.id, we.workout_id, we.exercise_id, we.order_index,
            e.name, e.muscle_group, e.is_custom, e.rep_range_min, e.rep_range_max
     FROM workout_exercises we
     JOIN exercises e ON we.exercise_id = e.id
     WHERE we.workout_id = ?
     ORDER BY we.order_index ASC`,
    [workoutId]
  );
}

export async function updateWorkoutExerciseOrder(workoutExerciseId: string, newOrderIndex: number): Promise<void> {
  const db = await getDB();
  await run(db, 'UPDATE workout_exercises SET order_index = ? WHERE id = ?', [newOrderIndex, workoutExerciseId]);
}

export async function removeWorkoutExercise(workoutExerciseId: string): Promise<void> {
  const db = await getDB();
  // CASCADE will delete associated sets
  await run(db, 'DELETE FROM workout_exercises WHERE id = ?', [workoutExerciseId]);
}

// ============================================
// SETS (working sets only, per PRD)
// ============================================

export async function addSet(args: {
  workoutExerciseId: string;
  setIndex: number;
  weightLb: number;
  reps: number;
  rpe?: number;
}): Promise<Set> {
  const { workoutExerciseId, setIndex, weightLb, reps, rpe } = args;
  const db = await getDB();
  const id = uuid();
  const createdAt = Date.now();
  await run(
    db,
    'INSERT INTO sets (id, workout_exercise_id, set_index, weight_lb, reps, rpe, created_at) VALUES (?,?,?,?,?,?,?)',
    [id, workoutExerciseId, setIndex, weightLb, reps, rpe ?? null, createdAt]
  );
  return { id, workout_exercise_id: workoutExerciseId, set_index: setIndex, weight_lb: weightLb, reps, rpe: rpe ?? null, created_at: createdAt };
}

export async function updateSet(
  setId: string,
  updates: { weightLb?: number; reps?: number; rpe?: number | null; setIndex?: number }
): Promise<void> {
  const db = await getDB();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.weightLb !== undefined) {
    fields.push('weight_lb = ?');
    values.push(updates.weightLb);
  }
  if (updates.reps !== undefined) {
    fields.push('reps = ?');
    values.push(updates.reps);
  }
  if (updates.rpe !== undefined) {
    fields.push('rpe = ?');
    values.push(updates.rpe);
  }
  if (updates.setIndex !== undefined) {
    fields.push('set_index = ?');
    values.push(updates.setIndex);
  }

  if (fields.length === 0) return;
  values.push(setId);

  await run(db, `UPDATE sets SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteSet(setId: string): Promise<void> {
  const db = await getDB();
  await run(db, 'DELETE FROM sets WHERE id = ?', [setId]);
}

export async function getSetsForWorkoutExercise(workoutExerciseId: string): Promise<Set[]> {
  const db = await getDB();
  return await all<Set>(
    db,
    'SELECT id, workout_exercise_id, set_index, weight_lb, reps, rpe, created_at FROM sets WHERE workout_exercise_id = ? ORDER BY set_index ASC',
    [workoutExerciseId]
  );
}

export async function getSetsForWorkout(workoutId: string): Promise<(Set & { exercise_id: string })[]> {
  const db = await getDB();
  return await all<Set & { exercise_id: string }>(
    db,
    `SELECT s.id, s.workout_exercise_id, s.set_index, s.weight_lb, s.reps, s.rpe, s.created_at, we.exercise_id
     FROM sets s
     JOIN workout_exercises we ON s.workout_exercise_id = we.id
     WHERE we.workout_id = ?
     ORDER BY we.order_index, s.set_index`,
    [workoutId]
  );
}

// Get the last weight used for an exercise (for prefill)
export async function getLastWeightForExercise(exerciseId: string): Promise<number | null> {
  const db = await getDB();
  const result = await get<{ weight_lb: number }>(
    db,
    `SELECT s.weight_lb
     FROM sets s
     JOIN workout_exercises we ON s.workout_exercise_id = we.id
     WHERE we.exercise_id = ?
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [exerciseId]
  );
  return result?.weight_lb ?? null;
}

// Get exercises from last workout (for "Repeat last workout" feature)
export async function getLastWorkoutExerciseIds(): Promise<string[]> {
  const db = await getDB();
  const lastWorkout = await getLastWorkout();
  if (!lastWorkout) return [];

  const workoutExercises = await all<{ exercise_id: string }>(
    db,
    'SELECT exercise_id FROM workout_exercises WHERE workout_id = ? ORDER BY order_index ASC',
    [lastWorkout.id]
  );
  return workoutExercises.map((we) => we.exercise_id);
}
