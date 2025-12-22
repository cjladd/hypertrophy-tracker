// lib/db.ts
import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    dbInstance = await SQLite.openDatabaseAsync('hypertrophy_tracker.db');
    await initializeTables(dbInstance);
    return dbInstance;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

async function initializeTables(db: SQLite.SQLiteDatabase) {
  try {
    // Create exercises table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        muscle_group TEXT,
        is_custom INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
    `);

    // Create workouts table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS workouts (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        split_day TEXT,
        notes TEXT
      );
    `);

    // Create sets table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sets (
        id TEXT PRIMARY KEY,
        workout_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        set_index INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        weight_kg REAL NOT NULL,
        rpe INTEGER,
        is_warmup INTEGER DEFAULT 0,
        notes TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
        FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
      );
    `);

    // Create indexes for better query performance
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_sets_workout ON sets(workout_id);
      CREATE INDEX IF NOT EXISTS idx_sets_exercise ON sets(exercise_id);
      CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(started_at);
      CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Failed to create tables:', error);
    throw error;
  }
}

export async function closeDB() {
  if (dbInstance) {
    try {
      await dbInstance.closeAsync();
      dbInstance = null;
    } catch (error) {
      console.error('Failed to close database:', error);
    }
  }
}
