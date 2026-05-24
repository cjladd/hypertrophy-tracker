// lib/ai/coaching.ts
// Template-based coaching insights triggered by training milestones.
// All text is source: 'template'. Phase 7 replaces with LLM-generated versions.

import { getDB } from '@/lib/db';
import { getExerciseProgressData } from '@/lib/repo/progress';
import type { CoachingInsight, InsightType } from './types';
import { getAllRecoveryScores, insertInsight } from './repo';

function formatMuscleGroup(mg: string): string {
  return mg.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Returns true if an insight of this type was generated within the last `withinMs` ms.
// Used for dedup — generators are safe to call on every refresh.
async function hasRecentInsight(insight_type: InsightType, withinMs: number): Promise<boolean> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM ai_insights WHERE insight_type = ? AND generated_at >= ? LIMIT 1`,
    [insight_type, Date.now() - withinMs],
  );
  return row !== null;
}

// =============================================================================
// Post-workout insight
// Called from the workout finish flow after progression state is updated.
// Checks triggers in priority order — returns on first match (one insight per finish).
// =============================================================================

export async function generatePostWorkoutInsight(
  workoutId: string,
): Promise<CoachingInsight | null> {
  // 1-hour window prevents duplicate calls if finish handler fires twice
  if (await hasRecentInsight('post_workout', 60 * 60 * 1000)) return null;

  const db = await getDB();

  // Trigger 1: return from a long break (≥7 days since last workout)
  const [thisWorkout, lastWorkout] = await Promise.all([
    db.getFirstAsync<{ started_at: number }>(
      `SELECT started_at FROM workouts WHERE id = ?`,
      [workoutId],
    ),
    db.getFirstAsync<{ ended_at: number }>(
      `SELECT ended_at FROM workouts
       WHERE ended_at IS NOT NULL AND id != ?
       ORDER BY ended_at DESC LIMIT 1`,
      [workoutId],
    ),
  ]);

  if (thisWorkout && lastWorkout) {
    const gapDays = (thisWorkout.started_at - lastWorkout.ended_at) / (24 * 60 * 60 * 1000);
    if (gapDays >= 7) {
      const content = gapDays >= 14
        ? 'Welcome back after the break. Start lighter than you think — the body readjusts faster than you expect.'
        : "Good to be back. Ease into it — consistency over the next few weeks matters more than today's numbers.";
      return insertInsight('post_workout', content, 'template');
    }
  }

  // Trigger 2: new personal record on any exercise in this workout
  const exercises = await db.getAllAsync<{ exercise_id: string; name: string }>(
    `SELECT we.exercise_id, e.name
     FROM workout_exercises we
     JOIN exercises e ON we.exercise_id = e.id
     WHERE we.workout_id = ?`,
    [workoutId],
  );

  for (const ex of exercises) {
    const history = await getExerciseProgressData(ex.exercise_id);
    if (history.length < 2) continue; // Need prior sessions to compare against

    const currentMax = history[history.length - 1].maxWeightLb;
    const priorMax = Math.max(...history.slice(0, -1).map((p) => p.maxWeightLb));

    if (currentMax > priorMax) {
      const content = `New PR on ${ex.name}: ${currentMax} lb. That's what consistent work looks like — keep building on it.`;
      return insertInsight('post_workout', content, 'template', { exercise_id: ex.exercise_id });
    }
  }

  return null;
}

// =============================================================================
// Daily insight
// Fires at most once per 23 hours.
// Trigger: a muscle group is well-recovered (≥85) and hasn't been trained in ≥4 days.
// =============================================================================

export async function generateDailyInsight(): Promise<CoachingInsight | null> {
  if (await hasRecentInsight('daily', 23 * 60 * 60 * 1000)) return null;

  const db = await getDB();
  const scores = await getAllRecoveryScores();

  for (const score of scores.filter((s) => s.score >= 85)) {
    const lastSession = await db.getFirstAsync<{ started_at: number }>(
      `SELECT w.started_at FROM workouts w
       JOIN workout_exercises we ON we.workout_id = w.id
       JOIN exercises e ON we.exercise_id = e.id
       WHERE e.muscle_group = ? AND w.ended_at IS NOT NULL
       ORDER BY w.started_at DESC LIMIT 1`,
      [score.muscle_group],
    );

    const daysSince = lastSession
      ? (Date.now() - lastSession.started_at) / (24 * 60 * 60 * 1000)
      : 999;

    if (daysSince >= 4) {
      const mg = formatMuscleGroup(score.muscle_group);
      const days = Math.floor(daysSince);
      const content = `${mg} is fully recovered (${score.score}/100) and hasn't been trained in ${days} day${days === 1 ? '' : 's'}. Good time to hit it.`;
      return insertInsight('daily', content, 'template', { muscle_group: score.muscle_group });
    }
  }

  return null;
}

// =============================================================================
// Weekly insight
// Fires at most once per 6 days.
// Summarises workout count from the past 7 days — consistency feedback.
// =============================================================================

export async function generateWeeklyInsight(): Promise<CoachingInsight | null> {
  if (await hasRecentInsight('weekly', 6 * 24 * 60 * 60 * 1000)) return null;

  const db = await getDB();
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM workouts
     WHERE ended_at IS NOT NULL AND started_at >= ?`,
    [Date.now() - 7 * 24 * 60 * 60 * 1000],
  );
  const weekCount = row?.count ?? 0;

  if (weekCount === 0) return null; // Nothing to say if no workouts

  let content: string;
  if (weekCount >= 5) {
    content = `${weekCount} workouts this week. High frequency — make sure recovery is keeping pace with the volume.`;
  } else if (weekCount >= 3) {
    content = `${weekCount} workouts this week. Consistency is where the real gains compound.`;
  } else if (weekCount === 1) {
    content = '1 workout this week. One session beats zero — build on it next week.';
  } else {
    content = `${weekCount} workouts this week. Solid effort. A bit more consistency and you'll start compounding the results.`;
  }

  return insertInsight('weekly', content, 'template');
}
