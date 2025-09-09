// lib/repo.ts
import { getDB } from './db';
import * as Crypto from 'expo-crypto';

function uuid() {
    // expo-crypto randomUUID is synchronous and safe in modern Expo
    // (alternative patterns exist; this keeps it simple).
    return (Crypto as any).randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2);
}

export async function seedIfNeeded() {
    const db = await getDB();
    const rows = await db.getAllAsync<{ count: number }>('SELECT COUNT(*) as count FROM exercises');
    if ((rows?.[0]?.count ?? 0) === 0) {
        await db.runAsync('INSERT INTO exercises (id,name,muscle_group,is_custom) VALUES (?,?,?,0)', [uuid(), 'Bench Press', 'chest']);
        await db.runAsync('INSERT INTO exercises (id,name,muscle_group,is_custom) VALUES (?,?,?,0)', [uuid(), 'Back Squat', 'legs']);
        await db.runAsync('INSERT INTO exercises (id,name,muscle_group,is_custom) VALUES (?,?,?,0)', [uuid(), 'Deadlift', 'back']);
    }
}

export async function startWorkout(splitDay?: string) {
    const db = await getDB();
    const id = uuid();
    const now = Date.now();
    await db.runAsync('INSERT INTO workouts (id, started_at, split_day) VALUES (?,?,?)', [id, now, splitDay ?? null]);
    return { id, started_at: now, split_day: splitDay ?? null };
}

export async function addSet(args: {
    workoutId: string; exerciseId: string; setIndex: number;
    reps: number; weightKg: number; rpe?: number; isWarmup?: 0 | 1;
}) {
    const { workoutId, exerciseId, setIndex, reps, weightKg, rpe, isWarmup = 0 } = args;
    const db = await getDB();
    const id = uuid();
    const createdAt = Date.now();
    await db.runAsync(
        `INSERT INTO sets (id, workout_id, exercise_id, set_index, reps, weight_kg, rpe, is_warmup, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
        [id, workoutId, exerciseId, setIndex, reps, weightKg, rpe ?? null, isWarmup, createdAt]
    );
    return id;
}

export async function finishWorkout(workoutId: string) {
    const db = await getDB();
    await db.runAsync('UPDATE workouts SET finished_at = ? WHERE id = ?', [Date.now(), workoutId]);
}

export async function listRecentWorkouts(limit = 10) {
    const db = await getDB();
    return db.getAllAsync(
        `SELECT id, started_at, finished_at, split_day
     FROM workouts
     ORDER BY COALESCE(finished_at, started_at) DESC
     LIMIT ?`,
        [limit]
    );
}

export async function getExercises() {
    const db = await getDB();
    return db.getAllAsync('SELECT id, name FROM exercises ORDER BY name ASC');
}
