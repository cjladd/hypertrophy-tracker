// app/log.tsx
// Workout logging screen aligned with PRD v1
// No warmups, no per-set notes, working sets only, weightLb

import ExercisePicker from "@/components/ExercisePicker";
import RPEPicker, { getRPEColor } from "@/components/RPEPicker";
import {
    addSet,
    addWorkoutExercise,
    createTemplate,
    deleteSet,
    finishWorkout,
    getExercises,
    getLastWeightForExercise,
    getLastWorkoutExerciseIds,
    getTemplates,
    removeWorkoutExercise,
    startWorkout,
    updateSet
} from "@/lib/repo";
import type { Exercise, Set, Template, WorkoutExercise } from "@/lib/types";
import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

interface WorkoutExerciseWithSets extends WorkoutExercise {
  exercise: Exercise;
  sets: Set[];
}

type StartMode = 'empty' | 'repeat' | 'template';

export default function LogWorkoutScreen() {
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [workoutStarted, setWorkoutStarted] = useState(false);
  const [startMode, setStartMode] = useState<StartMode | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExerciseWithSets[]>([]);
  const [currentWorkoutExercise, setCurrentWorkoutExercise] = useState<WorkoutExerciseWithSets | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Start screen state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [hasLastWorkout, setHasLastWorkout] = useState(false);
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);

  // Template save modal state
  const [saveTemplateModalVisible, setSaveTemplateModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [pendingExerciseIds, setPendingExerciseIds] = useState<string[]>([]);

  // Form state
  const [reps, setReps] = useState("10");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState<number | undefined>(undefined);
  const [inlineStatus, setInlineStatus] = useState("");

  // Edit set modal state
  const [editSetModalVisible, setEditSetModalVisible] = useState(false);
  const [editingSet, setEditingSet] = useState<Set | null>(null);
  const [editingWorkoutExercise, setEditingWorkoutExercise] = useState<WorkoutExerciseWithSets | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editReps, setEditReps] = useState("");
  const [editRpe, setEditRpe] = useState<string>("");

  // Load data for start screen
  useEffect(() => {
    const loadStartData = async () => {
      try {
        const [templatesData, lastExerciseIds, exercisesData] = await Promise.all([
          getTemplates(),
          getLastWorkoutExerciseIds(),
          getExercises(),
        ]);
        setTemplates(templatesData);
        setHasLastWorkout(lastExerciseIds.length > 0);
        setAllExercises(exercisesData);
      } catch (error) {
        console.error("Failed to load start data:", error);
      }
    };
    loadStartData();
  }, []);

  const handleStartWorkout = async (mode: StartMode, selectedTemplateId?: string) => {
    try {
      const workout = await startWorkout(selectedTemplateId);
      setWorkoutId(workout.id);
      setStartMode(mode);
      setTemplateId(selectedTemplateId ?? null);

      // Pre-populate exercises based on mode
      if (mode === 'repeat') {
        await populateFromLastWorkout(workout.id);
      } else if (mode === 'template' && selectedTemplateId) {
        await populateFromTemplate(workout.id, selectedTemplateId);
      }

      setWorkoutStarted(true);
    } catch (error) {
      Alert.alert("Error", "Failed to start workout");
    }
  };

  const populateFromLastWorkout = async (workoutId: string) => {
    const exerciseIds = await getLastWorkoutExerciseIds();
    const newWorkoutExercises: WorkoutExerciseWithSets[] = [];

    for (let i = 0; i < exerciseIds.length; i++) {
      const exerciseId = exerciseIds[i];
      const exercise = allExercises.find((e) => e.id === exerciseId);
      if (!exercise) continue;

      const we = await addWorkoutExercise(workoutId, exerciseId, i);
      const lastWeight = await getLastWeightForExercise(exerciseId);

      newWorkoutExercises.push({
        ...we,
        exercise,
        sets: [],
      });

      // Set weight for first exercise
      if (i === 0 && lastWeight) {
        setWeight(String(lastWeight));
      }
    }

    setWorkoutExercises(newWorkoutExercises);
    if (newWorkoutExercises.length > 0) {
      setCurrentWorkoutExercise(newWorkoutExercises[0]);
    }
  };

  const populateFromTemplate = async (workoutId: string, templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    const exerciseIds: string[] = JSON.parse(template.exercise_ids);
    const newWorkoutExercises: WorkoutExerciseWithSets[] = [];

    for (let i = 0; i < exerciseIds.length; i++) {
      const exerciseId = exerciseIds[i];
      const exercise = allExercises.find((e) => e.id === exerciseId);
      if (!exercise) continue;

      const we = await addWorkoutExercise(workoutId, exerciseId, i);
      const lastWeight = await getLastWeightForExercise(exerciseId);

      newWorkoutExercises.push({
        ...we,
        exercise,
        sets: [],
      });

      if (i === 0 && lastWeight) {
        setWeight(String(lastWeight));
      }
    }

    setWorkoutExercises(newWorkoutExercises);
    if (newWorkoutExercises.length > 0) {
      setCurrentWorkoutExercise(newWorkoutExercises[0]);
    }
  };

  const handleSelectExercise = async (exercise: Exercise) => {
    if (!workoutId) return;

    // Check if exercise already added to this workout
    const existing = workoutExercises.find((we) => we.exercise_id === exercise.id);
    if (existing) {
      await selectWorkoutExercise(existing);
      setPickerVisible(false);
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

  const selectWorkoutExercise = async (workoutExercise: WorkoutExerciseWithSets) => {
    setCurrentWorkoutExercise(workoutExercise);
    if (workoutExercise.sets.length > 0) {
      const lastSet = workoutExercise.sets[workoutExercise.sets.length - 1];
      setWeight(String(lastSet.weight_lb));
      setReps(String(lastSet.reps));
      setRpe(lastSet.rpe ?? undefined);
      return;
    }

    const lastWeight = await getLastWeightForExercise(workoutExercise.exercise_id);
    setWeight(lastWeight ? String(lastWeight) : "");
    setReps("10");
    setRpe(undefined);
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

      // Keep weight, reps, and RPE for next set (same exercise pattern)
      setInlineStatus("Set logged");
      setTimeout(() => setInlineStatus(""), 1500);
    } catch (error) {
      Alert.alert("Error", "Failed to log set");
    }
  };

  const getTotalSets = () => workoutExercises.reduce((sum, we) => sum + we.sets.length, 0);

  // Edit set handlers
  const openEditSet = (set: Set, workoutExercise: WorkoutExerciseWithSets) => {
    setEditingSet(set);
    setEditingWorkoutExercise(workoutExercise);
    setEditWeight(String(set.weight_lb));
    setEditReps(String(set.reps));
    setEditRpe(set.rpe !== null ? String(set.rpe) : "");
    setEditSetModalVisible(true);
  };

  const closeEditSet = () => {
    setEditSetModalVisible(false);
    setEditingSet(null);
    setEditingWorkoutExercise(null);
  };

  const handleSaveEditSet = async () => {
    if (!editingSet || !editingWorkoutExercise) return;

    const weightNum = parseFloat(editWeight);
    const repsNum = parseInt(editReps, 10);
    const rpeNum = editRpe ? parseFloat(editRpe) : null;

    if (isNaN(weightNum) || weightNum < 0) {
      Alert.alert("Invalid Weight", "Please enter a valid weight");
      return;
    }
    if (isNaN(repsNum) || repsNum <= 0) {
      Alert.alert("Invalid Reps", "Please enter a valid number of reps");
      return;
    }
    if (rpeNum !== null && (rpeNum < 1 || rpeNum > 10)) {
      Alert.alert("Invalid RPE", "RPE must be between 1 and 10");
      return;
    }

    try {
      await updateSet(editingSet.id, {
        weightLb: weightNum,
        reps: repsNum,
        rpe: rpeNum,
      });

      // Update local state
      const updatedSets = editingWorkoutExercise.sets.map((s) =>
        s.id === editingSet.id
          ? { ...s, weight_lb: weightNum, reps: repsNum, rpe: rpeNum }
          : s
      );
      const updatedWorkoutExercise = { ...editingWorkoutExercise, sets: updatedSets };

      setWorkoutExercises((prev) =>
        prev.map((we) => (we.id === editingWorkoutExercise.id ? updatedWorkoutExercise : we))
      );

      if (currentWorkoutExercise?.id === editingWorkoutExercise.id) {
        setCurrentWorkoutExercise(updatedWorkoutExercise);
      }

      closeEditSet();
    } catch (error) {
      Alert.alert("Error", "Failed to update set");
    }
  };

  const handleDeleteEditSet = async () => {
    if (!editingSet || !editingWorkoutExercise) return;

    Alert.alert("Delete Set", "Are you sure you want to delete this set?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSet(editingSet.id);

            // Update local state - remove the set and re-index remaining sets
            const updatedSets = editingWorkoutExercise.sets
              .filter((s) => s.id !== editingSet.id)
              .map((s, idx) => ({ ...s, set_index: idx + 1 }));
            const updatedWorkoutExercise = { ...editingWorkoutExercise, sets: updatedSets };

            setWorkoutExercises((prev) =>
              prev.map((we) => (we.id === editingWorkoutExercise.id ? updatedWorkoutExercise : we))
            );

            if (currentWorkoutExercise?.id === editingWorkoutExercise.id) {
              setCurrentWorkoutExercise(updatedWorkoutExercise);
            }

            closeEditSet();
          } catch (error) {
            Alert.alert("Error", "Failed to delete set");
          }
        },
      },
    ]);
  };

  const handleRemoveExercise = (workoutExerciseId: string) => {
    const we = workoutExercises.find((w) => w.id === workoutExerciseId);
    if (!we) return;

    Alert.alert(
      "Remove Exercise",
      `Remove ${we.exercise.name} and its ${we.sets.length} set(s)?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await removeWorkoutExercise(workoutExerciseId);
              const updated = workoutExercises.filter((w) => w.id !== workoutExerciseId);
              setWorkoutExercises(updated);
              if (currentWorkoutExercise?.id === workoutExerciseId) {
                setCurrentWorkoutExercise(updated[0] ?? null);
              }
            } catch (error) {
              Alert.alert("Error", "Failed to remove exercise");
            }
          },
        },
      ]
    );
  };

  const promptSaveAsTemplate = async () => {
    // Check if we should prompt for template save
    // Prompt if: started empty, OR started from template but exercises differ
    const currentExerciseIds = workoutExercises.map((we) => we.exercise_id);
    
    if (startMode === 'template' && templateId) {
      const template = templates.find((t) => t.id === templateId);
      if (template) {
        const templateExerciseIds: string[] = JSON.parse(template.exercise_ids);
        const isSame = 
          templateExerciseIds.length === currentExerciseIds.length &&
          templateExerciseIds.every((id, i) => id === currentExerciseIds[i]);
        if (isSame) {
          // No changes from template, don't prompt
          router.back();
          return;
        }
      }
    }

    // Prompt to save as new template
    Alert.alert(
      "Save as Template?",
      "Would you like to save this workout as a new template for quick access next time?",
      [
        { 
          text: "No Thanks", 
          style: "cancel",
          onPress: () => router.back()
        },
        {
          text: "Save Template",
          onPress: () => {
            setPendingExerciseIds(currentExerciseIds);
            setTemplateName("");
            setSaveTemplateModalVisible(true);
          },
        },
      ]
    );
  };

  const handleSaveTemplate = async () => {
    if (templateName.trim()) {
      try {
        await createTemplate(templateName.trim(), pendingExerciseIds);
        setSaveTemplateModalVisible(false);
        router.back();
      } catch (error) {
        Alert.alert("Error", "Failed to save template");
      }
    }
  };

  const handleCancelSaveTemplate = () => {
    setSaveTemplateModalVisible(false);
    router.back();
  };

  const handleFinishAndPrompt = async () => {
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
              await promptSaveAsTemplate();
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
        <Stack.Screen options={{ title: "Start Workout" }} />
        <ScrollView contentContainerStyle={styles.startContainer}>
          <Text style={styles.startTitle}>Ready to train?</Text>
          <Text style={styles.startSubtitle}>Choose how to start</Text>

          {/* Repeat Last Workout */}
          {hasLastWorkout && (
            <TouchableOpacity
              style={[styles.startOptionButton, styles.startOptionPrimary]}
              onPress={() => handleStartWorkout('repeat')}
            >
              <Text style={styles.startOptionIcon}>R</Text>
              <View style={styles.startOptionContent}>
                <Text style={styles.startOptionTitle}>Repeat Last Workout</Text>
                <Text style={styles.startOptionDesc}>Same exercises as your last session</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Choose Template */}
          {templates.length > 0 && (
            <TouchableOpacity
              style={[styles.startOptionButton, styles.startOptionSecondary]}
              onPress={() => setTemplatePickerVisible(true)}
            >
              <Text style={styles.startOptionIcon}>T</Text>
              <View style={styles.startOptionContent}>
                <Text style={styles.startOptionTitle}>Choose Template</Text>
                <Text style={styles.startOptionDesc}>{templates.length} saved template{templates.length !== 1 ? 's' : ''}</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Start Empty */}
          <TouchableOpacity
            style={[styles.startOptionButton, styles.startOptionEmpty]}
            onPress={() => handleStartWorkout('empty')}
          >
            <Text style={styles.startOptionIcon}>+</Text>
            <View style={styles.startOptionContent}>
              <Text style={styles.startOptionTitle}>Start Empty</Text>
              <Text style={styles.startOptionDesc}>Add exercises as you go</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Template Picker Modal */}
        <Modal
          visible={templatePickerVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setTemplatePickerVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Template</Text>
              <TouchableOpacity onPress={() => setTemplatePickerVisible(false)}>
                <Text style={styles.modalClose}>Cancel</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent}>
              {templates.map((template) => {
                const exerciseIds: string[] = JSON.parse(template.exercise_ids);
                const exerciseNames = exerciseIds
                  .map((id) => allExercises.find((e) => e.id === id)?.name ?? "Unknown")
                  .slice(0, 3);
                const moreCount = exerciseIds.length - 3;

                return (
                  <TouchableOpacity
                    key={template.id}
                    style={styles.templateItem}
                    onPress={() => {
                      setTemplatePickerVisible(false);
                      handleStartWorkout('template', template.id);
                    }}
                  >
                    <Text style={styles.templateName}>{template.name}</Text>
                    <Text style={styles.templateExercises}>
                      {exerciseNames.join(", ")}
                      {moreCount > 0 ? ` +${moreCount} more` : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Modal>
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
              Exercises ({workoutExercises.length}) / Sets ({getTotalSets()})
            </Text>
            {workoutExercises.map((we) => (
              <View key={we.id} style={styles.exerciseGroup}>
                <View style={styles.exerciseHeaderRow}>
                  <TouchableOpacity
                    style={styles.exerciseHeader}
                    onPress={() => void selectWorkoutExercise(we)}
                  >
                    <Text style={styles.exerciseGroupName}>{we.exercise.name}</Text>
                    <Text style={styles.exerciseSetCount}>
                      {we.sets.length} set{we.sets.length !== 1 ? "s" : ""}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeExerciseButton}
                    onPress={() => handleRemoveExercise(we.id)}
                  >
                    <Text style={styles.removeExerciseText}>X</Text>
                  </TouchableOpacity>
                </View>
                {we.sets.map((set) => {
                  const rpeColor = getRPEColor(set.rpe ?? undefined);
                  return (
                    <TouchableOpacity
                      key={set.id}
                      style={[styles.setItem, { borderLeftColor: rpeColor }]}
                      onPress={() => openEditSet(set, we)}
                    >
                      <Text style={styles.setText}>
                        Set {set.set_index}:{" "}
                        <Text style={styles.setTextBold}>
                          {set.reps} x {set.weight_lb} lb
                        </Text>
                      </Text>
                      {set.rpe && (
                        <View style={[styles.rpeBadge, { backgroundColor: rpeColor }]}>
                          <Text style={styles.rpeBadgeText}>RPE {set.rpe}</Text>
                        </View>
                      )}
                      <Text style={styles.editHint}>Edit</Text>
                    </TouchableOpacity>
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
          <TouchableOpacity style={styles.finishButton} onPress={handleFinishAndPrompt}>
            <Text style={styles.finishButtonText}>Finish Workout</Text>
          </TouchableOpacity>
        </View>
      )}

      <ExercisePicker
        visible={pickerVisible}
        onSelect={handleSelectExercise}
        onClose={() => setPickerVisible(false)}
      />

      {/* Save as Template Modal */}
      <Modal
        visible={saveTemplateModalVisible}
        animationType="fade"
        transparent
        onRequestClose={handleCancelSaveTemplate}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.saveTemplateModal}>
            <Text style={styles.saveTemplateTitle}>Template Name</Text>
            <TextInput
              style={styles.saveTemplateInput}
              value={templateName}
              onChangeText={setTemplateName}
              placeholder="e.g., Push Day, Upper Body..."
              autoFocus
            />
            <View style={styles.saveTemplateButtons}>
              <TouchableOpacity
                style={styles.saveTemplateCancelButton}
                onPress={handleCancelSaveTemplate}
              >
                <Text style={styles.saveTemplateCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveTemplateSaveButton,
                  !templateName.trim() && styles.saveTemplateSaveButtonDisabled,
                ]}
                onPress={handleSaveTemplate}
                disabled={!templateName.trim()}
              >
                <Text style={styles.saveTemplateSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Set Modal */}
      <Modal
        visible={editSetModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeEditSet}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.editSetModal}>
            <Text style={styles.editSetTitle}>Edit Set</Text>

            <View style={styles.editSetFormRow}>
              <Text style={styles.editSetLabel}>Weight (lb)</Text>
              <TextInput
                style={styles.editSetInput}
                value={editWeight}
                onChangeText={setEditWeight}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>

            <View style={styles.editSetFormRow}>
              <Text style={styles.editSetLabel}>Reps</Text>
              <TextInput
                style={styles.editSetInput}
                value={editReps}
                onChangeText={setEditReps}
                keyboardType="number-pad"
                placeholder="0"
              />
            </View>

            <View style={styles.editSetFormRow}>
              <Text style={styles.editSetLabel}>RPE (optional)</Text>
              <TextInput
                style={styles.editSetInput}
                value={editRpe}
                onChangeText={setEditRpe}
                keyboardType="decimal-pad"
                placeholder="optional"
              />
            </View>

            <TouchableOpacity
              style={styles.editSetDeleteButton}
              onPress={handleDeleteEditSet}
            >
              <Text style={styles.editSetDeleteText}>Delete Set</Text>
            </TouchableOpacity>

            <View style={styles.editSetButtons}>
              <TouchableOpacity style={styles.editSetCancelButton} onPress={closeEditSet}>
                <Text style={styles.editSetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editSetSaveButton} onPress={handleSaveEditSet}>
                <Text style={styles.editSetSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  startContainer: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    paddingTop: 60,
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
  startOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  startOptionPrimary: {
    backgroundColor: "#007AFF",
  },
  startOptionSecondary: {
    backgroundColor: "#5856D6",
  },
  startOptionEmpty: {
    backgroundColor: "#34C759",
  },
  startOptionIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  startOptionContent: {
    flex: 1,
  },
  startOptionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "white",
    marginBottom: 2,
  },
  startOptionDesc: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  modalClose: {
    fontSize: 16,
    color: "#007AFF",
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  templateItem: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 10,
    marginBottom: 10,
  },
  templateName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  templateExercises: {
    fontSize: 14,
    color: "#666",
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
  exerciseHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  exerciseHeader: {
    flex: 1,
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
  removeExerciseButton: {
    padding: 8,
    marginLeft: 8,
  },
  removeExerciseText: {
    fontSize: 18,
    color: "#FF3B30",
    fontWeight: "bold",
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  saveTemplateModal: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    width: "100%",
    maxWidth: 320,
  },
  saveTemplateTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
    textAlign: "center",
  },
  saveTemplateInput: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 16,
  },
  saveTemplateButtons: {
    flexDirection: "row",
    gap: 10,
  },
  saveTemplateCancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
    alignItems: "center",
  },
  saveTemplateCancelText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
  },
  saveTemplateSaveButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  saveTemplateSaveButtonDisabled: {
    backgroundColor: "#a0c4ff",
  },
  saveTemplateSaveText: {
    fontSize: 16,
    color: "white",
    fontWeight: "600",
  },
  editHint: {
    fontSize: 14,
    color: "#999",
    marginLeft: 8,
  },
  editSetModal: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  editSetTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 20,
    textAlign: "center",
  },
  editSetFormRow: {
    marginBottom: 16,
  },
  editSetLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 6,
  },
  editSetInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  editSetDeleteButton: {
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FF3B30",
    marginBottom: 12,
  },
  editSetDeleteText: {
    fontSize: 14,
    color: "#FF3B30",
    fontWeight: "600",
  },
  editSetButtons: {
    flexDirection: "row",
    gap: 12,
  },
  editSetCancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  editSetCancelText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  editSetSaveButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#007AFF",
  },
  editSetSaveText: {
    fontSize: 14,
    color: "white",
    fontWeight: "600",
  },
});
