import { SettingsProvider } from "@/context/SettingsContext";
import { seedIfNeeded } from "@/lib/repo";
import { Stack } from "expo-router";
import { useEffect } from "react";

export default function RootLayout() {
  useEffect(() => {
    // Initialize database and seed if needed
    seedIfNeeded().catch((err) => {
      console.error("Failed to initialize database:", err);
    });
  }, []);

  return (
    <SettingsProvider>
      <Stack />
    </SettingsProvider>
  );
}
