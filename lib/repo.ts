// lib/repo.ts
// Repository functions aligned with PRD v1 data model
import * as Crypto from 'expo-crypto';
import { getDB } from './db';
import { all, get, run } from './sql';
import type { Exercise, MuscleGroup, ProgressionState, Routine, RoutineDay, Set, Template, Workout, WorkoutExercise } from './types';

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
