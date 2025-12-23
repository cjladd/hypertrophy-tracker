import { SettingsProvider } from "@/context/SettingsContext";
import { seedExercises } from "@/lib/repo";
import { Stack } from "expo-router";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    // Initialize database and seed exercises if needed
    seedExercises().catch((err) => {
      console.error("Failed to seed exercises:", err);
    });
  }, []);

  return (
    <SettingsProvider>
      <Stack />
    </SettingsProvider>
  );
}
