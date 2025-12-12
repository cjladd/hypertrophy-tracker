import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { SettingsProvider } from '../context/SettingsContext';
import { seedIfNeeded } from '../lib/repo';

export default function RootLayout() {
  useEffect(() => { seedIfNeeded(); }, []);
  return (
    <SettingsProvider>
      <Tabs>
        <Tabs.Screen name="log" options={{ title: 'Log' }} />
        <Tabs.Screen name="history" options={{ title: 'History' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} /> {/* new tab */}
      </Tabs>
    </SettingsProvider>
  );
}
