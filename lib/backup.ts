// lib/backup.ts
// Full local backup / restore for the offline-first database.
//
// Everything in this app lives in one SQLite file with exactly one copy. This module is the
// only escape hatch: it serialises the durable tables to a JSON envelope the user can hand to
// Files / iCloud / AirDrop, and restores one back.
//
// WHAT IS AND ISN'T IN A BACKUP
//   Exported : the source-of-truth tables (exercises -> workouts -> workout_exercises -> sets,
//              templates, routines, routine_days), the AI history worth keeping (health_samples,
//              anomaly_log, ai_insights, program_adjustments, ai_settings), and the AsyncStorage
//              settings blob (weightJumpLb, activeRoutineId, AI feature toggles, onboarding).
//   Rebuilt  : progression_state and recovery_scores are DERIVED CACHES (see CLAUDE.md). They are
//              deliberately not exported — restoring replays history through the progression
//              engine instead, so a backup can never carry drifted cache state into a fresh
//              install. recovery_scores is a TTL cache and recomputes on the next refresh.
//
// Restore is destructive and replaces all local data. Callers must confirm with the user first.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { APP_VERSION } from './app-version';
import { getDB } from './db';
import { all, get, run } from './sql';
import { recomputeAllProgressionStates } from './repo/progress';
import { SETTINGS_KEY } from './repo/settings';

export const BACKUP_FORMAT = 'hypertrophy-helper-backup';
export const BACKUP_VERSION = 1;

/**
 * Durable tables, in FK-safe insert order. Restore deletes in the reverse of this list and
 * inserts in this order, so parents always exist before their children.
 *
 * Adding a table to the schema? Add it here too, or it silently stops being backed up.
 */
const BACKUP_TABLES = [
  'exercises',
  'templates',
  'routines',
  'routine_days',
  'workouts',
  'workout_exercises',
  'sets',
  'health_samples',
  'anomaly_log',
  'ai_insights',
  'program_adjustments',
  'ai_settings',
] as const;

type BackupTable = (typeof BACKUP_TABLES)[number];

/** Derived caches — never exported, always rebuilt after a restore. */
const DERIVED_TABLES = ['progression_state', 'recovery_scores'] as const;

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  appVersion: string;
  /** Row counts at export time, for display and as a restore sanity check. */
  counts: Record<string, number>;
  /** The AsyncStorage settings blob (parsed). Null if it was never written. */
  settings: Record<string, unknown> | null;
  tables: Partial<Record<BackupTable, Record<string, unknown>[]>>;
}

export interface BackupSummary {
  workouts: number;
  sets: number;
  exercises: number;
  exportedAt: number;
}

/** Live column names for a table, used to intersect backup rows against the current schema. */
async function tableColumns(table: string): Promise<string[]> {
  const db = await getDB();
  const info = await all<{ name: string }>(db, `PRAGMA table_info(${table})`);
  return info.map((c) => c.name);
}

// ============================================================================
// EXPORT
// ============================================================================

/** Serialise the whole database (minus derived caches) into a backup envelope. */
export async function buildBackup(): Promise<BackupEnvelope> {
  const db = await getDB();

  const tables: BackupEnvelope['tables'] = {};
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    // SELECT * deliberately: whatever columns the schema has today get captured, so a future
    // ALTER TABLE ... ADD COLUMN is picked up without touching this file.
    const rows = await all<Record<string, unknown>>(db, `SELECT * FROM ${table}`);
    tables[table] = rows;
    counts[table] = rows.length;
  }

  let settings: Record<string, unknown> | null = null;
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) settings = JSON.parse(raw);
  } catch {
    // A corrupt settings blob shouldn't cost the user their workout history.
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    appVersion: APP_VERSION,
    counts,
    settings,
    tables,
  };
}

function backupFilename(exportedAt: number): string {
  const d = new Date(exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `hypertrophy-helper-backup-${stamp}.json`;
}

/**
 * Write a backup to the cache directory and open the share sheet so the user can save it to
 * Files / iCloud / AirDrop. Returns the summary shown in the success alert.
 *
 * The file lands in the cache dir on purpose — once it has been shared out, the OS is free to
 * reclaim it. The copy that matters is the one the user saved.
 */
export async function exportBackup(): Promise<BackupSummary> {
  const envelope = await buildBackup();
  const json = JSON.stringify(envelope);

  const file = new File(Paths.cache, backupFilename(envelope.exportedAt));
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Save your Hypertrophy Helper backup',
    });
  }

  return {
    workouts: envelope.counts.workouts ?? 0,
    sets: envelope.counts.sets ?? 0,
    exercises: envelope.counts.exercises ?? 0,
    exportedAt: envelope.exportedAt,
  };
}

// ============================================================================
// IMPORT
// ============================================================================

/** Thrown for a file that isn't a usable backup. Message is shown to the user verbatim. */
export class BackupValidationError extends Error {}

function validateEnvelope(parsed: unknown): BackupEnvelope {
  if (!parsed || typeof parsed !== 'object') {
    throw new BackupValidationError("That file isn't a Hypertrophy Helper backup.");
  }
  const env = parsed as Partial<BackupEnvelope>;
  if (env.format !== BACKUP_FORMAT) {
    throw new BackupValidationError("That file isn't a Hypertrophy Helper backup.");
  }
  if (typeof env.version !== 'number' || env.version > BACKUP_VERSION) {
    throw new BackupValidationError(
      `That backup was made by a newer version of the app (format v${env.version}). ` +
        'Update Hypertrophy Helper and try again.'
    );
  }
  if (!env.tables || typeof env.tables !== 'object') {
    throw new BackupValidationError('That backup is missing its data and cannot be restored.');
  }
  // A backup with no exercises can only produce an empty app — treat it as corrupt rather than
  // silently wiping the user's real data for nothing.
  if (!Array.isArray(env.tables.exercises) || env.tables.exercises.length === 0) {
    throw new BackupValidationError('That backup looks empty or damaged and was not restored.');
  }
  return env as BackupEnvelope;
}

/** Let the user pick a backup file and parse it, without touching the database yet. */
export async function pickBackupFile(): Promise<BackupEnvelope | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;

  const text = await new File(result.assets[0].uri).text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupValidationError("That file isn't valid JSON, so it can't be a backup.");
  }
  return validateEnvelope(parsed);
}

/** Human-readable summary of what restoring an envelope would give you. */
export function describeBackup(env: BackupEnvelope): string {
  const when = new Date(env.exportedAt).toLocaleString();
  const workouts = env.counts?.workouts ?? env.tables.workouts?.length ?? 0;
  const sets = env.counts?.sets ?? env.tables.sets?.length ?? 0;
  return `From ${when}\n${workouts} workouts, ${sets} sets`;
}

/**
 * Replace ALL local data with the contents of a backup, then rebuild the derived caches.
 *
 * Runs inside a single transaction: either the whole restore lands or the existing database is
 * left untouched. Progression state is replayed from the restored history afterwards, which is
 * what makes it safe to have left the cache out of the backup in the first place.
 */
export async function restoreBackup(env: BackupEnvelope): Promise<BackupSummary> {
  const db = await getDB();

  // Read the live schema before opening the transaction — no reason to interleave PRAGMA reads
  // with the writes.
  const liveColumns = new Map<string, string[]>();
  for (const table of BACKUP_TABLES) {
    liveColumns.set(table, await tableColumns(table));
  }

  // All writes go through this so the same body can run against either a plain connection or
  // an exclusive transaction handle.
  const applyRestore = async (tx: SQLiteDatabase) => {
    // Delete children before parents. Derived caches go first — they reference exercises and
    // are rebuilt below regardless.
    for (const table of DERIVED_TABLES) {
      await run(tx, `DELETE FROM ${table}`);
    }
    for (const table of [...BACKUP_TABLES].reverse()) {
      await run(tx, `DELETE FROM ${table}`);
    }

    for (const table of BACKUP_TABLES) {
      const rows = env.tables[table];
      if (!rows?.length) continue;

      const live = liveColumns.get(table) ?? [];
      for (const row of rows) {
        // Intersect the row against the live schema: columns this build doesn't know about are
        // dropped, columns the backup lacks fall back to their schema defaults. That keeps
        // restores working across schema changes in both directions.
        const cols = Object.keys(row).filter((c) => live.includes(c));
        if (cols.length === 0) continue;

        const placeholders = cols.map(() => '?').join(',');
        await run(
          tx,
          `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`,
          cols.map((c) => row[c] as any)
        );
      }
    }
  };

  // Exclusive, because this wipes every table: a plain withTransactionAsync is explicitly
  // documented as interruptible by other async queries, and the AIContext refresh loop and the
  // foreground HealthKit sync both write while this runs. Exclusive isn't supported on web,
  // which is a dev-only target here, so fall back there.
  if (Platform.OS === 'web') {
    await db.withTransactionAsync(async () => {
      await applyRestore(db);
    });
  } else {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await applyRestore(txn as unknown as SQLiteDatabase);
    });
  }

  // Settings live outside SQLite, so they're restored outside the transaction. A failure here
  // costs the user their preferences, not their training history.
  if (env.settings) {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(env.settings));
    } catch {
      // Non-fatal: defaults apply and the user can set them again.
    }
  }

  // The whole reason progression_state isn't in the backup: rebuild it from restored history.
  await recomputeAllProgressionStates();

  const workouts = await get<{ n: number }>(db, 'SELECT COUNT(*) as n FROM workouts');
  const sets = await get<{ n: number }>(db, 'SELECT COUNT(*) as n FROM sets');
  const exercises = await get<{ n: number }>(db, 'SELECT COUNT(*) as n FROM exercises');

  return {
    workouts: workouts?.n ?? 0,
    sets: sets?.n ?? 0,
    exercises: exercises?.n ?? 0,
    exportedAt: env.exportedAt,
  };
}
