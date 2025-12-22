import ExercisePicker from "@/components/ExercisePicker";
import RPEPicker, { getRPEColor } from "@/components/RPEPicker";
import { addSet, finishWorkout, startWorkout } from "@/lib/repo";
import { Stack, router } from "expo-router";
import { useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface Exercise {
  id: string;
  name: string;
  muscle_group: string;
}

interface LoggedSet {
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  rpe?: number;
  isWarmup: boolean;
  notes?: string;
}

export default function LogWorkoutScreen() {
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [currentExercise, setCurrentExercise] = useState<Exercise | null>(null);
  const [sets, setSets] = useState<LoggedSet[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  
  // Form state
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("100");
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [isWarmup, setIsWarmup] = useState(false);
  const [inlineStatus, setInlineStatus] = useState("");

  const handleStartWorkout = async () => {
    try {
      const workout = await startWorkout();
      setWorkoutId(workout.id);
      setWorkoutStarted(true);
      Alert.alert("Success", "Workout started!");
    } catch (error) {
      Alert.alert("Error", "Failed to start workout");
    }
  };

  const handleSelectExercise = (exercise: Exercise) => {
    setCurrentExercise(exercise);
    setPickerVisible(false);
  };

  const handleAddSet = async () => {
    if (!workoutId || !currentExercise) return;

    const repsNum = parseInt(reps);
    const weightNum = parseFloat(weight);

    if (isNaN(repsNum) || isNaN(weightNum) || repsNum <= 0 || weightNum < 0) {
      Alert.alert("Error", "Please enter valid reps and weight");
      return;
    }

    if (rpe && (rpe < 1 || rpe > 10)) {
      Alert.alert("Error", "RPE must be between 1 and 10");
      return;
    }

    try {
      const setIndex = sets.filter((s) => s.exerciseId === currentExercise.id).length + 1;
      
      await addSet({
        workoutId,
        exerciseId: currentExercise.id,
        setIndex,
        reps: repsNum,
        weightKg: weightNum,
        rpe: rpe,
        isWarmup: isWarmup ? 1 : 0,
        notes: notes.trim() || undefined,
      });

      setSets([
        ...sets,
        {
          exerciseId: currentExercise.id,
          exerciseName: currentExercise.name,
          setIndex,
          reps: repsNum,
          weightKg: weightNum,
          rpe: rpe,
          isWarmup,
          notes: notes.trim() || undefined,
        },
      ]);

      // Reset form but keep weight
      setReps("10");
      setRpe(undefined);
      setNotes("");
      setIsWarmup(false);
      setInlineStatus("Set logged");
      setTimeout(() => setInlineStatus(""), 1500);
    } catch (error) {
      Alert.alert("Error", "Failed to log set");
    }
  };

  const handleFinishWorkout = async () => {
    if (!workoutId) return;

    Alert.alert(
      "Finish Workout",
      "Are you sure you want to finish this workout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Finish",
          onPress: async () => {
            try {
              await finishWorkout(workoutId);
              Alert.alert("Success", "Workout finished!", [
                { text: "OK", onPress: () => router.back() },
              ]);
            } catch (error) {
              Alert.alert("Error", "Failed to finish workout");
            }
          },
        },
      ]
    );
  };

  if (!workoutStarted) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Log Workout" }} />
        <View style={styles.startContainer}>
          <Text style={styles.startTitle}>Ready to train?</Text>
          <Text style={styles.startSubtitle}>Start a new workout session</Text>
          <TouchableOpacity style={styles.startButton} onPress={handleStartWorkout}>
            <Text style={styles.startButtonText}>Start Workout</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Log Workout" }} />

      <ScrollView style={styles.content}>
        {/* Exercise Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercise</Text>
          <TouchableOpacity
            style={styles.exerciseButton}
            onPress={() => setPickerVisible(true)}
          >
            <Text style={styles.exerciseButtonText}>
              {currentExercise ? currentExercise.name : "Select Exercise"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Set Input */}
        {currentExercise && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Log Set</Text>
            
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reps</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={reps}
                  onChangeText={setReps}
                  placeholder="10"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="100"
                />
              </View>
            </View>

            <RPEPicker value={rpe} onChange={setRpe} />

            <TouchableOpacity
              style={styles.warmupToggle}
              onPress={() => setIsWarmup(!isWarmup)}
            >
              <View style={[styles.checkbox, isWarmup && styles.checkboxChecked]}>
                {isWarmup && <Text style={styles.checkmark}>X</Text>}
              </View>
              <Text style={styles.warmupLabel}>Warmup Set</Text>
            </TouchableOpacity>

            <View style={styles.notesContainer}>
              <Text style={styles.inputLabel}>Notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="e.g., felt strong, paused reps, etc."
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
              />
            </View>

            <TouchableOpacity style={styles.addSetButton} onPress={handleAddSet}>
              <Text style={styles.addSetButtonText}>Add Set</Text>
            </TouchableOpacity>
            {inlineStatus ? (
              <Text style={styles.inlineStatus}>{inlineStatus}</Text>
            ) : null}
          </View>
        )}

        {/* Logged Sets */}
        {sets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Logged Sets ({sets.length})</Text>
            {sets.map((set, index) => {
              const rpeColor = getRPEColor(set.rpe);
              return (
                <View
                  key={index}
                  style={[
                    styles.setItem,
                    set.isWarmup && styles.warmupSet,
                    { borderLeftColor: set.isWarmup ? "#FF9500" : rpeColor },
                  ]}
                >
                  <View style={styles.setHeader}>
                    <Text style={styles.setExercise}>{set.exerciseName}</Text>
                    {set.isWarmup && (
                      <View style={styles.warmupBadge}>
                        <Text style={styles.warmupBadgeText}>WARMUP</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.setDetails}>
                    <Text style={styles.setText}>
                      Set {set.setIndex}: <Text style={styles.setTextBold}>{set.reps} reps × {set.weightKg}kg</Text>
                    </Text>
                    {set.rpe && (
                      <View style={[styles.rpeBadge, { backgroundColor: rpeColor }]}>
                        <Text style={styles.rpeBadgeText}>RPE {set.rpe}</Text>
                      </View>
                    )}
                  </View>
                  {set.notes && (
                    <Text style={styles.setNotes}>Notes: {set.notes}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Finish Button */}
      {sets.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.finishButton} onPress={handleFinishWorkout}>
            <Text style={styles.finishButtonText}>Finish Workout</Text>
          </TouchableOpacity>
        </View>
      )}

      <ExercisePicker
        visible={pickerVisible}
        onSelect={handleSelectExercise}
        onClose={() => setPickerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  startContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  startTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 10,
  },
  startSubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
  },
  startButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 12,
  },
  startButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: "white",
    padding: 15,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  exerciseButton: {
    backgroundColor: "#f0f0f0",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  exerciseButtonText: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 15,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginBottom: 5,
  },
  input: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  warmupToggle: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 15,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#ccc",
    borderRadius: 4,
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  checkmark: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  warmupLabel: {
    fontSize: 16,
    color: "#333",
  },
  notesContainer: {
    marginBottom: 15,
  },
  notesInput: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  addSetButton: {
    backgroundColor: "#34C759",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  addSetButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  inlineStatus: {
    marginTop: 8,
    fontSize: 13,
    color: "#4CAF50",
    textAlign: "center",
  },
  setItem: {
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  warmupSet: {
    backgroundColor: "#FFF9F0",
  },
  setHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  setExercise: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  warmupBadge: {
    backgroundColor: "#FF9500",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  warmupBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "white",
    letterSpacing: 0.5,
  },
  setDetails: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  setText: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  setTextBold: {
    fontWeight: "700",
    color: "#333",
    fontSize: 15,
  },
  rpeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  rpeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "white",
  },
  setNotes: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  footer: {
    backgroundColor: "white",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  finishButton: {
    backgroundColor: "#FF3B30",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  finishButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});


