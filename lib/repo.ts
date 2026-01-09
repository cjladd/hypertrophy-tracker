// lib/repo.ts
// Repository functions aligned with PRD v1 data model
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { getDB } from './db';
import { all, get, run } from './sql';
import type { Exercise, MuscleGroup, ProgressionState, Routine, RoutineDay, Set, Settings, Template, Workout, WorkoutExercise } from './types';

function uuid() {
  return (Crypto as any).randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2);
}

// ============================================
// SETTINGS (AsyncStorage-based)
// ============================================

const SETTINGS_KEY = 'ht_settings_v2';
const DEFAULT_SETTINGS: Settings = { weightJumpLb: 5 };

/**
 * Get settings from AsyncStorage (prog_engine.md §2)
 * This is a standalone function for use in repo without React context
 */
export async function getSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore errors, use defaults
  }
  return DEFAULT_SETTINGS;
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
  const lim = Math.max(1, Math.min(1000, Math.floor(limit)));
  return await all<Workout>(
    db,
    `SELECT id, started_at, ended_at, template_id, routine_day_id, notes
     FROM workouts
     ORDER BY COALESCE(ended_at, started_at) DESC
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
 * Get an active (unfinished) workout that was started today.
 * Returns null if no active workout from today exists.
 */
export async function getActiveWorkoutFromToday(): Promise<Workout | null> {
  const db = await getDB();
  // Calculate start of today (midnight) in milliseconds
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  
  return await get<Workout>(
    db,
    `SELECT id, started_at, ended_at, template_id, routine_day_id, notes
     FROM workouts
     WHERE ended_at IS NULL AND started_at >= ?
     ORDER BY started_at DESC
     LIMIT 1`,
    [startOfToday]
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

// ============================================
// ROUTINES (split_migration.md §2, §3)
// ============================================

// Seed PPL routine with default templates (idempotent)
export async function seedPPLRoutine(): Promise<void> {
  const db = await getDB();
  try {
    // Check if PPL routine already exists
    const existing = await get<{ count: number }>(
      db,
      "SELECT COUNT(*) as count FROM routines WHERE name = 'PPL' AND is_preset = 1"
    );
    if ((existing?.count ?? 0) > 0) {
      console.log('PPL routine already exists, skipping seed');
      return;
    }

    // Get exercises by name for template creation
    const exercises = await getExercises();
    const getExerciseId = (name: string): string | undefined =>
      exercises.find((e) => e.name === name)?.id;

    // Define PPL day exercises
    const pushExercises = [
      'Bench Press',
      'Incline Dumbbell Press',
      'Overhead Press',
      'Lateral Raise',
      'Tricep Pushdown',
      'Skull Crusher',
    ];
    const pullExercises = [
      'Pull-Up',
      'Lat Pulldown',
      'Barbell Row',
      'Cable Row',
      'Face Pull',
      'Barbell Curl',
      'Hammer Curl',
    ];
    const legsExercises = [
      'Back Squat',
      'Leg Press',
      'Romanian Deadlift',
      'Leg Extension',
      'Lying Leg Curl',
      'Standing Calf Raise',
    ];

    // Create templates for each day
    const pushExerciseIds = pushExercises.map(getExerciseId).filter(Boolean) as string[];
    const pullExerciseIds = pullExercises.map(getExerciseId).filter(Boolean) as string[];
    const legsExerciseIds = legsExercises.map(getExerciseId).filter(Boolean) as string[];

    // Check if templates already exist, if not create them
    let pushTemplate = await get<Template>(db, "SELECT * FROM templates WHERE name = 'Push'");
    let pullTemplate = await get<Template>(db, "SELECT * FROM templates WHERE name = 'Pull'");
    let legsTemplate = await get<Template>(db, "SELECT * FROM templates WHERE name = 'Legs'");

    if (!pushTemplate) {
      pushTemplate = await createTemplate('Push', pushExerciseIds);
    }
    if (!pullTemplate) {
      pullTemplate = await createTemplate('Pull', pullExerciseIds);
    }
    if (!legsTemplate) {
      legsTemplate = await createTemplate('Legs', legsExerciseIds);
    }

    // Create PPL routine
    const routineId = uuid();
    const now = Date.now();
    await run(
      db,
      'INSERT INTO routines (id, name, is_preset, created_at) VALUES (?,?,1,?)',
      [routineId, 'PPL', now]
    );

    // Create routine days linked to templates
    const days = [
      { name: 'Push', templateId: pushTemplate.id, orderIndex: 0 },
      { name: 'Pull', templateId: pullTemplate.id, orderIndex: 1 },
      { name: 'Legs', templateId: legsTemplate.id, orderIndex: 2 },
    ];

    for (const day of days) {
      await run(
        db,
        'INSERT INTO routine_days (id, routine_id, name, order_index, template_id, exercise_ids) VALUES (?,?,?,?,?,?)',
        [uuid(), routineId, day.name, day.orderIndex, day.templateId, '[]']
      );
    }

    console.log('Seeded PPL routine with Push, Pull, Legs days');
  } catch (e) {
    console.warn('seedPPLRoutine error:', e);
  }
}

// Get all routines
export async function listRoutines(): Promise<Routine[]> {
  const db = await getDB();
  return await all<Routine>(
    db,
    'SELECT id, name, is_preset, created_at FROM routines ORDER BY is_preset DESC, name ASC'
  );
}

// Get a routine by ID
export async function getRoutineById(id: string): Promise<Routine | null> {
  const db = await getDB();
  return await get<Routine>(
    db,
    'SELECT id, name, is_preset, created_at FROM routines WHERE id = ?',
    [id]
  );
}

// Get all days for a routine
export async function getRoutineDays(routineId: string): Promise<RoutineDay[]> {
  const db = await getDB();
  return await all<RoutineDay>(
    db,
    'SELECT id, routine_id, name, order_index, template_id, exercise_ids FROM routine_days WHERE routine_id = ? ORDER BY order_index ASC',
    [routineId]
  );
}

// Get the first (default) routine (PPL for v1)
export async function getDefaultRoutine(): Promise<Routine | null> {
  const db = await getDB();
  return await get<Routine>(
    db,
    'SELECT id, name, is_preset, created_at FROM routines WHERE is_preset = 1 ORDER BY created_at ASC LIMIT 1'
  );
}

// Get next routine day based on last completed workout
// Cycles through days: Push -> Pull -> Legs -> Push...
export async function getNextRoutineDay(routineId: string): Promise<RoutineDay | null> {
  const db = await getDB();

  // Get all days for this routine
  const days = await getRoutineDays(routineId);
  if (days.length === 0) return null;

  // Find last completed workout with a routine_day_id from this routine
  const lastWorkout = await get<{ routine_day_id: string }>(
    db,
    `SELECT w.routine_day_id
     FROM workouts w
     JOIN routine_days rd ON w.routine_day_id = rd.id
     WHERE rd.routine_id = ? AND w.ended_at IS NOT NULL
     ORDER BY w.ended_at DESC
     LIMIT 1`,
    [routineId]
  );

  if (!lastWorkout?.routine_day_id) {
    // No history, return first day
    return days[0];
  }

  // Find the last day's index and advance
  const lastDay = days.find((d) => d.id === lastWorkout.routine_day_id);
  if (!lastDay) return days[0];

  const nextIndex = (lastDay.order_index + 1) % days.length;
  return days.find((d) => d.order_index === nextIndex) ?? days[0];
}

// Get routine day by ID
export async function getRoutineDayById(id: string): Promise<RoutineDay | null> {
  const db = await getDB();
  return await get<RoutineDay>(
    db,
    'SELECT id, routine_id, name, order_index, template_id, exercise_ids FROM routine_days WHERE id = ?',
    [id]
  );
}

// Start workout from a routine day
export async function startWorkoutFromRoutineDay(routineDayId: string): Promise<Workout> {
  const db = await getDB();
  const id = uuid();
  const now = Date.now();

  // Get the routine day to find its template
  const routineDay = await getRoutineDayById(routineDayId);

  await run(
    db,
    'INSERT INTO workouts (id, started_at, template_id, routine_day_id) VALUES (?,?,?,?)',
    [id, now, routineDay?.template_id ?? null, routineDayId]
  );

  return {
    id,
    started_at: now,
    ended_at: null,
    template_id: routineDay?.template_id ?? null,
    routine_day_id: routineDayId,
    notes: null,
  };
}

// Update a routine day's template (for "Update this day's template" option)
export async function updateRoutineDayTemplate(routineDayId: string, templateId: string): Promise<void> {
  const db = await getDB();
  await run(db, 'UPDATE routine_days SET template_id = ? WHERE id = ?', [templateId, routineDayId]);
}

// ============================================
// PROGRESSION STATE (prog_engine.md)
// ============================================

import {
    type ExposureData,
    generateSuggestion,
    getInitialProgressionState,
    processExposure,
} from './progression';
import type { ProgressionSuggestion } from './types';

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

  // Get the most recent workout_exercise for this exercise
  const lastWe = await get<{ we_id: string }>(
    db,
    `SELECT we.id as we_id
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE we.exercise_id = ? AND w.ended_at IS NOT NULL
     ORDER BY w.started_at DESC
     LIMIT 1`,
    [exerciseId]
  );

  if (!lastWe) return null;

  const sets = await all<Set>(
    db,
    'SELECT id, workout_exercise_id, set_index, weight_lb, reps, rpe, created_at FROM sets WHERE workout_exercise_id = ? ORDER BY set_index ASC',
    [lastWe.we_id]
  );

  return sets.length > 0 ? sets : null;
}

/**
 * Recompute progression state from workout history (prog_engine.md §10)
 * This MUST be called after any workout edit/delete to prevent drift
 */
export async function recomputeProgressionState(exerciseId: string): Promise<void> {
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
  const settings = await getSettings();
  const weightJumpLb = settings.weightJumpLb;

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
export async function recomputeAllProgressionStates(): Promise<void> {
  const db = await getDB();

  // Get all exercises that have at least one exposure
  const exercisesWithHistory = await all<{ exercise_id: string }>(
    db,
    `SELECT DISTINCT we.exercise_id
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE w.ended_at IS NOT NULL`
  );

  for (const { exercise_id } of exercisesWithHistory) {
    await recomputeProgressionState(exercise_id);
  }
}

/**
 * Get progression suggestion for an exercise (prog_engine.md §11)
 * Returns suggested weight and reason code for UI display
 */
export async function getProgressionSuggestion(exerciseId: string): Promise<ProgressionSuggestion> {
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
  const state = await getProgressionState(exerciseId);

  // Get last exposure sets
  const lastSets = await getLastExposureSets(exerciseId);

  // Get user settings
  const settings = await getSettings();

  return generateSuggestion(exercise, state, lastSets, settings.weightJumpLb);
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
