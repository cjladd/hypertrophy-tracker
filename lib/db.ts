// lib/db.ts
import type { DB } from './sql';
import { exec, openDB } from './sql';

let db: DB | null = null;

export async function getDB() {
  if (db) return db;
  db = await openDB('hypertrophy.db');

  try { await exec(db, 'PRAGMA foreign_keys = ON;'); } catch {}
  try { await exec(db, 'PRAGMA journal_mode = WAL;'); } catch {}

  await migrate(db);
  return db;
}

async function migrate(db: DB) {
  const schemaSQL = `
  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    muscle_group TEXT,
    is_custom INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    split_day TEXT
  );
  CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY,
    workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id TEXT NOT NULL REFERENCES exercises(id),
    set_index INTEGER NOT NULL,
    reps INTEGER NOT NULL,
    weight_kg REAL NOT NULL,
    rpe REAL,
    is_warmup INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    workout_id TEXT,
    set_id TEXT,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  `;
  await exec(db, schemaSQL);
}
