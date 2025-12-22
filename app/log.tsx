import ExercisePicker from "@/components/ExercisePicker";
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
  const [rpe, setRpe] = useState("");
  const [isWarmup, setIsWarmup] = useState(false);

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
    const rpeNum = rpe ? parseInt(rpe) : undefined;

    if (isNaN(repsNum) || isNaN(weightNum) || repsNum <= 0 || weightNum < 0) {
      Alert.alert("Error", "Please enter valid reps and weight");
      return;
    }

    if (rpeNum && (rpeNum < 1 || rpeNum > 10)) {
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
        rpe: rpeNum,
        isWarmup: isWarmup ? 1 : 0,
      });

      setSets([
        ...sets,
        {
          exerciseId: currentExercise.id,
          exerciseName: currentExercise.name,
          setIndex,
          reps: repsNum,
          weightKg: weightNum,
          rpe: rpeNum,
          isWarmup,
        },
      ]);

      // Reset form but keep weight
      setReps("10");
      setRpe("");
      setIsWarmup(false);

      Alert.alert("Success", "Set logged!");
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

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>RPE (optional)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={rpe}
                  onChangeText={setRpe}
                  placeholder="8"
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.warmupToggle}
              onPress={() => setIsWarmup(!isWarmup)}
            >
              <View style={[styles.checkbox, isWarmup && styles.checkboxChecked]}>
                {isWarmup && <Text style={styles.checkmark}>X</Text>}
              </View>
              <Text style={styles.warmupLabel}>Warmup Set</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.addSetButton} onPress={handleAddSet}>
              <Text style={styles.addSetButtonText}>Add Set</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Logged Sets */}
        {sets.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Logged Sets ({sets.length})</Text>
            {sets.map((set, index) => (
              <View key={index} style={[styles.setItem, set.isWarmup && styles.warmupSet]}>
                <Text style={styles.setExercise}>{set.exerciseName}</Text>
                <Text style={styles.setText}>
                  Set {set.setIndex}: {set.reps} reps x {set.weightKg}kg
                  {set.rpe && ` @ RPE ${set.rpe}`}
                  {set.isWarmup && " (warmup)"}
                </Text>
              </View>
            ))}
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
  setItem: {
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  warmupSet: {
    borderLeftColor: "#FF9500",
    backgroundColor: "#FFF9F0",
  },
  setExercise: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 3,
  },
  setText: {
    fontSize: 14,
    color: "#666",
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

