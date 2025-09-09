import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { listRecentWorkouts } from '../lib/repo';

export default function HistoryScreen() {
    const [rows, setRows] = useState<any[]>([]);
    useEffect(() => { listRecentWorkouts(20).then(setRows); }, []);

    return (
        <View style={{ padding: 16, gap: 8 }}>
            <Text style={{ fontSize: 20, fontWeight: '600' }}>Recent Workouts</Text>
            {rows.map((w) => (
                <View key={w.id}>
                    <Text>
                        {new Date(w.started_at).toLocaleString()}
                        {w.split_day ? ` • ${w.split_day}` : ''}
                        {w.finished_at ? ' • finished' : ' • in progress'}
                    </Text>
                </View>
            ))}
        </View>
    );
}
