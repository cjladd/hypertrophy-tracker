import { getDB } from '../db';
import { all, run } from '../sql';
import { Exercise, MuscleGroup } from '../types';
import { uuid } from './utils';

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
      const now = Date.now();
      await run(
        db,
        'INSERT INTO exercises (id, name, muscle_group, is_custom, rep_range_min, rep_range_max, created_at) VALUES (?,?,?,0,8,12,?)',
        [uuid(), ex.name, ex.muscleGroup, now]
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
