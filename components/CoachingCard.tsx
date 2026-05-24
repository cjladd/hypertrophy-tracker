import type { CoachingInsight, InsightType } from '@/lib/ai/types';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const TYPE_LABEL: Record<InsightType, string> = {
  post_workout: 'Post-Workout',
  daily: 'Today',
  weekly: 'This Week',
};

type Props = {
  insight: CoachingInsight;
  onDismiss: (id: string) => void;
};

export default function CoachingCard({ insight, onDismiss }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{TYPE_LABEL[insight.insight_type]}</Text>
        <TouchableOpacity
          onPress={() => onDismiss(insight.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.content}>{insight.content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#EBF5FF',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
    padding: 14,
    marginBottom: 16,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#007AFF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dismissText: {
    fontSize: 13,
    color: '#A0BFDF',
  },
  content: {
    fontSize: 15,
    color: '#1A3550',
    lineHeight: 22,
  },
});
