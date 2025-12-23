import { useSettings } from "@/context/SettingsContext";
import { resetDB } from "@/lib/db";
import { seedExercises } from "@/lib/repo";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function SettingsScreen() {
  const { weightJumpLb, setWeightJumpLb } = useSettings();
  const [localWeightJump, setLocalWeightJump] = useState(String(weightJumpLb));
  const [busy, setBusy] = useState(false);

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
      "This deletes ALL workouts, sets, templates, and exercises, then recreates defaults. This cannot be undone.",
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
              Alert.alert("Done", "Database reset and default exercises reseeded.");
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Settings" }} />

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
});
