// lib/ai/anomaly.ts
// Rule-based anomaly detection over SQLite workout data. No ONNX required.
// Each detector returns null (no anomaly) or a DetectionResult.
// runAllAnomalyDetection() is the public entry point — call it from AIContext.refresh().

import { getDB } from '@/lib/db';
import { MuscleGroup } from '@/lib/types';
import { insertAnomaly } from './repo';
import type { AnomalySeverity, AnomalyType } from './types';

// =============================================================================
// Internal types
// =============================================================================

type DetectionResult = {
  anomaly_type: AnomalyType;
  severity: AnomalySeverity;
  details: Record<string, unknown>;
  exercise_id?: string;
  muscle_group?: MuscleGroup;
};

const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'shoulder', 'tricep', 'bicep',
  'quads', 'hamstrings', 'glutes', 'calves',
  'core', 'lower_back', 'upper_back', 'lats',
];

// =============================================================================
// Deduplication — skip if same type+target was already inserted < 24h ago
// =============================================================================

async function isDuplicate(
  anomaly_type: AnomalyType,
  exercise_id: string | null,
  muscle_group: MuscleGroup | null,
): Promise<boolean> {
  const db = await getDB();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM anomaly_log
     WHERE anomaly_type = ?
       AND exercise_id IS ?
       AND muscle_group IS ?
       AND dismissed_at IS NULL
       AND detected_at >= ?`,
    [anomaly_type, exercise_id, muscle_group, cutoff],
  );
  return row !== null;
}

// =============================================================================
// Detector: strength_drop
// Top-set weight on latest session dropped >15% vs prior sessions' average.
// Requires ≥4 completed sessions to fire (avoids single-session noise).
// =============================================================================

async function detectStrengthDropAnomaly(exerciseId: string): Promise<DetectionResult | null> {
  const db = await getDB();

  const exerciseRow = await db.getFirstAsync<{ name: string; muscle_group: MuscleGroup }>(
    `SELECT name, muscle_group FROM exercises WHERE id = ?`,
    [exerciseId],
  );
  if (!exerciseRow) return null;

  const rows = await db.getAllAsync<{ top_weight: number }>(
    `SELECT MAX(s.weight_lb) AS top_weight
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE we.exercise_id = ?
       AND s.set_type = 'working'
       AND w.ended_at IS NOT NULL
     GROUP BY w.id
     ORDER BY w.started_at DESC
     LIMIT 6`,
    [exerciseId],
  );

  if (rows.length < 4) return null;

  const current = rows[0].top_weight;
  const prior = rows.slice(1);
  const avg = prior.reduce((s, r) => s + r.top_weight, 0) / prior.length;

  if (avg === 0) return null;
  const dropPct = ((avg - current) / avg) * 100;
  if (dropPct < 15) return null;

  return {
    anomaly_type: 'strength_drop',
    severity: dropPct > 25 ? 'high' : 'medium',
    details: {
      exercise_name: exerciseRow.name,
      current_weight: Math.round(current),
      avg_weight: Math.round(avg),
      drop_pct: Math.round(dropPct),
    },
    exercise_id: exerciseId,
  };
}

// =============================================================================
// Detector: overtraining
// >20 working sets in 7 days for a muscle group exceeds MEV×2 threshold.
// =============================================================================

async function detectOvertrainingAnomaly(muscleGroup: MuscleGroup): Promise<DetectionResult | null> {
  const db = await getDB();
  const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const row = await db.getFirstAsync<{ total_sets: number }>(
    `SELECT COUNT(s.id) AS total_sets
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN exercises e ON we.exercise_id = e.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE e.muscle_group = ?
       AND s.set_type = 'working'
       AND w.ended_at IS NOT NULL
       AND w.started_at >= ?`,
    [muscleGroup, cutoff7d],
  );

  const totalSets = row?.total_sets ?? 0;
  if (totalSets <= 20) return null;

  return {
    anomaly_type: 'overtraining',
    severity: totalSets > 26 ? 'high' : 'medium',
    details: { total_sets: totalSets, threshold: 20, muscle_group: muscleGroup },
    muscle_group: muscleGroup,
  };
}

// =============================================================================
// Detector: rpe_degradation
// Average RPE >9.0 over 7 days, and volume hasn't already dropped (deload).
// Requires ≥3 RPE-logged sets to fire.
// =============================================================================

async function detectRPEDegradationAnomaly(muscleGroup: MuscleGroup): Promise<DetectionResult | null> {
  const db = await getDB();
  const now = Date.now();
  const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;
  const cutoff14d = now - 14 * 24 * 60 * 60 * 1000;

  const rpeRow = await db.getFirstAsync<{ avg_rpe: number; set_count: number }>(
    `SELECT AVG(s.rpe) AS avg_rpe, COUNT(s.id) AS set_count
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN exercises e ON we.exercise_id = e.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE e.muscle_group = ?
       AND s.set_type = 'working'
       AND s.rpe IS NOT NULL
       AND w.ended_at IS NOT NULL
       AND w.started_at >= ?`,
    [muscleGroup, cutoff7d],
  );

  if (!rpeRow || rpeRow.set_count < 3 || rpeRow.avg_rpe <= 9.0) return null;

  // Skip if volume already dropped ≥40% vs prior week (user is already deloading)
  const [curRow, prevRow] = await Promise.all([
    db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(s.id) AS count FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id
       JOIN exercises e ON we.exercise_id = e.id
       JOIN sets s ON s.workout_exercise_id = we.id
       WHERE e.muscle_group = ? AND s.set_type = 'working'
         AND w.ended_at IS NOT NULL AND w.started_at >= ?`,
      [muscleGroup, cutoff7d],
    ),
    db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(s.id) AS count FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id
       JOIN exercises e ON we.exercise_id = e.id
       JOIN sets s ON s.workout_exercise_id = we.id
       WHERE e.muscle_group = ? AND s.set_type = 'working'
         AND w.ended_at IS NOT NULL AND w.started_at >= ? AND w.started_at < ?`,
      [muscleGroup, cutoff14d, cutoff7d],
    ),
  ]);

  const curSets = curRow?.count ?? 0;
  const prevSets = prevRow?.count ?? 0;
  if (prevSets > 0 && curSets < prevSets * 0.6) return null;

  const avgRpe = Math.round(rpeRow.avg_rpe * 10) / 10;
  return {
    anomaly_type: 'rpe_degradation',
    severity: rpeRow.avg_rpe > 9.5 ? 'high' : 'medium',
    details: { avg_rpe: avgRpe, set_count: rpeRow.set_count, muscle_group: muscleGroup },
    muscle_group: muscleGroup,
  };
}

// =============================================================================
// Detector: volume_spike
// Sets this week ≥2× last week, and current week has ≥8 sets (avoids 0→2 noise).
// =============================================================================

async function detectVolumeSpikeAnomaly(muscleGroup: MuscleGroup): Promise<DetectionResult | null> {
  const db = await getDB();
  const now = Date.now();
  const cutoff7d = now - 7 * 24 * 60 * 60 * 1000;
  const cutoff14d = now - 14 * 24 * 60 * 60 * 1000;

  const [curRow, prevRow] = await Promise.all([
    db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(s.id) AS count FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id
       JOIN exercises e ON we.exercise_id = e.id
       JOIN sets s ON s.workout_exercise_id = we.id
       WHERE e.muscle_group = ? AND s.set_type = 'working'
         AND w.ended_at IS NOT NULL AND w.started_at >= ?`,
      [muscleGroup, cutoff7d],
    ),
    db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(s.id) AS count FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id
       JOIN exercises e ON we.exercise_id = e.id
       JOIN sets s ON s.workout_exercise_id = we.id
       WHERE e.muscle_group = ? AND s.set_type = 'working'
         AND w.ended_at IS NOT NULL AND w.started_at >= ? AND w.started_at < ?`,
      [muscleGroup, cutoff14d, cutoff7d],
    ),
  ]);

  const current = curRow?.count ?? 0;
  const prev = prevRow?.count ?? 0;

  if (current < 8 || prev === 0 || current / prev < 2) return null;

  const ratio = current / prev;
  return {
    anomaly_type: 'volume_spike',
    severity: ratio >= 3 ? 'high' : 'medium',
    details: {
      current_sets: current,
      prev_sets: prev,
      increase_pct: Math.round((ratio - 1) * 100),
      muscle_group: muscleGroup,
    },
    muscle_group: muscleGroup,
  };
}

// =============================================================================
// Detector: consecutive_stalls
// ≥2 exercises in the same muscle group with stall_count ≥3.
// =============================================================================

async function detectConsecutiveStallsAnomaly(muscleGroup: MuscleGroup): Promise<DetectionResult | null> {
  const db = await getDB();

  const row = await db.getFirstAsync<{ stalled_count: number }>(
    `SELECT COUNT(*) AS stalled_count
     FROM progression_state ps
     JOIN exercises e ON ps.exercise_id = e.id
     WHERE e.muscle_group = ? AND ps.stall_count >= 3`,
    [muscleGroup],
  );

  const stalledCount = row?.stalled_count ?? 0;
  if (stalledCount < 2) return null;

  return {
    anomaly_type: 'consecutive_stalls',
    severity: stalledCount >= 3 ? 'high' : 'medium',
    details: { stalled_count: stalledCount, muscle_group: muscleGroup },
    muscle_group: muscleGroup,
  };
}

// =============================================================================
// Public entry point
// =============================================================================

export async function runAllAnomalyDetection(): Promise<void> {
  const db = await getDB();

  // Gather all exercises that have at least one completed session
  const exercises = await db.getAllAsync<{ id: string }>(
    `SELECT DISTINCT we.exercise_id AS id
     FROM workout_exercises we
     JOIN workouts w ON we.workout_id = w.id
     WHERE w.ended_at IS NOT NULL`,
  );

  // Per-exercise detectors
  for (const ex of exercises) {
    try {
      const result = await detectStrengthDropAnomaly(ex.id);
      if (!result) continue;
      const dup = await isDuplicate(result.anomaly_type, result.exercise_id ?? null, null);
      if (!dup) await insertAnomaly(result.anomaly_type, result.severity, result.details, { exercise_id: result.exercise_id });
    } catch (e) {
      console.warn(`Anomaly detection failed for exercise ${ex.id}:`, e);
    }
  }

  // Per-muscle-group detectors
  const muscleDetectors = [
    detectOvertrainingAnomaly,
    detectRPEDegradationAnomaly,
    detectVolumeSpikeAnomaly,
    detectConsecutiveStallsAnomaly,
  ];

  for (const mg of ALL_MUSCLE_GROUPS) {
    for (const detect of muscleDetectors) {
      try {
        const result = await detect(mg);
        if (!result) continue;
        const dup = await isDuplicate(result.anomaly_type, null, result.muscle_group ?? null);
        if (!dup) await insertAnomaly(result.anomaly_type, result.severity, result.details, { muscle_group: result.muscle_group });
      } catch (e) {
        console.warn(`Anomaly detection failed for ${mg}:`, e);
      }
    }
  }
}
