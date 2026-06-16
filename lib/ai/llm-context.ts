// lib/ai/llm-context.ts
// Phase 7.2: builds the grounded context string for the Personal Trainer Bot.
//
// Everything here is assembled ON-DEVICE from SQLite. Only the final string would ever
// be sent to the backend proxy — never raw tables, identifiers, or PII. The bot's value
// is that it answers from THIS user's actual data, not generic training advice.

import { getDB } from '@/lib/db';
import {
  getProgressionState,
  getProgressionSuggestion,
  getRoutineById,
  getSettings,
} from '@/lib/repo';
import { MuscleGroup } from '@/lib/types';
import {
  getActiveAnomalies,
  getAllRecoveryScores,
  getPendingAdjustments,
} from './repo';

const HISTORY_DAYS = 14;
const MAX_HISTORY_ROWS = 24;     // most-recent workout/exercise lines
const MAX_STATE_EXERCISES = 14;  // progression-state lines

const IDENTITY =
  'You are a personal strength-training coach embedded in the user\'s hypertrophy ' +
  'tracking app. You know this user\'s exact training history, recovery, and the app\'s ' +
  'AI recommendations below. Answer ONLY from this data — concise, specific, no generic ' +
  'advice. If the data does not support an answer, say so.';

function formatMuscleGroup(mg: string): string {
  return mg.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function daysAgo(ts: number): number {
  return Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
}

interface HistoryRow {
  workout_id: string;
  started_at: number;
  exercise_id: string;
  exercise_name: string;
  muscle_group: MuscleGroup;
  top_weight: number;
  avg_reps: number;
  working_sets: number;
  avg_rpe: number | null;
}

// =============================================================================
// Blocks
// =============================================================================

async function goalsBlock(): Promise<string> {
  const settings = await getSettings();
  const lines = [`- Weight increment preference: ${settings.weightJumpLb} lb`];
  // activeRoutineId is carried in the AsyncStorage settings blob (untyped on Settings).
  const activeRoutineId = (settings as unknown as Record<string, unknown>).activeRoutineId as
    | string
    | undefined;
  if (activeRoutineId) {
    const routine = await getRoutineById(activeRoutineId);
    if (routine) lines.push(`- Active routine: ${routine.name}`);
  }
  return `GOALS\n${lines.join('\n')}`;
}

async function historyRowsLast14d(): Promise<HistoryRow[]> {
  const db = await getDB();
  const cutoff = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  return db.getAllAsync<HistoryRow>(
    `SELECT w.id AS workout_id, w.started_at,
            e.id AS exercise_id, e.name AS exercise_name, e.muscle_group,
            MAX(s.weight_lb) AS top_weight,
            ROUND(AVG(s.reps)) AS avg_reps,
            COUNT(s.id) AS working_sets,
            AVG(s.rpe) AS avg_rpe
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN exercises e ON we.exercise_id = e.id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.ended_at IS NOT NULL AND s.set_type = 'working' AND w.started_at >= ?
     GROUP BY w.id, e.id
     ORDER BY w.started_at DESC
     LIMIT ?`,
    [cutoff, MAX_HISTORY_ROWS],
  );
}

function historyBlock(rows: HistoryRow[]): string {
  if (rows.length === 0) return `RECENT TRAINING (last ${HISTORY_DAYS} days)\n- None logged.`;
  const lines = rows.map((r) => {
    const rpe = r.avg_rpe != null ? `, RPE ${r.avg_rpe.toFixed(1)}` : '';
    return `- ${fmtDate(r.started_at)} ${r.exercise_name}: ${r.working_sets}×${r.avg_reps} @ ${Math.round(r.top_weight)} lb top${rpe}`;
  });
  return `RECENT TRAINING (last ${HISTORY_DAYS} days)\n${lines.join('\n')}`;
}

async function progressionStateBlock(rows: HistoryRow[]): Promise<string> {
  // Unique exercises trained recently, most-recent first.
  const seen = new Set<string>();
  const exercises: { id: string; name: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.exercise_id)) continue;
    seen.add(r.exercise_id);
    exercises.push({ id: r.exercise_id, name: r.exercise_name });
    if (exercises.length >= MAX_STATE_EXERCISES) break;
  }
  if (exercises.length === 0) return '';

  const lines: string[] = [];
  for (const ex of exercises) {
    const st = await getProgressionState(ex.id);
    if (!st) continue;
    const stall = st.stall_count > 0 ? `, stalled ${st.stall_count}×` : '';
    lines.push(
      `- ${ex.name}: working weight ${Math.round(st.last_weight_lb ?? 0)} lb, ceiling ${st.progression_ceiling} reps${stall}`,
    );
  }
  return lines.length ? `PROGRESSION STATE\n${lines.join('\n')}` : '';
}

async function recoveryBlock(): Promise<string> {
  const scores = await getAllRecoveryScores();
  if (scores.length === 0) return '';
  const lines = scores
    .sort((a, b) => a.score - b.score)
    .map((s) => {
      const tier = s.score >= 75 ? 'ready' : s.score >= 50 ? 'caution' : 'fatigued';
      const src = s.model_version === 'onnx_v1' ? 'AI' : 'est';
      return `- ${formatMuscleGroup(s.muscle_group)}: ${s.score}/100 (${tier}, ${src})`;
    });
  return `RECOVERY (per muscle group)\n${lines.join('\n')}`;
}

async function signalsBlock(): Promise<string> {
  const [anomalies, suggestions] = await Promise.all([
    getActiveAnomalies(),
    getPendingAdjustments(),
  ]);
  const lines: string[] = [];
  for (const a of anomalies.slice(0, 5)) {
    const target = a.muscle_group ? formatMuscleGroup(a.muscle_group) : 'exercise';
    lines.push(`- Alert (${a.severity}): ${a.anomaly_type.replace(/_/g, ' ')} — ${target}`);
  }
  for (const s of suggestions.slice(0, 5)) {
    lines.push(`- Suggestion: ${s.adjustment_type.replace(/_/g, ' ')} — ${s.reasoning}`);
  }
  return lines.length ? `ACTIVE SIGNALS\n${lines.join('\n')}` : '';
}

// "Why this weight" — only when the user is asking about a specific exercise.
async function modelExplanationBlock(exerciseId: string): Promise<string> {
  const db = await getDB();
  const ex = await db.getFirstAsync<{ name: string }>(
    `SELECT name FROM exercises WHERE id = ?`,
    [exerciseId],
  );
  if (!ex) return '';
  const sugg = await getProgressionSuggestion(exerciseId);
  const engine = sugg.source === 'ai'
    ? `AI model${sugg.confidence != null ? ` (confidence ${Math.round(sugg.confidence * 100)}%)` : ''}`
    : 'rule engine';
  return (
    `CURRENT RECOMMENDATION — ${ex.name}\n` +
    `- Suggested next: ${Math.round(sugg.suggestedWeightLb)} lb, rep ceiling ${sugg.currentCeiling}\n` +
    `- Source: ${engine}\n` +
    `- Reasoning: ${sugg.reasonMessage}`
  );
}

// =============================================================================
// Public
// =============================================================================

/**
 * Assembles the full grounded context string for a trainer-bot conversation.
 * Pass `exerciseId` when the user is asking about a specific lift to append the
 * current recommendation + reasoning for it. Target stays well under ~2k tokens via
 * the row caps above; oldest history is dropped first by the SQL LIMIT.
 */
export async function buildTrainerContext(exerciseId?: string): Promise<string> {
  const historyRows = await historyRowsLast14d();

  const blocks = await Promise.all([
    Promise.resolve(IDENTITY),
    goalsBlock(),
    Promise.resolve(historyBlock(historyRows)),
    progressionStateBlock(historyRows),
    recoveryBlock(),
    signalsBlock(),
    exerciseId ? modelExplanationBlock(exerciseId) : Promise.resolve(''),
  ]);

  return blocks.filter((b) => b.trim().length > 0).join('\n\n');
}
