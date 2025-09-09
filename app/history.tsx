import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { listRecentWorkouts } from '../lib/repo';

export default function HistoryScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await listRecentWorkouts(20);
    setRows(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      style={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 8 }}>Recent Workouts</Text>
      {rows.length === 0 ? (
        <Text>No workouts yet.</Text>
      ) : (
        rows.map((w) => (
          <View key={w.id} style={{ marginBottom: 8 }}>
            <Text>
              {new Date(w.started_at).toLocaleString()}
              {w.split_day ? ` • ${w.split_day}` : ''}
              {w.finished_at ? ' • finished' : ' • in progress'}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
