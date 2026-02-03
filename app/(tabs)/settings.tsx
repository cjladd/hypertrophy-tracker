import { useSettings } from "@/context/SettingsContext";
import { resetDB } from "@/lib/db";
import { getRoutineById, getRoutineDays, seedAllRoutines, seedExercises } from "@/lib/repo";
import type { Routine, RoutineDay } from "@/lib/types";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

export default function SettingsScreen() {
  const { weightJumpLb, setWeightJumpLb, activeRoutineId, resetOnboarding } = useSettings();
  const [localWeightJump, setLocalWeightJump] = useState(String(weightJumpLb));
  const [busy, setBusy] = useState(false);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [routineDays, setRoutineDays] = useState<RoutineDay[]>([]);

  // Load routine data when screen focuses (to pick up changes from routines screen)
  useFocusEffect(
    useCallback(() => {
      const loadRoutineData = async () => {
        if (activeRoutineId) {
          const activeRoutine = await getRoutineById(activeRoutineId);
          setRoutine(activeRoutine);
          if (activeRoutine) {
            const days = await getRoutineDays(activeRoutine.id);
            setRoutineDays(days);
          } else {
            setRoutineDays([]);
          }
        } else {
          setRoutine(null);
          setRoutineDays([]);
        }
      };
      loadRoutineData();
    }, [activeRoutineId])
  );

  const saveWeightJump = () => {
    const num = parseInt(localWeightJump, 10);
    if (Number.isNaN(num) || num < 0) {
      Alert.alert("Invalid value", "Enter a non-negative number for weight jump.");
      return;
    }
    setWeightJumpLb(num);
    Alert.alert("Saved", `Default jump set to ${num} lb`);
  };

  const confirmResetDb = () => {
    Alert.alert(
      "Reset database?",
      "This deletes ALL workouts, sets, templates, routines, and exercises, then recreates defaults. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await resetDB();
              await seedExercises();
              await seedAllRoutines();
              Alert.alert("Done", "Database reset and defaults reseeded.");
            } catch (e) {
              console.error(e);
              Alert.alert("Error", "Failed to reset database.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const reseedDefaults = async () => {
    setBusy(true);
    try {
      await seedExercises();
      Alert.alert("Done", "Default exercises are seeded.");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to seed default exercises.");
    } finally {
      setBusy(false);
    }
  };

  const restoreDefaultSettings = () => {
    setLocalWeightJump("5");
    setWeightJumpLb(5);
    Alert.alert("Reset", "Settings restored to defaults.");
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={Keyboard.dismiss}
    >
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Tweak defaults and run dev tools.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Progression Defaults</Text>
        <View style={styles.fieldRow}>
          <Text style={styles.label}>Weight jump (lb)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={localWeightJump}
            onChangeText={setLocalWeightJump}
            placeholder="5"
          />
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={saveWeightJump} disabled={busy}>
          <Text style={styles.primaryButtonText}>Save</Text>
        </TouchableOpacity>
      </View>

      {/* Units Toggle Placeholder (Post-v1 Feature) */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Units</Text>
        <View style={styles.unitToggleRow}>
          <Text style={styles.unitLabel}>Weight Unit</Text>
          <View style={styles.unitToggle}>
            <View style={[styles.unitOption, styles.unitOptionActive]}>
              <Text style={[styles.unitOptionText, styles.unitOptionTextActive]}>lb</Text>
            </View>
            <View style={[styles.unitOption, styles.unitOptionDisabled]}>
              <Text style={[styles.unitOptionText, styles.unitOptionTextDisabled]}>kg</Text>
            </View>
          </View>
        </View>
        <Text style={styles.unitNote}>Kilogram support coming in a future update</Text>
      </View>

      {/* Manage Split Days */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Training Routine</Text>
        {routine ? (
          <>
            <View style={styles.routineHeader}>
              <Text style={styles.routineName}>{routine.name}</Text>
              {routine.is_preset === 1 && (
                <Text style={styles.presetBadge}>Preset</Text>
              )}
            </View>
            <View style={styles.routineDaysList}>
              {routineDays.map((day, index) => (
                <View key={day.id} style={styles.routineDayItem}>
                  <Text style={styles.routineDayNumber}>{index + 1}</Text>
                  <Text style={styles.routineDayName}>{day.name}</Text>
                </View>
              ))}
            </View>
            <Link href="/routines" asChild>
              <TouchableOpacity style={styles.changeRoutineButton}>
                <Text style={styles.changeRoutineButtonText}>Change Routine</Text>
              </TouchableOpacity>
            </Link>
          </>
        ) : (
          <>
            <Text style={styles.noRoutineText}>No routine selected</Text>
            <Link href="/routines" asChild>
              <TouchableOpacity style={styles.selectRoutineButton}>
                <Text style={styles.selectRoutineButtonText}>Choose a Routine</Text>
              </TouchableOpacity>
            </Link>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Dev tools</Text>
        <TouchableOpacity
          style={[styles.destructiveButton, busy && styles.disabledButton]}
          onPress={confirmResetDb}
          disabled={busy}
        >
          <Text style={styles.destructiveText}>Reset database</Text>
          <Text style={styles.destructiveSubtext}>Drops all data, recreates tables, seeds defaults</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, busy && styles.disabledButton]}
          onPress={reseedDefaults}
          disabled={busy}
        >
          <Text style={styles.secondaryText}>Reseed default exercises</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, busy && styles.disabledButton]}
          onPress={restoreDefaultSettings}
          disabled={busy}
        >
          <Text style={styles.secondaryText}>Reset settings to defaults</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, busy && styles.disabledButton]}
          onPress={() => {
            resetOnboarding();
            Alert.alert("Done", "Onboarding reset. Restart the app to see the welcome screen.");
          }}
          disabled={busy}
        >
          <Text style={styles.secondaryText}>Reset onboarding (show welcome screen)</Text>
        </TouchableOpacity>
      </View>

      {busy && (
        <View style={styles.busyRow}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.busyText}>Working...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#111",
  },
  subtitle: {
    color: "#444",
    marginBottom: 8,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  fieldRow: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: "#f0f4ff",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d9e5ff",
  },
  secondaryText: {
    color: "#1b4fb8",
    fontWeight: "600",
  },
  destructiveButton: {
    backgroundColor: "#fff1f0",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ffccc7",
  },
  destructiveText: {
    color: "#c21b1b",
    fontWeight: "700",
  },
  destructiveSubtext: {
    color: "#a33",
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.7,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  busyText: {
    color: "#444",
  },
  // Routine styles
  routineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  routineName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  presetBadge: {
    backgroundColor: "#FF9500",
    color: "white",
    fontSize: 11,
    fontWeight: "600",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  routineDaysList: {
    marginTop: 8,
  },
  routineDayItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  routineDayNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#007AFF",
    color: "white",
    textAlign: "center",
    lineHeight: 24,
    fontSize: 12,
    fontWeight: "600",
    marginRight: 12,
    overflow: "hidden",
  },
  routineDayName: {
    fontSize: 15,
    color: "#333",
  },
  routineNote: {
    marginTop: 12,
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
  },
  noRoutineText: {
    color: "#666",
    fontSize: 14,
    marginBottom: 12,
  },
  changeRoutineButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    alignItems: "center",
  },
  changeRoutineButtonText: {
    color: "#007AFF",
    fontSize: 15,
    fontWeight: "600",
  },
  selectRoutineButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    alignItems: "center",
  },
  selectRoutineButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "600",
  },
  // Unit toggle styles
  unitToggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  unitLabel: {
    fontSize: 15,
    color: "#333",
  },
  unitToggle: {
    flexDirection: "row",
    backgroundColor: "#E5E5EA",
    borderRadius: 8,
    padding: 2,
  },
  unitOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  unitOptionActive: {
    backgroundColor: "#007AFF",
  },
  unitOptionDisabled: {
    opacity: 0.5,
  },
  unitOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  unitOptionTextActive: {
    color: "white",
  },
  unitOptionTextDisabled: {
    color: "#8E8E93",
  },
  unitNote: {
    marginTop: 8,
    fontSize: 12,
    color: "#8E8E93",
    fontStyle: "italic",
  },
});
