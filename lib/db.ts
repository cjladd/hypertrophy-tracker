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
    // Create exercises table (PRD §1)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        muscle_group TEXT NOT NULL,
        is_custom INTEGER DEFAULT 0,
        rep_range_min INTEGER DEFAULT 8,
        rep_range_max INTEGER DEFAULT 12,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
    `);

    // Create templates table (PRD §1)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        exercise_ids TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
    `);

    // Create workouts table (PRD §1)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS workouts (
        id TEXT PRIMARY KEY,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        template_id TEXT,
        notes TEXT,
        FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
      );
    `);

    // Create workout_exercises junction table (PRD §1)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS workout_exercises (
        id TEXT PRIMARY KEY,
        workout_id TEXT NOT NULL,
        exercise_id TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
        FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
      );
    `);

    // Create sets table - working sets only (PRD §1)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sets (
        id TEXT PRIMARY KEY,
        workout_exercise_id TEXT NOT NULL,
        set_index INTEGER NOT NULL,
        weight_lb REAL NOT NULL,
        reps INTEGER NOT NULL,
        rpe REAL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE CASCADE
      );
    `);

    // Create progression_state table (PRD §1)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS progression_state (
        exercise_id TEXT PRIMARY KEY,
        last_suggested_weight_lb REAL,
        last_successful_weight_lb REAL,
        consecutive_non_success_exposures INTEGER DEFAULT 0,
        FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
      );
    `);

    // Create routines table (split_migration.md §1)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS routines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_preset INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
    `);

    // Create routine_days table (split_migration.md §1)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS routine_days (
        id TEXT PRIMARY KEY,
        routine_id TEXT NOT NULL,
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL,
        template_id TEXT,
        exercise_ids TEXT DEFAULT '[]',
        FOREIGN KEY (routine_id) REFERENCES routines(id) ON DELETE CASCADE,
        FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
      );
    `);

    // Add routine_day_id to workouts if not exists (split_migration.md §1.2)
    // SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we check first
    try {
      await db.execAsync(`ALTER TABLE workouts ADD COLUMN routine_day_id TEXT REFERENCES routine_days(id) ON DELETE SET NULL`);
    } catch {
      // Column likely already exists, ignore error
    }

    // Create indexes for better query performance
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id);
      CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise ON workout_exercises(exercise_id);
      CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise ON sets(workout_exercise_id);
      CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(started_at);
      CREATE INDEX IF NOT EXISTS idx_workouts_template ON workouts(template_id);
      CREATE INDEX IF NOT EXISTS idx_workouts_routine_day ON workouts(routine_day_id);
      CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
      CREATE INDEX IF NOT EXISTS idx_exercises_muscle ON exercises(muscle_group);
      CREATE INDEX IF NOT EXISTS idx_routine_days_routine ON routine_days(routine_id);
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

// Reset database for development (drops all tables and recreates)
export async function resetDB(): Promise<void> {
  const db = await getDB();
  try {
    await db.execAsync(`
      DROP TABLE IF EXISTS sets;
      DROP TABLE IF EXISTS workout_exercises;
      DROP TABLE IF EXISTS progression_state;
      DROP TABLE IF EXISTS routine_days;
      DROP TABLE IF EXISTS routines;
      DROP TABLE IF EXISTS workouts;
      DROP TABLE IF EXISTS templates;
      DROP TABLE IF EXISTS exercises;
    `);
    await initializeTables(db);
    console.log('Database reset successfully');
  } catch (error) {
    console.error('Failed to reset database:', error);
    throw error;
  }
}
