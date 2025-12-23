// lib/repo.ts
// Repository functions aligned with PRD v1 data model
import * as Crypto from 'expo-crypto';
import { getDB } from './db';
import { all, get, run } from './sql';
import type { Exercise, MuscleGroup, ProgressionState, Set, Template, Workout, WorkoutExercise } from './types';

function uuid() {
  return (Crypto as any).randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2);
}

// ============================================
// EXERCISES
// ============================================

export async function seedExercises() {
  const db = await getDB();
  try {
    const rows = await all<{ count: number }>(db, 'SELECT COUNT(*) as count FROM exercises');
    if ((rows?.[0]?.count ?? 0) > 0) return; // Already seeded

    // Default exercises per PRD with muscle groups and default rep ranges (8-12)
    const defaultExercises: { name: string; muscleGroup: MuscleGroup }[] = [
      // Chest
      { name: 'Bench Press', muscleGroup: 'chest' },
      { name: 'Incline Dumbbell Press', muscleGroup: 'chest' },
      { name: 'Cable Fly', muscleGroup: 'chest' },
      { name: 'Dumbbell Fly', muscleGroup: 'chest' },
      // Shoulder
      { name: 'Overhead Press', muscleGroup: 'shoulder' },
      { name: 'Lateral Raise', muscleGroup: 'shoulder' },
      { name: 'Face Pull', muscleGroup: 'shoulder' },
      { name: 'Rear Delt Fly', muscleGroup: 'shoulder' },
      // Tricep
      { name: 'Tricep Pushdown', muscleGroup: 'tricep' },
      { name: 'Skull Crusher', muscleGroup: 'tricep' },
      { name: 'Overhead Tricep Extension', muscleGroup: 'tricep' },
      // Bicep
      { name: 'Barbell Curl', muscleGroup: 'bicep' },
      { name: 'Dumbbell Curl', muscleGroup: 'bicep' },
      { name: 'Hammer Curl', muscleGroup: 'bicep' },
      { name: 'Preacher Curl', muscleGroup: 'bicep' },
      // Quads
      { name: 'Back Squat', muscleGroup: 'quads' },
      { name: 'Front Squat', muscleGroup: 'quads' },
      { name: 'Leg Press', muscleGroup: 'quads' },
      { name: 'Leg Extension', muscleGroup: 'quads' },
      { name: 'Lunges', muscleGroup: 'quads' },
      // Hamstrings
      { name: 'Romanian Deadlift', muscleGroup: 'hamstrings' },
      { name: 'Lying Leg Curl', muscleGroup: 'hamstrings' },
      { name: 'Seated Leg Curl', muscleGroup: 'hamstrings' },
      // Glutes
      { name: 'Hip Thrust', muscleGroup: 'glutes' },
      { name: 'Glute Bridge', muscleGroup: 'glutes' },
      { name: 'Cable Kickback', muscleGroup: 'glutes' },
      // Calves
      { name: 'Standing Calf Raise', muscleGroup: 'calves' },
      { name: 'Seated Calf Raise', muscleGroup: 'calves' },
      // Core
      { name: 'Cable Crunch', muscleGroup: 'core' },
      { name: 'Hanging Leg Raise', muscleGroup: 'core' },
      { name: 'Ab Wheel Rollout', muscleGroup: 'core' },
      // Lower Back
      { name: 'Back Extension', muscleGroup: 'lower_back' },
      { name: 'Good Morning', muscleGroup: 'lower_back' },
      // Upper Back
      { name: 'Barbell Row', muscleGroup: 'upper_back' },
      { name: 'Dumbbell Row', muscleGroup: 'upper_back' },
      { name: 'Cable Row', muscleGroup: 'upper_back' },
      { name: 'T-Bar Row', muscleGroup: 'upper_back' },
      // Lats
      { name: 'Deadlift', muscleGroup: 'lats' },
      { name: 'Pull-Up', muscleGroup: 'lats' },
      { name: 'Lat Pulldown', muscleGroup: 'lats' },
      { name: 'Straight Arm Pulldown', muscleGroup: 'lats' },
    ];

    for (const ex of defaultExercises) {
      await run(
        db,
        'INSERT INTO exercises (id, name, muscle_group, is_custom, rep_range_min, rep_range_max) VALUES (?,?,?,0,8,12)',
        [uuid(), ex.name, ex.muscleGroup]
      );
    }
    console.log('Seeded default exercises');
  } catch (e) {
    console.warn('seedExercises error:', e);
  }
}

export async function getExercises(): Promise<Exercise[]> {
  const db = await getDB();
  try {
    return await all<Exercise>(
      db,
      'SELECT id, name, muscle_group, is_custom, rep_range_min, rep_range_max, created_at FROM exercises ORDER BY name ASC'
    );
  } catch (e) {
    console.warn('getExercises error:', e);
    return [];
  }
}

export async function getExercisesByMuscleGroup(muscleGroup: MuscleGroup): Promise<Exercise[]> {
  const db = await getDB();
  try {
    return await all<Exercise>(
      db,
      'SELECT id, name, muscle_group, is_custom, rep_range_min, rep_range_max FROM exercises WHERE muscle_group = ? ORDER BY name ASC',
      [muscleGroup]
    );
  } catch (e) {
    console.warn('getExercisesByMuscleGroup error:', e);
    return [];
  }
}

export async function addExercise(
  name: string,
  muscleGroup: MuscleGroup,
  repRangeMin = 8,
  repRangeMax = 12
): Promise<Exercise> {
  const db = await getDB();
  const id = uuid();
  const createdAt = Date.now();
  await run(
    db,
    'INSERT INTO exercises (id, name, muscle_group, is_custom, rep_range_min, rep_range_max, created_at) VALUES (?,?,?,1,?,?,?)',
    [id, name.trim(), muscleGroup, repRangeMin, repRangeMax, createdAt]
  );
  return {
    id,
    name: name.trim(),
    muscle_group: muscleGroup,
    is_custom: 1,
    rep_range_min: repRangeMin,
    rep_range_max: repRangeMax,
    created_at: createdAt,
  };
}

export async function updateExercise(
  id: string,
  updates: { name?: string; muscleGroup?: MuscleGroup; repRangeMin?: number; repRangeMax?: number }
): Promise<void> {
  const db = await getDB();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name.trim());
  }
  if (updates.muscleGroup !== undefined) {
    fields.push('muscle_group = ?');
    values.push(updates.muscleGroup);
  }
  if (updates.repRangeMin !== undefined) {
    fields.push('rep_range_min = ?');
    values.push(updates.repRangeMin);
  }
  if (updates.repRangeMax !== undefined) {
    fields.push('rep_range_max = ?');
    values.push(updates.repRangeMax);
  }

  if (fields.length === 0) return;
  values.push(id);

  await run(db, `UPDATE exercises SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteExercise(id: string): Promise<void> {
  const db = await getDB();
  // Check if exercise is used in any workout_exercises
  const used = await all<{ count: number }>(
    db,
    'SELECT COUNT(*) as count FROM workout_exercises WHERE exercise_id = ?',
    [id]
  );
  if ((used?.[0]?.count ?? 0) > 0) {
    throw new Error('Cannot delete exercise that has recorded workouts');
  }
  await run(db, 'DELETE FROM exercises WHERE id = ?', [id]);
}

export async function searchExercises(query: string): Promise<Exercise[]> {
  const db = await getDB();
  return await all<Exercise>(
    db,
    'SELECT id, name, muscle_group, is_custom, rep_range_min, rep_range_max FROM exercises WHERE name LIKE ? ORDER BY name ASC',
    [`%${query}%`]
  );
}

// ============================================
// TEMPLATES
// ============================================

export async function getTemplates(): Promise<Template[]> {
  const db = await getDB();
  return await all<Template>(db, 'SELECT id, name, exercise_ids, created_at FROM templates ORDER BY name ASC');
}

export async function getTemplate(id: string): Promise<Template | null> {
  const db = await getDB();
  return await get<Template>(db, 'SELECT id, name, exercise_ids, created_at FROM templates WHERE id = ?', [id]);
}

export async function createTemplate(name: string, exerciseIds: string[] = []): Promise<Template> {
  const db = await getDB();
  const id = uuid();
  const createdAt = Date.now();
  const exerciseIdsJson = JSON.stringify(exerciseIds);
  await run(
    db,
    'INSERT INTO templates (id, name, exercise_ids, created_at) VALUES (?,?,?,?)',
    [id, name.trim(), exerciseIdsJson, createdAt]
  );
  return { id, name: name.trim(), exercise_ids: exerciseIdsJson, created_at: createdAt };
}

export async function updateTemplate(id: string, updates: { name?: string; exerciseIds?: string[] }): Promise<void> {
  const db = await getDB();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name.trim());
  }
  if (updates.exerciseIds !== undefined) {
    fields.push('exercise_ids = ?');
    values.push(JSON.stringify(updates.exerciseIds));
  }

  if (fields.length === 0) return;
  values.push(id);

  await run(db, `UPDATE templates SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  await run(db, 'DELETE FROM templates WHERE id = ?', [id]);
}

// ============================================
// WORKOUTS
// ============================================

export async function startWorkout(templateId?: string): Promise<Workout> {
  const db = await getDB();
  const id = uuid();
  const now = Date.now();
  await run(
    db,
    'INSERT INTO workouts (id, started_at, template_id) VALUES (?,?,?)',
    [id, now, templateId ?? null]
  );
  return { id, started_at: now, ended_at: null, template_id: templateId ?? null, notes: null };
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
    'SELECT id, started_at, ended_at, template_id, notes FROM workouts WHERE id = ?',
    [id]
  );
}

export async function listRecentWorkouts(limit = 20): Promise<Workout[]> {
  const db = await getDB();
  const lim = Math.max(1, Math.min(1000, Math.floor(limit)));
  return await all<Workout>(
    db,
    `SELECT id, started_at, ended_at, template_id, notes
     FROM workouts
     ORDER BY COALESCE(ended_at, started_at) DESC
     LIMIT ${lim}`
  );
}

export async function getLastWorkout(): Promise<Workout | null> {
  const db = await getDB();
  return await get<Workout>(
    db,
    `SELECT id, started_at, ended_at, template_id, notes
     FROM workouts
     WHERE ended_at IS NOT NULL
     ORDER BY ended_at DESC
     LIMIT 1`
  );
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
  updates: { weightLb?: number; reps?: number; rpe?: number | null }
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

// ============================================
// PROGRESSION STATE (PRD §4)
// ============================================

export async function getProgressionState(exerciseId: string): Promise<ProgressionState | null> {
  const db = await getDB();
  return await get<ProgressionState>(
    db,
    'SELECT exercise_id, last_suggested_weight_lb, last_successful_weight_lb, consecutive_non_success_exposures FROM progression_state WHERE exercise_id = ?',
    [exerciseId]
  );
}

export async function upsertProgressionState(state: ProgressionState): Promise<void> {
  const db = await getDB();
  await run(
    db,
    `INSERT INTO progression_state (exercise_id, last_suggested_weight_lb, last_successful_weight_lb, consecutive_non_success_exposures)
     VALUES (?,?,?,?)
     ON CONFLICT(exercise_id) DO UPDATE SET
       last_suggested_weight_lb = excluded.last_suggested_weight_lb,
       last_successful_weight_lb = excluded.last_successful_weight_lb,
       consecutive_non_success_exposures = excluded.consecutive_non_success_exposures`,
    [state.exercise_id, state.last_suggested_weight_lb, state.last_successful_weight_lb, state.consecutive_non_success_exposures]
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
