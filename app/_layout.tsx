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
      <Stack />
    </SettingsProvider>
  );
}
