// lib/ai/types.ts
// Type definitions for the AI engine (Phase 0 foundation)

import { MuscleGroup } from '@/lib/types';

// =============================================================================
// Feature Vectors
// =============================================================================

/**
 * 15-dimensional input feature vector for the progressive overload ONNX model.
 * All fields are required; callers must supply defaults for missing data
 * (e.g. null RPE → 8.0, no prior exposure → 0).
 */
export interface ProgressionFeatureVector {
  current_weight_lb: number;
  top_set_reps: number;
  top_set_rpe: number;        // null RPE imputed as 8.0
  working_set_count: number;
  rep_range_min: number;
  rep_range_max: number;
  weight_jump_lb: number;
  stall_count: number;
  progression_ceiling: number;
  prev_weight_lb: number;     // 0 if no prior exposure
  prev_top_reps: number;      // 0 if no prior exposure
  prev_rpe: number;           // 8.0 if no prior exposure
  days_since_last: number;    // 0 if first exposure
  volume_trend_4wk: number;   // slope (sets/week); 0 if insufficient data
  recovery_score: number;     // 0–100; 75 (neutral) if unavailable
}

/**
 * 12-dimensional input feature vector for the recovery readiness ONNX model.
 * Per muscle group.
 */
export interface RecoveryFeatureVector {
  total_sets_7d: number;
  total_sets_14d: number;
  avg_rpe_7d: number;
  max_rpe_7d: number;
  sessions_7d: number;
  days_since_last_session: number;
  stall_ratio: number;            // 0–1, ratio of stalled exposures
  hrv_latest: number;             // ms; 0 if no health data
  resting_hr_latest: number;      // bpm; 0 if no health data
  sleep_hours_avg_7d: number;     // hours; 0 if no health data
  volume_trend_4wk: number;       // slope (sets/week)
  has_health_data: number;        // 0 or 1
}

// =============================================================================
// Model Outputs
// =============================================================================

/** Output from the progressive overload ONNX model (or rule-engine fallback). */
export interface ProgressionPrediction {
  exerciseId: string;
  next_weight_lb: number;       // rounded to nearest weight_jump_lb
  next_ceiling: 12 | 15 | 20;
  confidence: number;           // 0–1; < 0.6 → rule-engine fallback
  source: 'ai' | 'rule_engine';
  computed_at: number;          // Unix ms
}

/** Output from the recovery readiness ONNX model (or heuristic fallback). */
export interface RecoveryScore {
  id: string;
  muscle_group: MuscleGroup;
  score: number;                // 0–100
  model_version: string;        // 'heuristic' | 'onnx_v1' | …
  computed_at: number;          // Unix ms
  expires_at: number;           // Unix ms — rescore after this
}

// =============================================================================
// Anomaly Detection
// =============================================================================

export type AnomalyType =
  | 'strength_drop'
  | 'overtraining'
  | 'rpe_degradation'
  | 'volume_spike'
  | 'consecutive_stalls';

export type AnomalySeverity = 'low' | 'medium' | 'high';

export interface AnomalyAlert {
  id: string;
  exercise_id: string | null;
  muscle_group: MuscleGroup | null;
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  details: Record<string, unknown>;
  detected_at: number;
  dismissed_at: number | null;
}

// =============================================================================
// Adaptive Programming
// =============================================================================

export type AdjustmentType =
  | 'deload'
  | 'volume_increase'
  | 'volume_decrease'
  | 'exercise_swap'
  | 'frequency_change';

export type AdjustmentStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface AdaptiveSuggestion {
  id: string;
  adjustment_type: AdjustmentType;
  target_id: string | null;         // exercise_id or routine_id
  target_type: 'exercise' | 'routine' | 'muscle_group' | null;
  reasoning: string;
  parameters: Record<string, unknown>;
  status: AdjustmentStatus;
  suggested_at: number;
  responded_at: number | null;
}

// =============================================================================
// Coaching Insights
// =============================================================================

export type InsightType = 'post_workout' | 'daily' | 'weekly';
export type InsightSource = 'template' | 'llm';

export interface CoachingInsight {
  id: string;
  insight_type: InsightType;
  muscle_group: MuscleGroup | null;
  exercise_id: string | null;
  content: string;
  source: InsightSource;
  generated_at: number;
  dismissed_at: number | null;
}

// =============================================================================
// Health Samples
// =============================================================================

export type HealthSampleType = 'hrv' | 'resting_hr' | 'sleep_duration';
export type HealthSampleSource = 'healthkit' | 'health_connect' | 'manual';

export interface HealthSample {
  id: string;
  sample_type: HealthSampleType;
  value: number;          // ms for HRV, bpm for resting HR, hours for sleep
  recorded_at: number;    // Unix ms — when the measurement was taken
  source: HealthSampleSource;
  created_at: number;     // Unix ms — when we stored it
}

// =============================================================================
// AI Settings
// =============================================================================

export interface AISettings {
  ai_suggestions_enabled: boolean;
  recovery_scores_enabled: boolean;
  anomaly_detection_enabled: boolean;
  adaptive_programming_enabled: boolean;
  coaching_insights_enabled: boolean;
  llm_enabled: boolean;
  llm_model_path: string | null;
  llm_downloaded_at: number | null;
  health_integration_enabled: boolean;
  health_permissions_granted: boolean;
}

export const AI_SETTINGS_DEFAULTS: AISettings = {
  ai_suggestions_enabled: true,
  recovery_scores_enabled: true,
  anomaly_detection_enabled: true,
  adaptive_programming_enabled: false, // disabled until sufficient training data accrues
  coaching_insights_enabled: true,
  llm_enabled: false,
  llm_model_path: null,
  llm_downloaded_at: null,
  health_integration_enabled: false,
  health_permissions_granted: false,
};
