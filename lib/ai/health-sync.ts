// lib/ai/health-sync.ts
// HealthKit integration: permission request + 30-day sync of HRV, resting HR, and sleep.
// All functions are iOS-only and no-op on other platforms.

import { getDB } from '@/lib/db';
import { insertHealthSample } from './repo';
import { Platform } from 'react-native';

// Lazy import so this module doesn't crash on Android during bundling
let AppleHealthKit: typeof import('react-native-health').default | null = null;

function getHealthKit() {
  if (Platform.OS !== 'ios') return null;
  if (!AppleHealthKit) {
    AppleHealthKit = require('react-native-health').default;
  }
  return AppleHealthKit;
}

// =============================================================================
// Permission request
// =============================================================================

export async function requestHealthPermissions(): Promise<boolean> {
  const HK = getHealthKit();
  if (!HK) return false;

  const PERMISSIONS = {
    permissions: {
      read: [
        HK.Constants.Permissions.HeartRateVariability,
        HK.Constants.Permissions.RestingHeartRate,
        HK.Constants.Permissions.SleepAnalysis,
      ],
      write: [],
    },
  };

  return new Promise((resolve) => {
    HK!.initHealthKit(PERMISSIONS, (error: string) => {
      resolve(!error);
    });
  });
}

// =============================================================================
// Dedup helper
// =============================================================================

async function hasSample(type: string, recorded_at: number): Promise<boolean> {
  const db = await getDB();
  const row = await db.getFirstAsync(
    `SELECT id FROM health_samples WHERE sample_type = ? AND recorded_at = ? LIMIT 1`,
    [type, recorded_at],
  );
  return row !== null;
}

// =============================================================================
// Sleep stage filter
// Only count actual sleep stages, not "in bed" or "awake"
// =============================================================================

const SLEEP_STAGES = new Set(['ASLEEP', 'ASLEEP_CORE', 'ASLEEP_DEEP', 'ASLEEP_REM']);

// =============================================================================
// Sync
// Pulls last 30 days from HealthKit, inserts new samples (deduped by recorded_at).
// Sleep is aggregated per night (sum of all asleep stages per start date).
// =============================================================================

export async function syncHealthData(): Promise<void> {
  const HK = getHealthKit();
  if (!HK) return;

  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const options = { startDate, ascending: false, limit: 90 };

  // --- HRV ---
  await new Promise<void>((resolve) => {
    HK!.getHeartRateVariabilitySamples(options, async (error: string, results: any[]) => {
      if (!error && results?.length) {
        for (const sample of results) {
          const ts = new Date(sample.startDate).getTime();
          if (!(await hasSample('hrv', ts))) {
            await insertHealthSample('hrv', sample.value, ts, 'healthkit');
          }
        }
      }
      resolve();
    });
  });

  // --- Resting HR ---
  await new Promise<void>((resolve) => {
    HK!.getRestingHeartRateSamples(options, async (error: string, results: any[]) => {
      if (!error && results?.length) {
        for (const sample of results) {
          const ts = new Date(sample.startDate).getTime();
          if (!(await hasSample('resting_hr', ts))) {
            await insertHealthSample('resting_hr', sample.value, ts, 'healthkit');
          }
        }
      }
      resolve();
    });
  });

  // --- Sleep (aggregated per night) ---
  await new Promise<void>((resolve) => {
    HK!.getSleepSamples(options, async (error: string, results: any[]) => {
      if (!error && results?.length) {
        // Sum asleep durations per calendar date (based on startDate)
        const nightlyTotals = new Map<string, number>();
        for (const sample of results) {
          if (SLEEP_STAGES.has((sample.value as string).toUpperCase())) {
            const night = (sample.startDate as string).split('T')[0]; // YYYY-MM-DD
            const durationHours =
              (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) /
              (1000 * 60 * 60);
            nightlyTotals.set(night, (nightlyTotals.get(night) ?? 0) + durationHours);
          }
        }
        for (const [night, hours] of nightlyTotals) {
          const ts = new Date(night + 'T00:00:00').getTime();
          if (!(await hasSample('sleep_duration', ts))) {
            await insertHealthSample('sleep_duration', hours, ts, 'healthkit');
          }
        }
      }
      resolve();
    });
  });
}

// =============================================================================
// Status query (used by Settings screen)
// =============================================================================

export type HealthSyncStatus = {
  lastSyncAt: number | null;  // when we last inserted healthkit samples
  latestHRV: number | null;   // ms
  latestHR: number | null;    // bpm
  avgSleepHours: number | null;
};

export async function getHealthSyncStatus(): Promise<HealthSyncStatus> {
  const db = await getDB();

  const [lastSync, latestHRV, latestHR, sleepAvg] = await Promise.all([
    db.getFirstAsync<{ created_at: number }>(
      `SELECT MAX(created_at) AS created_at FROM health_samples WHERE source = 'healthkit'`,
    ),
    db.getFirstAsync<{ value: number }>(
      `SELECT value FROM health_samples WHERE sample_type = 'hrv' ORDER BY recorded_at DESC LIMIT 1`,
    ),
    db.getFirstAsync<{ value: number }>(
      `SELECT value FROM health_samples WHERE sample_type = 'resting_hr' ORDER BY recorded_at DESC LIMIT 1`,
    ),
    db.getFirstAsync<{ avg: number }>(
      `SELECT AVG(value) AS avg FROM health_samples
       WHERE sample_type = 'sleep_duration' AND recorded_at >= ?`,
      [Date.now() - 7 * 24 * 60 * 60 * 1000],
    ),
  ]);

  return {
    lastSyncAt: lastSync?.created_at ?? null,
    latestHRV: latestHRV?.value ?? null,
    latestHR: latestHR?.value ?? null,
    avgSleepHours: sleepAvg?.avg ?? null,
  };
}
