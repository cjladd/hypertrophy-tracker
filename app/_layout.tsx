import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { seedIfNeeded } from '../lib/repo';

export default function RootLayout() {
    // Seed initial exercises once
    useEffect(() => { seedIfNeeded(); }, []);
    return (
        <Tabs>
            <Tabs.Screen name="log" options={{ title: 'Log' }} />
            <Tabs.Screen name="history" options={{ title: 'History' }} />
        </Tabs>
    );
}

