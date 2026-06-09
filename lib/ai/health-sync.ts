// lib/ai/health-sync.ts
// HealthKit integration: permission request + 30-day sync of HRV, resting HR, and sleep.
// Uses @kingstinct/react-native-healthkit (Nitro, New-Architecture compatible).
// All functions are iOS-only and no-op on other platforms.

import { getDB } from '@/lib/db';
import { insertHealthSample } from './repo';
import { Platform } from 'react-native';

// Lazy import so this module never loads the iOS-only native module on Android.
// (Same pattern the project uses for other iOS-only native modules.)
let HK: typeof import('@kingstinct/react-native-healthkit') | null = null;

function getHealthKit() {
  if (Platform.OS !== 'ios') return null;
  if (!HK) {
    HK = require('@kingstinct/react-native-healthkit');
  }
  return HK;
}

// Type identifiers we read
const HRV_ID = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
const RESTING_HR_ID = 'HKQuantityTypeIdentifierRestingHeartRate';
const SLEEP_ID = 'HKCategoryTypeIdentifierSleepAnalysis';

// =============================================================================
// Permission request
// =============================================================================

export type HealthPermissionResult = { granted: boolean; error?: string };

export async function requestHealthPermissions(): Promise<HealthPermissionResult> {
  const HK = getHealthKit();
  if (!HK) {
    return { granted: false, error: 'HealthKit is only available on iOS.' };
  }
  try {
    if (!HK.isHealthDataAvailable()) {
      return { granted: false, error: 'HealthKit is not available on this device.' };
    }
    // requestAuthorization resolves true once the system sheet completes. iOS does
    // not reveal read-permission denials, so this is the best signal available.
    const granted = await HK.requestAuthorization({
      toRead: [HRV_ID, RESTING_HR_ID, SLEEP_ID],
    });
    return {
      granted,
      error: granted ? undefined : 'Authorization request was not completed.',
    };
  } catch (e: any) {
    console.warn('[health] requestAuthorization failed:', e);
    return { granted: false, error: `requestAuthorization failed: ${e?.message ?? e}` };
  }
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
// Sync
// Pulls last 30 days from HealthKit, inserts new samples (deduped by recorded_at).
// Sleep is aggregated per night (sum of all asleep stages per start date).
// =============================================================================

export async function syncHealthData(): Promise<void> {
  const HK = getHealthKit();
  if (!HK) return;

  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since = { date: { startDate } };

  // --- HRV (stored in ms) ---
  try {
    const samples = await HK.queryQuantitySamples(HRV_ID, {
      limit: 200,
      ascending: false,
      unit: 'ms',
      filter: since,
    });
    for (const s of samples) {
      const ts = s.startDate.getTime();
      if (!(await hasSample('hrv', ts))) {
        await insertHealthSample('hrv', s.quantity, ts, 'healthkit');
      }
    }
  } catch (e) {
    console.warn('[health] HRV sync failed:', e);
  }

  // --- Resting HR (stored in bpm) ---
  try {
    const samples = await HK.queryQuantitySamples(RESTING_HR_ID, {
      limit: 200,
      ascending: false,
      unit: 'count/min',
      filter: since,
    });
    for (const s of samples) {
      const ts = s.startDate.getTime();
      if (!(await hasSample('resting_hr', ts))) {
        await insertHealthSample('resting_hr', s.quantity, ts, 'healthkit');
      }
    }
  } catch (e) {
    console.warn('[health] resting HR sync failed:', e);
  }

  // --- Sleep (aggregated per night, asleep stages only) ---
  try {
    const asleepValues = new Set<number>([
      HK.CategoryValueSleepAnalysis.asleepUnspecified,
      HK.CategoryValueSleepAnalysis.asleepCore,
      HK.CategoryValueSleepAnalysis.asleepDeep,
      HK.CategoryValueSleepAnalysis.asleepREM,
    ]);
    const samples = await HK.queryCategorySamples(SLEEP_ID, {
      limit: 0, // 0 = all samples within the filter window
      ascending: false,
      filter: since,
    });
    // Sum asleep durations per calendar date (based on startDate)
    const nightlyTotals = new Map<string, number>();
    for (const s of samples) {
      if (!asleepValues.has(s.value)) continue;
      const night = s.startDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const durationHours =
        (s.endDate.getTime() - s.startDate.getTime()) / (1000 * 60 * 60);
      nightlyTotals.set(night, (nightlyTotals.get(night) ?? 0) + durationHours);
    }
    for (const [night, hours] of nightlyTotals) {
      const ts = new Date(night + 'T00:00:00').getTime();
      if (!(await hasSample('sleep_duration', ts))) {
        await insertHealthSample('sleep_duration', hours, ts, 'healthkit');
      }
    }
  } catch (e) {
    console.warn('[health] sleep sync failed:', e);
  }
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
