// lib/sql.ts
import * as SQLite from 'expo-sqlite';

/**
 * Execute a SQL query that returns rows (SELECT)
 */
export async function all<T = any>(
  db: SQLite.SQLiteDatabase,
  query: string,
  params?: any[]
): Promise<T[]> {
  try {
    const result = params 
      ? await db.getAllAsync<T>(query, params)
      : await db.getAllAsync<T>(query);
    return result;
  } catch (error) {
    console.error('SQL all() error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * Execute a SQL query that doesn't return rows (INSERT, UPDATE, DELETE)
 */
export async function run(
  db: SQLite.SQLiteDatabase,
  query: string,
  params?: any[]
): Promise<SQLite.SQLiteRunResult> {
  try {
    const result = params
      ? await db.runAsync(query, params)
      : await db.runAsync(query);
    return result;
  } catch (error) {
    console.error('SQL run() error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * Execute a SQL query that returns a single row (SELECT with LIMIT 1)
 */
export async function get<T = any>(
  db: SQLite.SQLiteDatabase,
  query: string,
  params?: any[]
): Promise<T | null> {
  try {
    const result = params
      ? await db.getFirstAsync<T>(query, params)
      : await db.getFirstAsync<T>(query);
    return result;
  } catch (error) {
    console.error('SQL get() error:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    throw error;
  }
}

/**
 * Execute raw SQL (useful for CREATE TABLE, etc.)
 */
export async function exec(
  db: SQLite.SQLiteDatabase,
  query: string
): Promise<void> {
  try {
    await db.execAsync(query);
  } catch (error) {
    console.error('SQL exec() error:', error);
    console.error('Query:', query);
    throw error;
  }
}

