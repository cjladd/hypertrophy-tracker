// lib/repo.ts
import * as Crypto from 'expo-crypto';
import { getDB } from './db';
import { all, run } from './sql';

function uuid() {
  return (Crypto as any).randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2);
}

export async function seedIfNeeded() {
  const db = await getDB();
  try {
    const rows = await all<{ count: number }>(db, 'SELECT COUNT(*) as count FROM exercises');
    if ((rows?.[0]?.count ?? 0) === 0) {
      await run(db, 'INSERT INTO exercises (id,name,muscle_group,is_custom) VALUES (?,?,?,0)', [uuid(), 'Bench Press', 'chest']);
      await run(db, 'INSERT INTO exercises (id,name,muscle_group,is_custom) VALUES (?,?,?,0)', [uuid(), 'Back Squat', 'legs']);
      await run(db, 'INSERT INTO exercises (id,name,muscle_group,is_custom) VALUES (?,?,?,0)', [uuid(), 'Deadlift', 'back']);
    }
  } catch (e) {
    console.warn('seedIfNeeded error:', e);
  }
}

export async function startWorkout(splitDay?: string) {
  const db = await getDB();
  const id = uuid();
  const now = Date.now();
  try {
    await run(db, 'INSERT INTO workouts (id, started_at, split_day) VALUES (?,?,?)', [id, now, splitDay ?? null]);
  } catch (e) {
    console.warn('startWorkout error:', e);
  }
  return { id, started_at: now, split_day: splitDay ?? null };
}

export async function addSet(args: {
  workoutId: string; exerciseId: string; setIndex: number;
  reps: number; weightKg: number; rpe?: number; isWarmup?: 0|1;
}) {
  const { workoutId, exerciseId, setIndex, reps, weightKg, rpe, isWarmup = 0 } = args;
  const db = await getDB();
  const id = uuid();
  const createdAt = Date.now();
  try {
    await run(
      db,
      `INSERT INTO sets (id, workout_id, exercise_id, set_index, reps, weight_kg, rpe, is_warmup, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, workoutId, exerciseId, setIndex, reps, weightKg, rpe ?? null, isWarmup, createdAt]
    );
  } catch (e) {
    console.warn('addSet error:', e);
  }
  return id;
}

export async function finishWorkout(workoutId: string) {
  const db = await getDB();
  try {
    await run(db, 'UPDATE workouts SET finished_at = ? WHERE id = ?', [Date.now(), workoutId]);
  } catch (e) {
    console.warn('finishWorkout error:', e);
  }
}

export async function listRecentWorkouts(limit = 10) {
  const db = await getDB();
  try {
    // Some drivers are picky about binding LIMIT; we’ll inline the integer safely.
    const lim = Number.isFinite(limit) ? Math.max(1, Math.min(1000, Math.floor(limit))) : 10;
    return await all(
      db,
      `SELECT id, started_at, finished_at, split_day
       FROM workouts
       ORDER BY COALESCE(finished_at, started_at) DESC
       LIMIT ${lim}`
    );
  } catch (e) {
    console.warn('listRecentWorkouts error:', e);
    return [];
  }
}

export async function getExercises() {
  const db = await getDB();
  try {
    return await all<{ id: string; name: string }>(db, 'SELECT id, name FROM exercises ORDER BY name ASC');
  } catch (e) {
    console.warn('getExercises error:', e);
    return [];
  }
}
