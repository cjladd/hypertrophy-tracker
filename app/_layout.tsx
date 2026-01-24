import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { seedAllRoutines, seedExercises } from "@/lib/repo";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function RootLayout() {
  useEffect(() => {
    // Initialize database and seed exercises/routines if needed
    const initializeData = async () => {
      try {
        await seedExercises();
        await seedAllRoutines(); // Seed all preset routines
      } catch (err) {
        console.error("Failed to seed data:", err);
      }
    };
    initializeData();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <SettingsProvider>
          <RootNavigator />
        </SettingsProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function RootNavigator() {
  const { isLoading, hasCompletedOnboarding } = useSettings();

  // Show loading indicator while checking onboarding status
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Welcome/onboarding screen */}
      <Stack.Screen 
        name="welcome" 
        options={{ headerShown: false }}
        redirect={hasCompletedOnboarding}
      />
      {/* Tabs group shows the bottom tab bar */}
      <Stack.Screen 
        name="(tabs)" 
        options={{ headerShown: false }}
        redirect={!hasCompletedOnboarding}
      />
      {/* These screens are outside tabs - no tab bar */}
      <Stack.Screen name="log" options={{ headerShown: true, title: "Workout", headerBackTitle: "Home" }} />
      <Stack.Screen name="exercises" options={{ headerShown: true, title: "Exercises", headerBackTitle: "Home" }} />
      <Stack.Screen name="templates" options={{ headerShown: true, title: "Templates", headerBackTitle: "Home" }} />
      <Stack.Screen name="routines" options={{ headerShown: true, title: "Choose Routine", headerBackTitle: "Settings" }} />
    </Stack>
  );
}
