import type { AnomalyAlert, AnomalySeverity, AnomalyType } from '@/lib/ai/types';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SEVERITY_COLOR: Record<AnomalySeverity, string> = {
  high: '#FF3B30',
  medium: '#FF9500',
  low: '#FFCC00',
};

const TYPE_LABEL: Record<AnomalyType, string> = {
  strength_drop: 'Strength Drop',
  overtraining: 'High Volume',
  rpe_degradation: 'Elevated RPE',
  volume_spike: 'Volume Spike',
  consecutive_stalls: 'Multiple Stalls',
};

function formatMuscleGroup(mg: string): string {
  return mg.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function buildMessage(anomaly: AnomalyAlert): string {
  const d = anomaly.details;
  switch (anomaly.anomaly_type) {
    case 'strength_drop':
      return `${d.exercise_name}: last top set ${d.current_weight} lb dropped ${d.drop_pct}% below your recent average of ${d.avg_weight} lb.`;
    case 'overtraining':
      return `${formatMuscleGroup(String(d.muscle_group))}: ${d.total_sets} working sets this week — above the recommended ceiling of ${d.threshold}.`;
    case 'rpe_degradation':
      return `${formatMuscleGroup(String(d.muscle_group))}: average RPE of ${d.avg_rpe} over the past 7 days. A lighter session may help.`;
    case 'volume_spike':
      return `${formatMuscleGroup(String(d.muscle_group))}: volume jumped ${d.increase_pct}% week-over-week (${d.prev_sets} → ${d.current_sets} sets).`;
    case 'consecutive_stalls':
      return `${formatMuscleGroup(String(d.muscle_group))}: ${d.stalled_count} exercises have stalled. Consider a deload or weight reduction.`;
    default:
      return 'Training anomaly detected.';
  }
}

type Props = {
  anomaly: AnomalyAlert;
  onDismiss: (id: string) => void;
};

export default function AnomalyCard({ anomaly, onDismiss }: Props) {
  const accentColor = SEVERITY_COLOR[anomaly.severity];

  return (
    <View style={[styles.card, { borderLeftColor: accentColor }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: accentColor }]}>
          <Text style={styles.badgeText}>{anomaly.severity.toUpperCase()}</Text>
        </View>
        <Text style={styles.typeLabel}>{TYPE_LABEL[anomaly.anomaly_type]}</Text>
        <TouchableOpacity onPress={() => onDismiss(anomaly.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.message}>{buildMessage(anomaly)}</Text>
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
    marginBottom: 6,
    gap: 8,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  typeLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  dismissText: {
    fontSize: 13,
    color: '#999',
  },
  message: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
});
