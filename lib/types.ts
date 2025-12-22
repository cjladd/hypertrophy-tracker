// lib/types.ts
// Type definitions for the Hypertrophy Tracker database models

export interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  is_custom: number; // 0 or 1 (SQLite boolean)
  created_at?: number;
}

export interface Workout {
  id: string;
  started_at: number;
  finished_at: number | null;
  split_day: string | null;
  notes: string | null;
}

export interface Set {
  id: string;
  workout_id: string;
  exercise_id: string;
  set_index: number;
  reps: number;
  weight_kg: number;
  rpe: number | null;
  is_warmup: number; // 0 or 1 (SQLite boolean)
  notes: string | null;
  created_at: number;
}

export interface WorkoutWithDetails extends Workout {
  exercises?: Exercise[];
  sets?: Set[];
  totalVolume?: number;
  duration?: number;
}

export interface ExerciseHistory {
  exercise: Exercise;
  sets: Set[];
  lastWorkout?: Workout;
  personalRecords?: {
    maxWeight: number;
    maxReps: number;
    maxVolume: number;
  };
}

// Settings types
export interface Settings {
  autoIncrementWeight: boolean;
  restTimerEnabled: boolean;
  plateCalculatorEnabled: boolean;
  weightIncrementLbs: number;
}
