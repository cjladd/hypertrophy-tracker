// context/AIContext.tsx
// Provides AI state (recovery scores, anomalies, suggestions, insights) to all screens.
// Phase 0 shell: loads data from SQLite; actual model inference added in later phases.

import { runAdaptiveProgramming } from '@/lib/ai/adaptive';
import { runAllAnomalyDetection } from '@/lib/ai/anomaly';
import { generateDailyInsight, generateWeeklyInsight } from '@/lib/ai/coaching';
import {
  computeAndCacheAllRecoveryScores,
} from '@/lib/ai/features';
import { syncHealthData } from '@/lib/ai/health-sync';
import {
  dismissInsight,
  getAISettings,
  getActiveAnomalies,
  getAllRecoveryScores,
  getPendingAdjustments,
  getRecentInsights,
  patchAISettings,
  updateAdjustmentStatus,
} from '@/lib/ai/repo';
import type {
  AdaptiveSuggestion,
  AnomalyAlert,
  CoachingInsight,
  RecoveryScore,
} from '@/lib/ai/types';
import { useSettings } from '@/context/SettingsContext';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

// =============================================================================
// Context shape
// =============================================================================

type AIContextValue = {
  // Data
  recoveryScores: RecoveryScore[];
  anomalies: AnomalyAlert[];
  suggestions: AdaptiveSuggestion[];
  latestInsight: CoachingInsight | null;

  // Health integration
  healthEnabled: boolean;
  healthPermissionsGranted: boolean;
  healthLastSyncAt: number | null;

  // Trainer bot (Phase 7): model-written proactive insights toggle
  trainerInsightsEnabled: boolean;

  // Status
  isLoading: boolean;
  lastRefreshedAt: number | null;

  // Actions
  refresh: () => Promise<void>;
  dismissAnomaly: (id: string) => void;
  dismissInsight: (id: string) => void;
  acceptSuggestion: (id: string) => Promise<void>;
  rejectSuggestion: (id: string) => Promise<void>;
  enableHealthIntegration: () => Promise<void>;
  disableHealthIntegration: () => Promise<void>;
  setTrainerInsightsEnabled: (v: boolean) => Promise<void>;
};

// =============================================================================
// Context + hook
// =============================================================================

const AIContext = createContext<AIContextValue | null>(null);

export function useAI(): AIContextValue {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error('useAI must be used within AIProvider');
  return ctx;
}

// =============================================================================
// Provider
// =============================================================================

export function AIProvider({ children }: { children: ReactNode }) {
  const { anomalyDetectionEnabled, coachingInsightsEnabled, adaptiveProgrammingEnabled } = useSettings();
  const [recoveryScores, setRecoveryScores] = useState<RecoveryScore[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [suggestions, setSuggestions] = useState<AdaptiveSuggestion[]>([]);
  const [latestInsight, setLatestInsight] = useState<CoachingInsight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  // Health state (loaded from ai_settings SQLite, not AsyncStorage)
  const [healthEnabled, setHealthEnabled] = useState(false);
  const [healthPermissionsGranted, setHealthPermissionsGranted] = useState(false);
  const [healthLastSyncAt, setHealthLastSyncAt] = useState<number | null>(null);

  // Trainer-bot proactive-insight opt-in (ai_settings.llm_enabled)
  const [trainerInsightsEnabled, setTrainerInsightsEnabledState] = useState(false);

  // ---------------------------------------------------------------------------
  // Core refresh: recompute heuristic scores, run detectors, load AI state
  // ---------------------------------------------------------------------------
  const refresh = useCallback(async () => {
    try {
      await computeAndCacheAllRecoveryScores();
      if (anomalyDetectionEnabled) {
        await runAllAnomalyDetection();
      }
      if (adaptiveProgrammingEnabled) {
        await runAdaptiveProgramming();
      }
      if (coachingInsightsEnabled) {
        await generateDailyInsight();
        await generateWeeklyInsight();
      }

      const [scores, activeAnomalies, pending, insights] = await Promise.all([
        getAllRecoveryScores(),
        getActiveAnomalies(),
        getPendingAdjustments(),
        getRecentInsights(1),
      ]);

      setRecoveryScores(scores);
      setAnomalies(activeAnomalies);
      setSuggestions(pending);
      setLatestInsight(insights[0] ?? null);
      setLastRefreshedAt(Date.now());
    } catch (e) {
      console.warn('AIContext refresh failed:', e);
    }
  }, [anomalyDetectionEnabled, coachingInsightsEnabled, adaptiveProgrammingEnabled]);

  // Initial load on mount — also loads health settings
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const [, aiSettings] = await Promise.all([
        refresh(),
        getAISettings(),
      ]);
      setHealthEnabled(aiSettings.health_integration_enabled);
      setHealthPermissionsGranted(aiSettings.health_permissions_granted);
      setTrainerInsightsEnabledState(aiSettings.llm_enabled);
      setIsLoading(false);
    })();
  }, [refresh]);

  // ---------------------------------------------------------------------------
  // Foreground health sync — fires when app returns to foreground
  // ---------------------------------------------------------------------------
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = nextState;
      if (wasBackground && nextState === 'active' && healthEnabled && healthPermissionsGranted) {
        syncHealthData()
          .then(() => setHealthLastSyncAt(Date.now()))
          .catch(() => {});
      }
    });
    return () => sub.remove();
  }, [healthEnabled, healthPermissionsGranted]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleDismissAnomaly = useCallback((id: string) => {
    setAnomalies((prev) => prev.filter((a) => a.id !== id));
    import('@/lib/ai/repo').then(({ dismissAnomaly }) => dismissAnomaly(id)).catch(() => {});
  }, []);

  const handleDismissInsight = useCallback((id: string) => {
    setLatestInsight((prev) => (prev?.id === id ? null : prev));
    dismissInsight(id).catch(() => {});
  }, []);

  const handleAcceptSuggestion = useCallback(async (id: string) => {
    await updateAdjustmentStatus(id, 'accepted');
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleRejectSuggestion = useCallback(async (id: string) => {
    await updateAdjustmentStatus(id, 'rejected');
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleEnableHealthIntegration = useCallback(async () => {
    await patchAISettings({ health_integration_enabled: true, health_permissions_granted: true });
    setHealthEnabled(true);
    setHealthPermissionsGranted(true);
    syncHealthData()
      .then(() => setHealthLastSyncAt(Date.now()))
      .catch(() => {});
  }, []);

  const handleDisableHealthIntegration = useCallback(async () => {
    await patchAISettings({ health_integration_enabled: false });
    setHealthEnabled(false);
  }, []);

  const handleSetTrainerInsightsEnabled = useCallback(async (v: boolean) => {
    await patchAISettings({ llm_enabled: v });
    setTrainerInsightsEnabledState(v);
  }, []);

  // ---------------------------------------------------------------------------
  // Provide
  // ---------------------------------------------------------------------------

  const value: AIContextValue = {
    recoveryScores,
    anomalies,
    suggestions,
    latestInsight,
    healthEnabled,
    healthPermissionsGranted,
    healthLastSyncAt,
    trainerInsightsEnabled,
    isLoading,
    lastRefreshedAt,
    refresh,
    dismissAnomaly: handleDismissAnomaly,
    dismissInsight: handleDismissInsight,
    acceptSuggestion: handleAcceptSuggestion,
    rejectSuggestion: handleRejectSuggestion,
    enableHealthIntegration: handleEnableHealthIntegration,
    disableHealthIntegration: handleDisableHealthIntegration,
    setTrainerInsightsEnabled: handleSetTrainerInsightsEnabled,
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}
