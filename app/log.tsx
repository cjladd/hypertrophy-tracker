// app/log.tsx
// Workout logging screen aligned with PRD v1
// No warmups, no per-set notes, working sets only, weightLb

import ExercisePicker from "@/components/ExercisePicker";
import RPEPicker, { getRPEColor } from "@/components/RPEPicker";
import {
    addSet,
    addWorkoutExercise,
    finishWorkout,
    getLastWeightForExercise,
    startWorkout
} from "@/lib/repo";
import type { Exercise, Set, WorkoutExercise } from "@/lib/types";
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

interface WorkoutExerciseWithSets extends WorkoutExercise {
  exercise: Exercise;
  sets: Set[];
}

export default function LogWorkoutScreen() {
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseWithSets[]>([]);
  const [currentWorkoutExercise, setCurrentWorkoutExercise] = useState<WorkoutExerciseWithSets | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Form state
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [inlineStatus, setInlineStatus] = useState("");

  const handleStartWorkout = async () => {
    try {
      const workout = await startWorkout();
      setWorkoutId(workout.id);
      setWorkoutStarted(true);
    } catch (error) {
      Alert.alert("Error", "Failed to start workout");
    }
  };

  const handleSelectExercise = async (exercise: Exercise) => {
    if (!workoutId) return;

    // Check if exercise already added to this workout
    const existing = workoutExercises.find((we) => we.exercise_id === exercise.id);
    if (existing) {
      setCurrentWorkoutExercise(existing);
      setPickerVisible(false);
      // Pre-fill weight from last set in current workout
      if (existing.sets.length > 0) {
        setWeight(String(existing.sets[existing.sets.length - 1].weight_lb));
      }
      return;
    }

    // Add new exercise to workout
    try {
      const orderIndex = workoutExercises.length;
      const workoutExercise = await addWorkoutExercise(workoutId, exercise.id, orderIndex);

      // Get last weight used for this exercise (from previous workouts)
      const lastWeight = await getLastWeightForExercise(exercise.id);

      const newWorkoutExercise: WorkoutExerciseWithSets = {
        ...workoutExercise,
        exercise,
        sets: [],
      };

      setWorkoutExercises([...workoutExercises, newWorkoutExercise]);
      setCurrentWorkoutExercise(newWorkoutExercise);
      setWeight(lastWeight ? String(lastWeight) : "");
      setPickerVisible(false);
    } catch (error) {
      Alert.alert("Error", "Failed to add exercise");
    }
  };

  const handleAddSet = async () => {
    if (!workoutId || !currentWorkoutExercise) return;

    const repsNum = parseInt(reps);
    const weightNum = parseFloat(weight);

    if (isNaN(repsNum) || repsNum <= 0) {
      Alert.alert("Error", "Please enter valid reps");
      return;
    }

    if (isNaN(weightNum) || weightNum < 0) {
      Alert.alert("Error", "Please enter valid weight");
      return;
    }

    try {
      const setIndex = currentWorkoutExercise.sets.length + 1;

      const newSet = await addSet({
        workoutExerciseId: currentWorkoutExercise.id,
        setIndex,
        weightLb: weightNum,
        reps: repsNum,
        rpe: rpe,
      });

      // Update local state
      const updatedWorkoutExercise = {
        ...currentWorkoutExercise,
        sets: [...currentWorkoutExercise.sets, newSet],
      };

      setWorkoutExercises(
        workoutExercises.map((we) =>
          we.id === currentWorkoutExercise.id ? updatedWorkoutExercise : we
        )
      );
      setCurrentWorkoutExercise(updatedWorkoutExercise);

      // Reset form (keep weight for next set)
      setReps("10");
      setRpe(undefined);
      setInlineStatus("Set logged ✓");
      setTimeout(() => setInlineStatus(""), 1500);
    } catch (error) {
      Alert.alert("Error", "Failed to log set");
    }
  };

  const handleFinishWorkout = async () => {
    if (!workoutId) return;

    const totalSets = workoutExercises.reduce((sum, we) => sum + we.sets.length, 0);
    if (totalSets === 0) {
      Alert.alert("No Sets", "Log at least one set before finishing.");
      return;
    }

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
              router.back();
            } catch (error) {
              Alert.alert("Error", "Failed to finish workout");
            }
          },
        },
      ]
    );
  };

  const getTotalSets = () => workoutExercises.reduce((sum, we) => sum + we.sets.length, 0);

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
              {currentWorkoutExercise
                ? currentWorkoutExercise.exercise.name
                : "Select Exercise"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Set Input */}
        {currentWorkoutExercise && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Log Set for {currentWorkoutExercise.exercise.name}
            </Text>

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
                <Text style={styles.inputLabel}>Weight (lb)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="135"
                />
              </View>
            </View>

            <RPEPicker value={rpe} onChange={setRpe} />

            <TouchableOpacity style={styles.addSetButton} onPress={handleAddSet}>
              <Text style={styles.addSetButtonText}>Add Set</Text>
            </TouchableOpacity>
            {inlineStatus ? (
              <Text style={styles.inlineStatus}>{inlineStatus}</Text>
            ) : null}
          </View>
        )}

        {/* Logged Sets by Exercise */}
        {workoutExercises.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Logged Sets ({getTotalSets()})
            </Text>
            {workoutExercises.map((we) => (
              <View key={we.id} style={styles.exerciseGroup}>
                <TouchableOpacity
                  style={styles.exerciseHeader}
                  onPress={() => {
                    setCurrentWorkoutExercise(we);
                    if (we.sets.length > 0) {
                      setWeight(String(we.sets[we.sets.length - 1].weight_lb));
                    }
                  }}
                >
                  <Text style={styles.exerciseGroupName}>{we.exercise.name}</Text>
                  <Text style={styles.exerciseSetCount}>
                    {we.sets.length} set{we.sets.length !== 1 ? "s" : ""}
                  </Text>
                </TouchableOpacity>
                {we.sets.map((set) => {
                  const rpeColor = getRPEColor(set.rpe ?? undefined);
                  return (
                    <View
                      key={set.id}
                      style={[styles.setItem, { borderLeftColor: rpeColor }]}
                    >
                      <Text style={styles.setText}>
                        Set {set.set_index}:{" "}
                        <Text style={styles.setTextBold}>
                          {set.reps} × {set.weight_lb} lb
                        </Text>
                      </Text>
                      {set.rpe && (
                        <View style={[styles.rpeBadge, { backgroundColor: rpeColor }]}>
                          <Text style={styles.rpeBadgeText}>RPE {set.rpe}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Finish Button */}
      {getTotalSets() > 0 && (
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
  addSetButton: {
    backgroundColor: "#34C759",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
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
  exerciseGroup: {
    marginBottom: 15,
  },
  exerciseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    marginBottom: 8,
  },
  exerciseGroupName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  exerciseSetCount: {
    fontSize: 14,
    color: "#666",
  },
  setItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f9f9f9",
    padding: 10,
    borderRadius: 6,
    marginBottom: 6,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  setText: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  setTextBold: {
    fontWeight: "700",
    color: "#333",
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
