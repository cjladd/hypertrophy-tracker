import AsyncStorage from '@react-native-async-storage/async-storage';
import { Settings } from '../types';

// Must match SettingsContext KEY for consistency
export const SETTINGS_KEY = 'ht_settings_v3';
export const DEFAULT_SETTINGS: Settings = { weightJumpLb: 5 };

/**
 * Get settings from AsyncStorage (prog_engine.md §2)
 * This is a standalone function for use in repo without React context
 */
export async function getSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // Ignore errors, use defaults
  }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}
