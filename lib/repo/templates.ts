import { getDB } from '../db';
import { all, get, run } from '../sql';
import { Template } from '../types';
import { uuid } from './utils';

// ============================================
// TEMPLATES
// ============================================

export async function getTemplates(): Promise<Template[]> {
  const db = await getDB();
  return await all<Template>(db, 'SELECT id, name, exercise_ids, created_at FROM templates ORDER BY name ASC');
}

export async function getTemplate(id: string): Promise<Template | null> {
  const db = await getDB();
  return await get<Template>(db, 'SELECT id, name, exercise_ids, created_at FROM templates WHERE id = ?', [id]);
}

export async function createTemplate(name: string, exerciseIds: string[] = []): Promise<Template> {
  const db = await getDB();
  const id = uuid();
  const createdAt = Date.now();
  const exerciseIdsJson = JSON.stringify(exerciseIds);
  await run(
    db,
    'INSERT INTO templates (id, name, exercise_ids, created_at) VALUES (?,?,?,?)',
    [id, name.trim(), exerciseIdsJson, createdAt]
  );
  return { id, name: name.trim(), exercise_ids: exerciseIdsJson, created_at: createdAt };
}

export async function updateTemplate(id: string, updates: { name?: string; exerciseIds?: string[] }): Promise<void> {
  const db = await getDB();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name.trim());
  }
  if (updates.exerciseIds !== undefined) {
    fields.push('exercise_ids = ?');
    values.push(JSON.stringify(updates.exerciseIds));
  }

  if (fields.length === 0) return;
  values.push(id);

  await run(db, `UPDATE templates SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDB();
  await run(db, 'DELETE FROM templates WHERE id = ?', [id]);
}
