// components/RecoveryDashboard.tsx
// Phase 4.4: per-muscle-group recovery readiness grid.
// Reads cached scores from AIContext (computed by the ONNX recovery model with a
// heuristic fallback) and renders a color-coded bar per muscle group.

import { useAI } from '@/context/AIContext';
import type { RecoveryScore } from '@/lib/ai/types';
import { MUSCLE_GROUPS, type MuscleGroup } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Tier thresholds (ai_engine_plan.md §4.4): green ≥75, yellow 50–74, red <50.
const GREEN = '#34C759';
const YELLOW = '#FF9500';
const RED = '#FF3B30';

// Re-compute recovery if the cached state is older than this when the tab gains focus
// (so scores refresh after a logged workout without thrashing on every focus).
const STALE_MS = 60_000;

function tierColor(score: number): string {
  if (score >= 75) return GREEN;
  if (score >= 50) return YELLOW;
  return RED;
}

function formatMuscleGroup(mg: string): string {
  return mg.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function timeAgo(ts: number | null): string {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function RecoveryDashboard() {
  const { recoveryScores, refresh, lastRefreshedAt } = useAI();
  const [refreshing, setRefreshing] = useState(false);

  const byGroup = useMemo(() => {
    const m = new Map<MuscleGroup, RecoveryScore>();
    for (const s of recoveryScores) m.set(s.muscle_group, s);
    return m;
  }, [recoveryScores]);

  // Source label: 'onnx_v1' → "AI Model", 'heuristic' → "Estimate" (mixed → "Mixed").
  const source = useMemo(() => {
    if (recoveryScores.length === 0) return null;
    const versions = new Set(recoveryScores.map((s) => s.model_version));
    if (versions.size > 1) return 'Mixed';
    return versions.has('onnx_v1') ? 'AI Model' : 'Estimate';
  }, [recoveryScores]);

  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Refresh on focus if scores are missing or stale (e.g. after finishing a workout).
  useFocusEffect(
    useCallback(() => {
      if (!lastRefreshedAt || Date.now() - lastRefreshedAt > STALE_MS) {
        runRefresh();
      }
    }, [lastRefreshedAt, runRefresh]),
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Recovery</Text>
          {source && (
            <View
              style={[styles.sourceBadge, source === 'AI Model' ? styles.sourceAi : styles.sourceEstimate]}
            >
              <Text
                style={[styles.sourceText, source === 'AI Model' ? styles.sourceTextAi : styles.sourceTextEstimate]}
              >
                {source}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={runRefresh}
          disabled={refreshing}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Ionicons name="refresh" size={18} color="#007AFF" />
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Muscle readiness{lastRefreshedAt && !refreshing ? ` · updated ${timeAgo(lastRefreshedAt)}` : ''}
      </Text>

      {recoveryScores.length === 0 ? (
        <Text style={styles.empty}>
          Recovery scores will appear here once your training is processed. Tap refresh to compute now.
        </Text>
      ) : (
        <View style={styles.grid}>
          {MUSCLE_GROUPS.map((mg) => {
            const s = byGroup.get(mg);
            if (!s) return null;
            const color = tierColor(s.score);
            return (
              <View key={mg} style={styles.row}>
                <Text style={styles.muscleName} numberOfLines={1}>
                  {formatMuscleGroup(mg)}
                </Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${s.score}%`, backgroundColor: color }]} />
                </View>
                <Text style={[styles.score, { color }]}>{s.score}</Text>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.legend}>
        <LegendDot color={GREEN} label="Ready 75+" />
        <LegendDot color={YELLOW} label="Caution 50–74" />
        <LegendDot color={RED} label="Fatigued <50" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  sourceBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sourceAi: {
    backgroundColor: '#E5F0FF',
  },
  sourceEstimate: {
    backgroundColor: '#EFEFF4',
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sourceTextAi: {
    color: '#007AFF',
  },
  sourceTextEstimate: {
    color: '#8E8E93',
  },
  refreshBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
    marginBottom: 12,
  },
  empty: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
    marginBottom: 12,
  },
  grid: {
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  muscleName: {
    width: 86,
    fontSize: 13,
    color: '#333',
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E5EA',
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  score: {
    width: 28,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 11,
    color: '#8E8E93',
  },
});
