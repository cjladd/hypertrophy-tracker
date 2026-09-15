// lib/error-log.ts
// Local crash log. Written by the root ErrorBoundary and by reportError() from catch blocks
// that would otherwise swallow a failure silently.
//
// Everything here is best-effort and never throws: the most likely reason a crash needs
// logging is that something in the data layer is already broken, and a logger that throws
// inside an error handler turns a recoverable screen error into an unrecoverable one.
//
// Nothing is ever uploaded. The log is read back from Settings -> Dev tools and travels with
// the user only if they explicitly share it.

import { APP_VERSION } from './app-version';
import { getDB } from './db';
import { all, run } from './sql';
import { uuid } from './repo/utils';

export interface ErrorLogEntry {
  id: string;
  message: string;
  stack: string | null;
  component_stack: string | null;
  context: string | null;
  app_version: string | null;
  occurred_at: number;
}

/** Keep the log bounded — this is a breadcrumb trail, not an archive. */
const MAX_ENTRIES = 50;

/** Stack traces can be enormous; enough to identify the fault is enough. */
const MAX_STACK_CHARS = 4000;

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value;
}

/**
 * Record an error. Safe to call from anywhere, including inside an error handler — it
 * resolves rather than rejects on failure, and callers may fire-and-forget it.
 *
 * @param context short label for where this came from, e.g. 'log.finishWorkout'
 */
export async function reportError(
  error: unknown,
  context?: string,
  componentStack?: string
): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));

    // Always leave a console trail too — in a dev build that's the fastest read.
    console.error(`[error-log]${context ? ` ${context}:` : ''}`, err);

    const db = await getDB();
    await run(
      db,
      `INSERT INTO error_log (id, message, stack, component_stack, context, app_version, occurred_at)
       VALUES (?,?,?,?,?,?,?)`,
      [
        uuid(),
        truncate(err.message, 500) ?? 'Unknown error',
        truncate(err.stack, MAX_STACK_CHARS),
        truncate(componentStack, MAX_STACK_CHARS),
        context ?? null,
        APP_VERSION,
        Date.now(),
      ]
    );

    // Trim oldest beyond the cap.
    await run(
      db,
      `DELETE FROM error_log WHERE id NOT IN (
         SELECT id FROM error_log ORDER BY occurred_at DESC LIMIT ?
       )`,
      [MAX_ENTRIES]
    );
  } catch (loggingFailure) {
    // The database itself may be the casualty. Console is all that's left.
    console.error('[error-log] failed to persist error:', loggingFailure);
  }
}

/** Most recent errors first. Returns [] if the log can't be read. */
export async function getRecentErrors(limit = 20): Promise<ErrorLogEntry[]> {
  try {
    const db = await getDB();
    const lim = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(limit)));
    return await all<ErrorLogEntry>(
      db,
      `SELECT id, message, stack, component_stack, context, app_version, occurred_at
       FROM error_log ORDER BY occurred_at DESC LIMIT ${lim}`
    );
  } catch {
    return [];
  }
}

export async function clearErrorLog(): Promise<void> {
  try {
    const db = await getDB();
    await run(db, 'DELETE FROM error_log');
  } catch {
    // Nothing useful to do.
  }
}

/** Flat text dump of the log, for the share sheet / pasting into a bug report. */
export async function formatErrorLog(): Promise<string> {
  const entries = await getRecentErrors(MAX_ENTRIES);
  if (entries.length === 0) return 'No errors recorded.';

  return entries
    .map((e) => {
      const when = new Date(e.occurred_at).toLocaleString();
      const lines = [
        `[${when}] v${e.app_version ?? '?'}${e.context ? ` (${e.context})` : ''}`,
        e.message,
      ];
      if (e.stack) lines.push(e.stack);
      if (e.component_stack) lines.push(`Component stack:${e.component_stack}`);
      return lines.join('\n');
    })
    .join('\n\n---\n\n');
}
