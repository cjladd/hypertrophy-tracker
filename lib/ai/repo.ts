// lib/ai/repo.ts
// CRUD operations for all 6 AI tables

import { getDB } from '@/lib/db';
import { uuid } from '@/lib/repo/utils';
import { MuscleGroup } from '@/lib/types';
import {
  AISettings,
  AI_SETTINGS_DEFAULTS,
  AdaptiveSuggestion,
  AdjustmentStatus,
  AdjustmentType,
  AnomalyAlert,
  AnomalySeverity,
  AnomalyType,
  CoachingInsight,
  HealthSample,
  HealthSampleSource,
  HealthSampleType,
  InsightSource,
  InsightType,
  RecoveryScore,
} from './types';

// =============================================================================
// health_samples
// =============================================================================

export async function insertHealthSample(
  sample_type: HealthSampleType,
  value: number,
  recorded_at: number,
  source: HealthSampleSource = 'manual',
): Promise<HealthSample> {
  const db = await getDB();
  const id = uuid();
  const created_at = Date.now();
  await db.runAsync(
    `INSERT INTO health_samples (id, sample_type, value, recorded_at, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, sample_type, value, recorded_at, source, created_at],
  );
  return { id, sample_type, value, recorded_at, source, created_at };
}

/** Returns the most recent `limit` samples of the given type within the past `days` days. */
export async function getRecentHealthSamples(
  sample_type: HealthSampleType,
  days: number = 7,
  limit: number = 50,
): Promise<HealthSample[]> {
  const db = await getDB();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.getAllAsync<HealthSample>(
    `SELECT * FROM health_samples
     WHERE sample_type = ? AND recorded_at >= ?
     ORDER BY recorded_at DESC
     LIMIT ?`,
    [sample_type, cutoff, limit],
  );
}

/** Returns the single most recent sample of a given type, or null. */
export async function getLatestHealthSample(
  sample_type: HealthSampleType,
): Promise<HealthSample | null> {
  const db = await getDB();
  return db.getFirstAsync<HealthSample>(
    `SELECT * FROM health_samples WHERE sample_type = ? ORDER BY recorded_at DESC LIMIT 1`,
    [sample_type],
  );
}

// =============================================================================
// recovery_scores
// =============================================================================

/** Upserts a recovery score for a muscle group — one row per muscle group kept. */
export async function upsertRecoveryScore(
  muscle_group: MuscleGroup,
  score: number,
  model_version: string = 'heuristic',
  expires_in_ms: number = 12 * 60 * 60 * 1000, // 12 hours default TTL
): Promise<RecoveryScore> {
  const db = await getDB();
  const id = uuid();
  const computed_at = Date.now();
  const expires_at = computed_at + expires_in_ms;

  // Delete existing score for this muscle group before inserting fresh one
  await db.runAsync(`DELETE FROM recovery_scores WHERE muscle_group = ?`, [muscle_group]);
  await db.runAsync(
    `INSERT INTO recovery_scores (id, muscle_group, score, model_version, computed_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, muscle_group, score, model_version, computed_at, expires_at],
  );
  return { id, muscle_group, score, model_version, computed_at, expires_at };
}

/** Returns the most recent (non-expired) score for a muscle group, or null. */
export async function getRecoveryScore(
  muscle_group: MuscleGroup,
): Promise<RecoveryScore | null> {
  const db = await getDB();
  const now = Date.now();
  return db.getFirstAsync<RecoveryScore>(
    `SELECT * FROM recovery_scores
     WHERE muscle_group = ? AND expires_at > ?
     ORDER BY computed_at DESC LIMIT 1`,
    [muscle_group, now],
  );
}

/** Returns current scores for all muscle groups (non-expired only). */
export async function getAllRecoveryScores(): Promise<RecoveryScore[]> {
  const db = await getDB();
  const now = Date.now();
  return db.getAllAsync<RecoveryScore>(
    `SELECT * FROM recovery_scores WHERE expires_at > ? ORDER BY muscle_group`,
    [now],
  );
}

/** Returns muscle groups whose scores are expired or missing. */
export async function getStaleRecoveryMuscleGroups(
  allGroups: MuscleGroup[],
): Promise<MuscleGroup[]> {
  const current = await getAllRecoveryScores();
  const fresh = new Set(current.map((r) => r.muscle_group));
  return allGroups.filter((g) => !fresh.has(g));
}

// =============================================================================
// anomaly_log
// =============================================================================

export async function insertAnomaly(
  anomaly_type: AnomalyType,
  severity: AnomalySeverity,
  details: Record<string, unknown>,
  options: { exercise_id?: string; muscle_group?: MuscleGroup } = {},
): Promise<AnomalyAlert> {
  const db = await getDB();
  const id = uuid();
  const detected_at = Date.now();
  await db.runAsync(
    `INSERT INTO anomaly_log (id, exercise_id, muscle_group, anomaly_type, severity, details, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      options.exercise_id ?? null,
      options.muscle_group ?? null,
      anomaly_type,
      severity,
      JSON.stringify(details),
      detected_at,
    ],
  );
  return {
    id,
    exercise_id: options.exercise_id ?? null,
    muscle_group: options.muscle_group ?? null,
    anomaly_type,
    severity,
    details,
    detected_at,
    dismissed_at: null,
  };
}

/** Returns all un-dismissed anomalies, newest first. */
export async function getActiveAnomalies(): Promise<AnomalyAlert[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<Omit<AnomalyAlert, 'details'> & { details: string }>(
    `SELECT * FROM anomaly_log WHERE dismissed_at IS NULL ORDER BY detected_at DESC`,
  );
  return rows.map((r) => ({ ...r, details: JSON.parse(r.details) as Record<string, unknown> }));
}

export async function dismissAnomaly(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE anomaly_log SET dismissed_at = ? WHERE id = ?`,
    [Date.now(), id],
  );
}

// =============================================================================
// ai_insights
// =============================================================================

export async function insertInsight(
  insight_type: InsightType,
  content: string,
  source: InsightSource = 'template',
  options: { muscle_group?: MuscleGroup; exercise_id?: string } = {},
): Promise<CoachingInsight> {
  const db = await getDB();
  const id = uuid();
  const generated_at = Date.now();
  await db.runAsync(
    `INSERT INTO ai_insights (id, insight_type, muscle_group, exercise_id, content, source, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      insight_type,
      options.muscle_group ?? null,
      options.exercise_id ?? null,
      content,
      source,
      generated_at,
    ],
  );
  return {
    id,
    insight_type,
    muscle_group: options.muscle_group ?? null,
    exercise_id: options.exercise_id ?? null,
    content,
    source,
    generated_at,
    dismissed_at: null,
  };
}

/** Returns the most recent `limit` un-dismissed insights. */
export async function getRecentInsights(limit: number = 10): Promise<CoachingInsight[]> {
  const db = await getDB();
  return db.getAllAsync<CoachingInsight>(
    `SELECT * FROM ai_insights WHERE dismissed_at IS NULL ORDER BY generated_at DESC LIMIT ?`,
    [limit],
  );
}

export async function dismissInsight(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE ai_insights SET dismissed_at = ? WHERE id = ?`,
    [Date.now(), id],
  );
}

// =============================================================================
// program_adjustments
// =============================================================================

export async function insertAdjustment(
  adjustment_type: AdjustmentType,
  reasoning: string,
  parameters: Record<string, unknown> = {},
  options: {
    target_id?: string;
    target_type?: 'exercise' | 'routine' | 'muscle_group';
  } = {},
): Promise<AdaptiveSuggestion> {
  const db = await getDB();
  const id = uuid();
  const suggested_at = Date.now();
  await db.runAsync(
    `INSERT INTO program_adjustments
       (id, adjustment_type, target_id, target_type, reasoning, parameters, status, suggested_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      id,
      adjustment_type,
      options.target_id ?? null,
      options.target_type ?? null,
      reasoning,
      JSON.stringify(parameters),
      suggested_at,
    ],
  );
  return {
    id,
    adjustment_type,
    target_id: options.target_id ?? null,
    target_type: options.target_type ?? null,
    reasoning,
    parameters,
    status: 'pending',
    suggested_at,
    responded_at: null,
  };
}

/** Returns all pending suggestions, oldest first (so oldest surfaces first). */
export async function getPendingAdjustments(): Promise<AdaptiveSuggestion[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<
    Omit<AdaptiveSuggestion, 'parameters'> & { parameters: string }
  >(
    `SELECT * FROM program_adjustments WHERE status = 'pending' ORDER BY suggested_at ASC`,
  );
  return rows.map((r) => ({
    ...r,
    parameters: JSON.parse(r.parameters) as Record<string, unknown>,
  }));
}

export async function updateAdjustmentStatus(
  id: string,
  status: AdjustmentStatus,
): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `UPDATE program_adjustments SET status = ?, responded_at = ? WHERE id = ?`,
    [status, Date.now(), id],
  );
}

// =============================================================================
// ai_settings
// =============================================================================

/** Reads AI settings from the singleton row; returns defaults if not yet written. */
export async function getAISettings(): Promise<AISettings> {
  const db = await getDB();
  const row = await db.getFirstAsync<{
    ai_suggestions_enabled: number;
    recovery_scores_enabled: number;
    anomaly_detection_enabled: number;
    adaptive_programming_enabled: number;
    coaching_insights_enabled: number;
    llm_enabled: number;
    llm_model_path: string | null;
    llm_downloaded_at: number | null;
    health_integration_enabled: number;
    health_permissions_granted: number;
  }>(
    `SELECT * FROM ai_settings WHERE id = 'singleton'`,
  );
  if (!row) return { ...AI_SETTINGS_DEFAULTS };
  return {
    ai_suggestions_enabled: row.ai_suggestions_enabled === 1,
    recovery_scores_enabled: row.recovery_scores_enabled === 1,
    anomaly_detection_enabled: row.anomaly_detection_enabled === 1,
    adaptive_programming_enabled: row.adaptive_programming_enabled === 1,
    coaching_insights_enabled: row.coaching_insights_enabled === 1,
    llm_enabled: row.llm_enabled === 1,
    llm_model_path: row.llm_model_path,
    llm_downloaded_at: row.llm_downloaded_at,
    health_integration_enabled: row.health_integration_enabled === 1,
    health_permissions_granted: row.health_permissions_granted === 1,
  };
}

/** Upserts (creates or replaces) the singleton AI settings row. */
export async function saveAISettings(settings: AISettings): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO ai_settings
       (id, ai_suggestions_enabled, recovery_scores_enabled, anomaly_detection_enabled,
        adaptive_programming_enabled, coaching_insights_enabled, llm_enabled,
        llm_model_path, llm_downloaded_at, health_integration_enabled,
        health_permissions_granted, updated_at)
     VALUES ('singleton', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      settings.ai_suggestions_enabled ? 1 : 0,
      settings.recovery_scores_enabled ? 1 : 0,
      settings.anomaly_detection_enabled ? 1 : 0,
      settings.adaptive_programming_enabled ? 1 : 0,
      settings.coaching_insights_enabled ? 1 : 0,
      settings.llm_enabled ? 1 : 0,
      settings.llm_model_path,
      settings.llm_downloaded_at,
      settings.health_integration_enabled ? 1 : 0,
      settings.health_permissions_granted ? 1 : 0,
      Date.now(),
    ],
  );
}

/** Merges a partial update into existing AI settings. */
export async function patchAISettings(patch: Partial<AISettings>): Promise<void> {
  const current = await getAISettings();
  await saveAISettings({ ...current, ...patch });
}
