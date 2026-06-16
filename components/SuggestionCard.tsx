// components/SuggestionCard.tsx
// Phase 5.3: renders one adaptive programming suggestion with Accept / Dismiss actions.

import type { AdaptiveSuggestion, AdjustmentType } from '@/lib/ai/types';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const TYPE_META: Record<AdjustmentType, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  deload: { label: 'Deload', icon: 'trending-down', color: '#FF9500' },
  volume_increase: { label: 'Add Volume', icon: 'add-circle', color: '#34C759' },
  volume_decrease: { label: 'Reduce Volume', icon: 'remove-circle', color: '#FF9500' },
  exercise_swap: { label: 'Swap Exercise', icon: 'swap-horizontal', color: '#007AFF' },
  frequency_change: { label: 'Train More Often', icon: 'calendar', color: '#007AFF' },
};

type Props = {
  suggestion: AdaptiveSuggestion;
  onAccept: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
};

export default function SuggestionCard({ suggestion, onAccept, onReject }: Props) {
  const [busy, setBusy] = useState(false);
  const meta = TYPE_META[suggestion.adjustment_type];

  const handle = async (fn: (id: string) => Promise<void>) => {
    setBusy(true);
    try {
      await fn(suggestion.id);
    } catch {
      setBusy(false); // on success the card unmounts; only reset if it failed
    }
  };

  return (
    <View style={[styles.card, { borderLeftColor: meta.color }]}>
      <View style={styles.header}>
        <Ionicons name={meta.icon} size={16} color={meta.color} />
        <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
      </View>
      <Text style={styles.reasoning}>{suggestion.reasoning}</Text>
      <View style={styles.actions}>
        {busy ? (
          <ActivityIndicator size="small" color={meta.color} style={styles.spinner} />
        ) : (
          <>
            <TouchableOpacity style={styles.dismissBtn} onPress={() => handle(onReject)}>
              <Text style={styles.dismissText}>Dismiss</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: meta.color }]}
              onPress={() => handle(onAccept)}
            >
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  reasoning: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  spinner: {
    height: 34,
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  dismissText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '600',
  },
  acceptBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
  },
  acceptText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '700',
  },
});
