import { getDB } from '../db';
import { all, get, run } from '../sql';
import { Routine, RoutineDay, RoutineWithTemplates, Template, TemplatesGroupedByRoutine } from '../types';
import { getExercises } from './exercises';
import { createTemplate, getTemplates } from './templates';
import { uuid } from './utils';

// ============================================
// ROUTINES
// ============================================

// Helper to create a routine with days (used by all seed functions)
async function createRoutineWithDays(
  routineName: string,
  days: { name: string; exerciseNames: string[] }[]
): Promise<string | null> {
  const db = await getDB();
  
  // Check if routine already exists
  const existing = await get<{ count: number }>(
    db,
    'SELECT COUNT(*) as count FROM routines WHERE name = ? AND is_preset = 1',
    [routineName]
  );
  if ((existing?.count ?? 0) > 0) {
    console.log(`${routineName} routine already exists, skipping seed`);
    return null;
  }

  // Get all exercises for lookups
  const exercises = await getExercises();
  const getExerciseId = (name: string): string | undefined =>
    exercises.find((e) => e.name === name)?.id;

  // Create routine
  const routineId = uuid();
  const now = Date.now();
  await run(
    db,
    'INSERT INTO routines (id, name, is_preset, created_at) VALUES (?,?,1,?)',
    [routineId, routineName, now]
  );

  // Create days with templates
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const exerciseIds = day.exerciseNames.map(getExerciseId).filter(Boolean) as string[];
    
    // Check if template exists, create if not
    let template = await get<Template>(db, 'SELECT * FROM templates WHERE name = ?', [day.name]);
    if (!template) {
      template = await createTemplate(day.name, exerciseIds);
    }

    await run(
      db,
      'INSERT INTO routine_days (id, routine_id, name, order_index, template_id, exercise_ids) VALUES (?,?,?,?,?,?)',
      [uuid(), routineId, day.name, i, template.id, '[]']
    );
  }

  console.log(`Seeded ${routineName} routine with ${days.length} days`);
  return routineId;
}

// Seed PPL routine with default templates (idempotent)
export async function seedPPLRoutine(): Promise<void> {
  try {
    await createRoutineWithDays('PPL', [
      {
        name: 'Push',
        exerciseNames: [
          'Bench Press',
          'Incline Dumbbell Press',
          'Overhead Press',
          'Lateral Raise',
          'Tricep Pushdown',
          'Skull Crusher',
        ],
      },
      {
        name: 'Pull',
        exerciseNames: [
          'Pull-Up',
          'Lat Pulldown',
          'Barbell Row',
          'Cable Row',
          'Face Pull',
          'Barbell Curl',
          'Hammer Curl',
        ],
      },
      {
        name: 'Legs',
        exerciseNames: [
          'Back Squat',
          'Leg Press',
          'Romanian Deadlift',
          'Leg Extension',
          'Lying Leg Curl',
          'Standing Calf Raise',
        ],
      },
    ]);
  } catch (e) {
    console.warn('seedPPLRoutine error:', e);
  }
}

// Seed Upper/Lower routine (4-day split)
export async function seedUpperLowerRoutine(): Promise<void> {
  try {
    await createRoutineWithDays('Upper/Lower', [
      {
        name: 'Upper A',
        exerciseNames: [
          'Bench Press',
          'Barbell Row',
          'Overhead Press',
          'Lat Pulldown',
          'Barbell Curl',
          'Tricep Pushdown',
        ],
      },
      {
        name: 'Lower A',
        exerciseNames: [
          'Back Squat',
          'Romanian Deadlift',
          'Leg Press',
          'Lying Leg Curl',
          'Standing Calf Raise',
        ],
      },
      {
        name: 'Upper B',
        exerciseNames: [
          'Incline Dumbbell Press',
          'Cable Row',
          'Dumbbell Row',
          'Lateral Raise',
          'Hammer Curl',
          'Skull Crusher',
        ],
      },
      {
        name: 'Lower B',
        exerciseNames: [
          'Deadlift',
          'Front Squat',
          'Leg Extension',
          'Seated Leg Curl',
          'Hip Thrust',
          'Seated Calf Raise',
        ],
      },
    ]);
  } catch (e) {
    console.warn('seedUpperLowerRoutine error:', e);
  }
}

// Seed Full Body routine (3-day split)
export async function seedFullBodyRoutine(): Promise<void> {
  try {
    await createRoutineWithDays('Full Body', [
      {
        name: 'Full Body A',
        exerciseNames: [
          'Back Squat',
          'Bench Press',
          'Barbell Row',
          'Overhead Press',
          'Barbell Curl',
          'Tricep Pushdown',
        ],
      },
      {
        name: 'Full Body B',
        exerciseNames: [
          'Deadlift',
          'Incline Dumbbell Press',
          'Lat Pulldown',
          'Lateral Raise',
          'Hammer Curl',
          'Skull Crusher',
        ],
      },
      {
        name: 'Full Body C',
        exerciseNames: [
          'Front Squat',
          'Dumbbell Fly',
          'Cable Row',
          'Face Pull',
          'Preacher Curl',
          'Overhead Tricep Extension',
        ],
      },
    ]);
  } catch (e) {
    console.warn('seedFullBodyRoutine error:', e);
  }
}

// Seed Bro Split routine (5-day split)
export async function seedBroSplitRoutine(): Promise<void> {
  try {
    await createRoutineWithDays('Bro Split', [
      {
        name: 'Chest Day',
        exerciseNames: [
          'Bench Press',
          'Incline Dumbbell Press',
          'Cable Fly',
          'Dumbbell Fly',
        ],
      },
      {
        name: 'Back Day',
        exerciseNames: [
          'Deadlift',
          'Pull-Up',
          'Barbell Row',
          'Lat Pulldown',
          'Cable Row',
        ],
      },
      {
        name: 'Shoulders Day',
        exerciseNames: [
          'Overhead Press',
          'Lateral Raise',
          'Face Pull',
          'Rear Delt Fly',
        ],
      },
      {
        name: 'Arms Day',
        exerciseNames: [
          'Barbell Curl',
          'Tricep Pushdown',
          'Hammer Curl',
          'Skull Crusher',
          'Preacher Curl',
          'Overhead Tricep Extension',
        ],
      },
      {
        name: 'Legs Day',
        exerciseNames: [
          'Back Squat',
          'Leg Press',
          'Romanian Deadlift',
          'Leg Extension',
          'Lying Leg Curl',
          'Standing Calf Raise',
        ],
      },
    ]);
  } catch (e) {
    console.warn('seedBroSplitRoutine error:', e);
  }
}

// Seed all preset routines (called on app init)
export async function seedAllRoutines(): Promise<void> {
  await seedPPLRoutine();
  await seedUpperLowerRoutine();
  await seedFullBodyRoutine();
  await seedBroSplitRoutine();
}

// Get all routines
export async function listRoutines(): Promise<Routine[]> {
  const db = await getDB();
  return await all<Routine>(
    db,
    'SELECT id, name, is_preset, created_at FROM routines ORDER BY is_preset DESC, name ASC'
  );
}

// Get a routine by ID
export async function getRoutineById(id: string): Promise<Routine | null> {
  const db = await getDB();
  return await get<Routine>(
    db,
    'SELECT id, name, is_preset, created_at FROM routines WHERE id = ?',
    [id]
  );
}

// Get all days for a routine
export async function getRoutineDays(routineId: string): Promise<RoutineDay[]> {
  const db = await getDB();
  return await all<RoutineDay>(
    db,
    'SELECT id, routine_id, name, order_index, template_id, exercise_ids FROM routine_days WHERE routine_id = ? ORDER BY order_index ASC',
    [routineId]
  );
}

// Get the first (default) routine (PPL for v1)
export async function getDefaultRoutine(): Promise<Routine | null> {
  const db = await getDB();
  return await get<Routine>(
    db,
    'SELECT id, name, is_preset, created_at FROM routines WHERE is_preset = 1 ORDER BY created_at ASC LIMIT 1'
  );
}

// Get next routine day based on last completed workout
// Cycles through days: Push -> Pull -> Legs -> Push...
export async function getNextRoutineDay(routineId: string): Promise<RoutineDay | null> {
  const db = await getDB();

  // Get all days for this routine
  const days = await getRoutineDays(routineId);
  if (days.length === 0) return null;

  // Find last completed workout with a routine_day_id from this routine
  const lastWorkout = await get<{ routine_day_id: string }>(
    db,
    `SELECT w.routine_day_id
     FROM workouts w
     JOIN routine_days rd ON w.routine_day_id = rd.id
     WHERE rd.routine_id = ? AND w.ended_at IS NOT NULL
     ORDER BY w.ended_at DESC
     LIMIT 1`,
    [routineId]
  );

  if (!lastWorkout?.routine_day_id) {
    // No history, return first day
    return days[0];
  }

  // Find the last day's index and advance
  const lastDay = days.find((d) => d.id === lastWorkout.routine_day_id);
  if (!lastDay) return days[0];

  const nextIndex = (lastDay.order_index + 1) % days.length;
  return days.find((d) => d.order_index === nextIndex) ?? days[0];
}

// Get routine day by ID
export async function getRoutineDayById(id: string): Promise<RoutineDay | null> {
  const db = await getDB();
  return await get<RoutineDay>(
    db,
    'SELECT id, routine_id, name, order_index, template_id, exercise_ids FROM routine_days WHERE id = ?',
    [id]
  );
}

// Start workout from a routine day
export async function startWorkoutFromRoutineDay(routineDayId: string): Promise<Workout> {
  const db = await getDB();
  const id = uuid();
  const now = Date.now();

  // Get the routine day to find its template
  const routineDay = await getRoutineDayById(routineDayId);

  await run(
    db,
    'INSERT INTO workouts (id, started_at, template_id, routine_day_id) VALUES (?,?,?,?)',
    [id, now, routineDay?.template_id ?? null, routineDayId]
  );

  return {
    id,
    started_at: now,
    ended_at: null,
    template_id: routineDay?.template_id ?? null,
    routine_day_id: routineDayId,
    notes: null,
  };
}

// Update a routine day's template (for "Update this day's template" option)
export async function updateRoutineDayTemplate(routineDayId: string, templateId: string): Promise<void> {
  const db = await getDB();
  await run(db, 'UPDATE routine_days SET template_id = ? WHERE id = ?', [templateId, routineDayId]);
}

// Get templates grouped by routine for organized display
export async function getTemplatesGroupedByRoutine(): Promise<TemplatesGroupedByRoutine> {
  const db = await getDB();

  // Get all routines
  const routines = await listRoutines();

  // Get all templates
  const allTemplates = await getTemplates();

  // Track which template IDs are linked to routine days
  const linkedTemplateIds = new Set<string>();

  // Build routine templates
  const routineTemplates: RoutineWithTemplates[] = [];

  for (const routine of routines) {
    const days = await getRoutineDays(routine.id);
    const daysWithTemplates = days.map((day) => {
      const template = day.template_id ? allTemplates.find((t) => t.id === day.template_id) ?? null : null;
      if (day.template_id) {
        linkedTemplateIds.add(day.template_id);
      }
      return { ...day, template };
    });

    routineTemplates.push({
      routine,
      days: daysWithTemplates,
    });
  }

  // Standalone templates are those not linked to any routine day
  const standaloneTemplates = allTemplates.filter((t) => !linkedTemplateIds.has(t.id));

  return { routineTemplates, standaloneTemplates };
}
