import { SettingsProvider } from "@/context/SettingsContext";
import { seedExercises, seedPPLRoutine } from "@/lib/repo";
import { Stack } from "expo-router";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    // Initialize database and seed exercises/routines if needed
    const initializeData = async () => {
      try {
        await seedExercises();
        await seedPPLRoutine(); // Seed PPL routine after exercises
      } catch (err) {
        console.error("Failed to seed data:", err);
      }
    };
    initializeData();
  }, []);

  return (
    <SettingsProvider>
      <Stack screenOptions={{ headerShown: false }}>
        {/* Tabs group shows the bottom tab bar */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* These screens are outside tabs - no tab bar */}
        <Stack.Screen name="log" options={{ headerShown: true, title: "Workout", headerBackTitle: "Home" }} />
        <Stack.Screen name="exercises" options={{ headerShown: true, title: "Exercises", headerBackTitle: "Home" }} />
        <Stack.Screen name="templates" options={{ headerShown: true, title: "Templates", headerBackTitle: "Home" }} />
      </Stack>
    </SettingsProvider>
  );
}
