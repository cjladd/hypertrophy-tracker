// lib/types.ts
// Type definitions for the Hypertrophy Tracker database models
// Aligned with PRD v1 data model

// Fixed muscle group enum per PRD §1
export type MuscleGroup =
  | 'chest'
  | 'shoulder'
  | 'tricep'
  | 'bicep'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'lower_back'
  | 'upper_back'
  | 'lats';

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'shoulder',
  'tricep',
  'bicep',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'lower_back',
  'upper_back',
  'lats',
];

export interface Exercise {
  id: string;
  name: string;
  muscle_group: MuscleGroup;
  is_custom: number; // 0 or 1 (SQLite boolean)
  rep_range_min: number; // default 8
  rep_range_max: number; // default 12
  created_at?: number;
}

export interface Template {
  id: string;
  name: string;
  exercise_ids: string; // JSON array stored as string
  created_at?: number;
}

export interface Workout {
  id: string;
  started_at: number;
  ended_at: number | null;
  template_id: string | null;
  notes: string | null;
}

// Junction table: links workout to exercises with ordering
export interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  order_index: number;
}

// Working sets only (no warmups per PRD)
export interface Set {
  id: string;
  workout_exercise_id: string;
  set_index: number;
  weight_lb: number;
  reps: number;
  rpe: number | null; // optional
  created_at: number;
}

// Derived cache for progression engine
export interface ProgressionState {
  exercise_id: string;
  last_suggested_weight_lb: number | null;
  last_successful_weight_lb: number | null;
  consecutive_non_success_exposures: number;
}

// Extended types for UI
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

// Settings types per PRD §3G
export interface Settings {
  weightJumpLb: number; // default 5
}

