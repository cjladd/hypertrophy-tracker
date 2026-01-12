import { Ionicons } from "@expo/vector-icons";
import { useSettings } from "@/context/SettingsContext";
import { getRoutineDays, listRoutines } from "@/lib/repo";
import type { Routine, RoutineDay } from "@/lib/types";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type RoutineWithDays = Routine & { days: RoutineDay[] };

export default function RoutinesScreen() {
  const router = useRouter();
  const { activeRoutineId, setActiveRoutineId } = useSettings();
  const [routines, setRoutines] = useState<RoutineWithDays[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoutines();
  }, []);

  const loadRoutines = async () => {
    try {
      const allRoutines = await listRoutines();
      const routinesWithDays = await Promise.all(
        allRoutines.map(async (routine) => ({
          ...routine,
          days: await getRoutineDays(routine.id),
        }))
      );
      setRoutines(routinesWithDays);
    } catch (err) {
      console.error("Failed to load routines:", err);
    } finally {
      setLoading(false);
    }
  };

  const getRoutineDescription = (routine: RoutineWithDays): string => {
    const dayCount = routine.days.length;
    switch (routine.name) {
      case "PPL":
        return `${dayCount}-day split - Push, Pull, Legs cycle`;
      case "Upper/Lower":
        return `${dayCount}-day split - Alternating upper and lower body`;
      case "Full Body":
        return `${dayCount}-day split - Train everything each session`;
      case "Bro Split":
        return `${dayCount}-day split - One muscle group per day`;
      default:
        return `${dayCount} days per cycle`;
    }
  };

  const handleSelectRoutine = (routineId: string) => {
    const routine = routines.find((r) => r.id === routineId);
    setActiveRoutineId(routineId);
    Alert.alert(
      "Routine Selected",
      `You're now using the ${routine?.name} routine.`,
      [{ text: "OK", onPress: () => router.back() }]
    );
  };

  const handleClearRoutine = () => {
    Alert.alert(
      "Clear Routine?",
      "You can still start workouts manually, but you won't have a routine to follow.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            setActiveRoutineId(null);
            router.back();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerText}>
        Choose a training routine that fits your schedule and goals.
      </Text>

      {routines.map((routine) => {
        const isActive = routine.id === activeRoutineId;
        return (
          <TouchableOpacity
            key={routine.id}
            style={[styles.routineCard, isActive && styles.routineCardActive]}
            onPress={() => handleSelectRoutine(routine.id)}
            activeOpacity={0.7}
          >
            <View style={styles.routineHeader}>
              <View style={styles.routineTitleRow}>
                <Text style={styles.routineName}>{routine.name}</Text>
                {routine.is_preset === 1 && (
                  <View style={styles.presetBadge}>
                    <Text style={styles.presetBadgeText}>Preset</Text>
                  </View>
                )}
              </View>
              {isActive && (
                <View style={styles.activeIndicator}>
                  <Ionicons name="checkmark-circle" size={16} color="#007AFF" />
                  <Text style={styles.activeIndicatorText}>Active</Text>
                </View>
              )}
            </View>
            <Text style={styles.routineDescription}>
              {getRoutineDescription(routine)}
            </Text>
            <View style={styles.daysContainer}>
              {routine.days.map((day) => (
                <View key={day.id} style={styles.dayPill}>
                  <Text style={styles.dayPillText}>{day.name}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        );
      })}

      {activeRoutineId && (
        <TouchableOpacity style={styles.clearButton} onPress={handleClearRoutine}>
          <Text style={styles.clearButtonText}>Clear Routine Selection</Text>
        </TouchableOpacity>
      )}

      <View style={styles.infoBox}>
        <View style={styles.infoTitleRow}>
          <Ionicons name="information-circle-outline" size={18} color="#007AFF" />
          <Text style={styles.infoTitle}>About Routines</Text>
        </View>
        <Text style={styles.infoText}>
          Each routine cycles through its days automatically. After completing a workout,
          the app suggests the next day in the sequence.
        </Text>
        <Text style={styles.infoText}>
          Custom routines are coming in a future update!
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  headerText: {
    fontSize: 15,
    color: "#666",
    marginBottom: 20,
    lineHeight: 22,
  },
  routineCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  routineCardActive: {
    borderColor: "#007AFF",
    backgroundColor: "#f8fbff",
  },
  routineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  routineTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routineName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  presetBadge: {
    backgroundColor: "#e8e8e8",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  presetBadgeText: {
    fontSize: 11,
    color: "#666",
    fontWeight: "600",
  },
  activeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeIndicatorText: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "600",
  },
  routineDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  daysContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayPill: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  dayPillText: {
    fontSize: 13,
    color: "#444",
    fontWeight: "500",
  },
  clearButton: {
    marginTop: 8,
    padding: 16,
    alignItems: "center",
  },
  clearButtonText: {
    fontSize: 15,
    color: "#FF3B30",
    fontWeight: "500",
  },
  infoBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  infoTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  infoText: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
    marginBottom: 8,
  },
});
