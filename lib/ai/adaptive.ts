// lib/ai/adaptive.ts
// Phase 5: adaptive programming. Turns recovery scores + anomaly signals into
// actionable, accept/reject-able suggestions (deload, volume change, exercise swap,
// frequency change). Rule-based — no ONNX. runAdaptiveProgramming() is the entry point,
// called from AIContext.refresh() when `adaptiveProgrammingEnabled`.

import { getDB } from '@/lib/db';
import { MuscleGroup } from '@/lib/types';
import { buildRecoveryFeatureVector } from './features';
import {
  getActiveAnomalies,
  getPendingAdjustments,
  getRecoveryScore,
  insertAdjustment,
} from './repo';
import type { AdjustmentType, RecoveryFeatureVector } from './types';

const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'shoulder', 'tricep', 'bicep',
  'quads', 'hamstrings', 'glutes', 'calves',
  'core', 'lower_back', 'upper_back', 'lats',
];

// Cap distinct pending suggestions per muscle group so the home screen never floods.
const MAX_PENDING_PER_MUSCLE = 2;

type AdjustmentResult = {
  adjustment_type: AdjustmentType;
  reasoning: string;
  parameters: Record<string, unknown>;
  target_id: string;
  target_type: 'exercise' | 'muscle_group';
  muscle_group: MuscleGroup; // used only for per-muscle cap accounting
};

function formatMuscleGroup(mg: string): string {
  return mg.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function countStalledExercises(mg: MuscleGroup, minStall: number): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM progression_state ps
     JOIN exercises e ON ps.exercise_id = e.id
     WHERE e.muscle_group = ? AND ps.stall_count >= ?`,
    [mg, minStall],
  );
  return row?.c ?? 0;
}

// =============================================================================
// Generators — each returns an AdjustmentResult or null
// =============================================================================

// Deload: low recovery AND broad stalling across the muscle group.
async function maybeDeload(
  mg: MuscleGroup,
  score: number | null,
  vec: RecoveryFeatureVector,
): Promise<AdjustmentResult | null> {
  if (score == null || score >= 40) return null;
  if (vec.stall_ratio <= 0.5) return null;
  const stalled = await countStalledExercises(mg, 2);
  if (stalled < 2) return null;
  const label = formatMuscleGroup(mg);
  return {
    adjustment_type: 'deload',
    reasoning: `${label} recovery is low (${score}/100) and ${stalled} exercises are stalling. A deload — lighter weight and reduced volume for a week — can let you supercompensate and break the plateau.`,
    parameters: { muscle_group: mg, recovery_score: score, stalled_count: stalled },
    target_id: mg,
    target_type: 'muscle_group',
    muscle_group: mg,
  };
}

// Volume increase: recovering well but weekly volume is flat/declining while training.
function maybeVolumeIncrease(
  mg: MuscleGroup,
  score: number | null,
  vec: RecoveryFeatureVector,
): AdjustmentResult | null {
  if (score == null || score <= 80) return null;
  if (vec.volume_trend_4wk > 0 || vec.sessions_7d < 2) return null;
  const label = formatMuscleGroup(mg);
  return {
    adjustment_type: 'volume_increase',
    reasoning: `${label} is recovering well (${score}/100) but weekly volume has been flat. You likely have room to add a set or two to keep progressing.`,
    parameters: {
      muscle_group: mg,
      recovery_score: score,
      volume_trend_4wk: Number(vec.volume_trend_4wk.toFixed(2)),
    },
    target_id: mg,
    target_type: 'muscle_group',
    muscle_group: mg,
  };
}

// Volume decrease: an active overtraining anomaly for this muscle group.
function maybeVolumeDecrease(
  mg: MuscleGroup,
  overtrainingByMuscle: Map<MuscleGroup, number>,
): AdjustmentResult | null {
  const totalSets = overtrainingByMuscle.get(mg);
  if (totalSets == null) return null;
  const label = formatMuscleGroup(mg);
  return {
    adjustment_type: 'volume_decrease',
    reasoning: `${label} volume is high (${totalSets} working sets in the last 7 days). Pulling back a few sets this week reduces fatigue without giving up progress.`,
    parameters: { muscle_group: mg, total_sets: totalSets },
    target_id: mg,
    target_type: 'muscle_group',
    muscle_group: mg,
  };
}

// Frequency change: fully recovered but not trained in a while (undertrained, not abandoned).
function maybeFrequencyChange(
  mg: MuscleGroup,
  score: number | null,
  vec: RecoveryFeatureVector,
): AdjustmentResult | null {
  if (score == null || score <= 85) return null;
  // > 60 days reads as "not part of the program", not an undertraining signal.
  if (vec.days_since_last_session <= 10 || vec.days_since_last_session > 60) return null;
  const days = Math.round(vec.days_since_last_session);
  const label = formatMuscleGroup(mg);
  return {
    adjustment_type: 'frequency_change',
    reasoning: `You haven't trained ${label} in ${days} days and it's fully recovered (${score}/100). Training it more frequently could add productive volume.`,
    parameters: { muscle_group: mg, days_since_last: days, recovery_score: score },
    target_id: mg,
    target_type: 'muscle_group',
    muscle_group: mg,
  };
}

// Exercise swap: a single exercise stuck for ≥3 sessions — fresh stimulus needed.
async function generateExerciseSwaps(): Promise<AdjustmentResult[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<{
    exercise_id: string;
    name: string;
    muscle_group: MuscleGroup;
    stall_count: number;
  }>(
    `SELECT ps.exercise_id, e.name, e.muscle_group, ps.stall_count
     FROM progression_state ps
     JOIN exercises e ON ps.exercise_id = e.id
     WHERE ps.stall_count >= 3`,
  );
  return rows.map((r) => ({
    adjustment_type: 'exercise_swap' as const,
    reasoning: `${r.name} has stalled ${r.stall_count} sessions in a row. Swapping it for a similar variation can provide a fresh stimulus and break the plateau.`,
    parameters: {
      exercise_id: r.exercise_id,
      exercise_name: r.name,
      muscle_group: r.muscle_group,
      stall_count: r.stall_count,
    },
    target_id: r.exercise_id,
    target_type: 'exercise' as const,
    muscle_group: r.muscle_group,
  }));
}

// =============================================================================
// Public entry point
// =============================================================================

export async function runAdaptiveProgramming(): Promise<void> {
  const pending = await getPendingAdjustments();

  // De-dup key + per-muscle cap accounting, seeded from existing pending suggestions.
  const existingKeys = new Set(pending.map((p) => `${p.adjustment_type}:${p.target_id}`));
  const pendingByMuscle = new Map<MuscleGroup, number>();
  for (const p of pending) {
    const mg =
      p.target_type === 'muscle_group'
        ? (p.target_id as MuscleGroup)
        : ((p.parameters?.muscle_group as MuscleGroup | undefined) ?? null);
    if (mg) pendingByMuscle.set(mg, (pendingByMuscle.get(mg) ?? 0) + 1);
  }

  // Active overtraining anomalies drive volume-decrease suggestions.
  const anomalies = await getActiveAnomalies();
  const overtrainingByMuscle = new Map<MuscleGroup, number>();
  for (const a of anomalies) {
    if (a.anomaly_type === 'overtraining' && a.muscle_group) {
      overtrainingByMuscle.set(a.muscle_group, Number(a.details?.total_sets ?? 0));
    }
  }

  // Collect candidates from all generators.
  const candidates: AdjustmentResult[] = [];
  for (const mg of ALL_MUSCLE_GROUPS) {
    const score = (await getRecoveryScore(mg))?.score ?? null;
    const vec = await buildRecoveryFeatureVector(mg);
    const results = [
      await maybeDeload(mg, score, vec),
      maybeVolumeIncrease(mg, score, vec),
      maybeVolumeDecrease(mg, overtrainingByMuscle),
      maybeFrequencyChange(mg, score, vec),
    ];
    for (const r of results) if (r) candidates.push(r);
  }
  candidates.push(...(await generateExerciseSwaps()));

  // Insert, respecting de-dup and the per-muscle cap.
  for (const c of candidates) {
    const key = `${c.adjustment_type}:${c.target_id}`;
    if (existingKeys.has(key)) continue;
    if ((pendingByMuscle.get(c.muscle_group) ?? 0) >= MAX_PENDING_PER_MUSCLE) continue;
    try {
      await insertAdjustment(c.adjustment_type, c.reasoning, c.parameters, {
        target_id: c.target_id,
        target_type: c.target_type,
      });
      existingKeys.add(key);
      pendingByMuscle.set(c.muscle_group, (pendingByMuscle.get(c.muscle_group) ?? 0) + 1);
    } catch (e) {
      console.warn(`Failed to insert adjustment ${key}:`, e);
    }
  }
}
