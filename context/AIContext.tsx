// context/AIContext.tsx
// Provides AI state (recovery scores, anomalies, suggestions, insights) to all screens.
// Phase 0 shell: loads data from SQLite; actual model inference added in later phases.

import {
  computeAndCacheAllRecoveryScores,
} from '@/lib/ai/features';
import {
  getActiveAnomalies,
  getAllRecoveryScores,
  getPendingAdjustments,
  getRecentInsights,
  updateAdjustmentStatus,
} from '@/lib/ai/repo';
import type {
  AdaptiveSuggestion,
  AnomalyAlert,
  CoachingInsight,
  RecoveryScore,
} from '@/lib/ai/types';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

// =============================================================================
// Context shape
// =============================================================================

type AIContextValue = {
  // Data
  recoveryScores: RecoveryScore[];
  anomalies: AnomalyAlert[];
  suggestions: AdaptiveSuggestion[];
  latestInsight: CoachingInsight | null;

  // Status
  isLoading: boolean;
  lastRefreshedAt: number | null;

  // Actions
  refresh: () => Promise<void>;
  dismissAnomaly: (id: string) => void;
  acceptSuggestion: (id: string) => Promise<void>;
  rejectSuggestion: (id: string) => Promise<void>;
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
  const [recoveryScores, setRecoveryScores] = useState<RecoveryScore[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyAlert[]>([]);
  const [suggestions, setSuggestions] = useState<AdaptiveSuggestion[]>([]);
  const [latestInsight, setLatestInsight] = useState<CoachingInsight | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Core refresh: recompute heuristic scores, then load all AI state from DB
  // ---------------------------------------------------------------------------
  const refresh = useCallback(async () => {
    try {
      // Recompute heuristic recovery scores for all muscle groups.
      // This is fast (pure SQL + arithmetic, no ONNX yet) and idempotent.
      await computeAndCacheAllRecoveryScores();

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
  }, []);

  // Initial load on mount
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await refresh();
      setIsLoading(false);
    })();
  }, [refresh]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleDismissAnomaly = useCallback((id: string) => {
    // Optimistic update — remove from UI immediately
    setAnomalies((prev) => prev.filter((a) => a.id !== id));
    // Persist asynchronously (fire-and-forget; next refresh will sync)
    import('@/lib/ai/repo').then(({ dismissAnomaly }) => dismissAnomaly(id)).catch(() => {});
  }, []);

  const handleAcceptSuggestion = useCallback(async (id: string) => {
    await updateAdjustmentStatus(id, 'accepted');
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleRejectSuggestion = useCallback(async (id: string) => {
    await updateAdjustmentStatus(id, 'rejected');
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // ---------------------------------------------------------------------------
  // Provide
  // ---------------------------------------------------------------------------

  const value: AIContextValue = {
    recoveryScores,
    anomalies,
    suggestions,
    latestInsight,
    isLoading,
    lastRefreshedAt,
    refresh,
    dismissAnomaly: handleDismissAnomaly,
    acceptSuggestion: handleAcceptSuggestion,
    rejectSuggestion: handleRejectSuggestion,
  };

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}
