// lib/sql.ts
import * as SQLite from 'expo-sqlite';

export type DB = SQLite.SQLiteDatabase;

export async function openDB(name = 'hypertrophy.db'): Promise<DB> {
  // @ts-expect-error older SDKs: openDatabaseAsync may not exist
  if (SQLite.openDatabaseAsync) {
    // modern async API
    return await (SQLite as any).openDatabaseAsync(name);
  }
  // legacy API
  return SQLite.openDatabase(name);
}

function txRun(db: DB, sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx) => tx.executeSql(sql, params, () => resolve(), (_, err) => { reject(err); return false; }),
      (err) => reject(err)
    );
  });
}

function txAll<T = any>(db: DB, sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.transaction(
      (tx) =>
        tx.executeSql(
          sql,
          params,
          (_t, res) => {
            const out: T[] = [];
            for (let i = 0; i < res.rows.length; i++) out.push(res.rows.item(i));
            resolve(out);
          },
          (_t, err) => {
            reject(err);
            return false;
          }
        ),
      (err) => reject(err)
    );
  });
}

export async function exec(db: DB, sql: string): Promise<void> {
  // @ts-expect-error modern API may exist
  if (db.execAsync) return db.execAsync(sql);
  // split by ; for legacy to roughly emulate exec
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const st of statements) {
    await txRun(db, st + ';');
  }
}

export async function run(db: DB, sql: string, params?: any[]): Promise<void> {
  // @ts-expect-error modern API may exist
  if (db.runAsync) return db.runAsync(sql, params ?? []);
  return txRun(db, sql, params ?? []);
}

export async function all<T = any>(db: DB, sql: string, params?: any[]): Promise<T[]> {
  // @ts-expect-error modern API may exist
  if (db.getAllAsync) return db.getAllAsync(sql, params ?? []);
  return txAll<T>(db, sql, params ?? []);
}
