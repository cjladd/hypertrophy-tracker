// app/history.tsx
// History screen - View, edit, and delete past workouts (PRD A3D)
// Progression recomputation on edit/delete per prog_engine.md §10

import { getRPEColor } from "@/components/RPEPicker";
import {
    addSet,
    deleteSet,
    deleteWorkout,
    getExercises,
    getSetsForWorkoutExercise,
    getWorkoutExercises,
    listRecentWorkouts,
    recomputeProgressionState,
    updateSet,
    updateWorkoutNotes
} from "@/lib/repo";
import type { Exercise, Set, Workout, WorkoutExercise } from "@/lib/types";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
    Alert,
    Keyboard,
    Modal,
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

interface WorkoutWithDetails extends Workout {
  exercises: WorkoutExerciseWithSets[];
  exerciseCount: number;
  setCount: number;
  duration: number | null;
}

export default function HistoryScreen() {
  const [workouts, setWorkouts] = useState<WorkoutWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutWithDetails | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Edit state
  const [editingSet, setEditingSet] = useState<Set | null>(null);
  const [editingWorkoutExercise, setEditingWorkoutExercise] = useState<WorkoutExerciseWithSets | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [editReps, setEditReps] = useState("");
  const [editRpe, setEditRpe] = useState<string>("");
  const [editSetModalVisible, setEditSetModalVisible] = useState(false);
  const [isAddingSet, setIsAddingSet] = useState(false); // true = adding new, false = editing existing

  // Notes editing state
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");

  const buildWorkoutDetails = async (
    workout: Workout,
    allExercises: Exercise[]
  ): Promise<WorkoutWithDetails | null> => {

    const workoutExercises = await getWorkoutExercises(workout.id);
    let totalSets = 0;

    const exercisesWithSets: WorkoutExerciseWithSets[] = [];
    for (const we of workoutExercises) {
      const sets = await getSetsForWorkoutExercise(we.id);
      totalSets += sets.length;

      const exercise = allExercises.find((e) => e.id === we.exercise_id);
      if (exercise) {
        exercisesWithSets.push({
          ...we,
          exercise,
          sets,
        });
      }
    }

    if (!workout.ended_at && totalSets === 0) {
      await deleteWorkout(workout.id);
      return null;
    }

    const effectiveEnd = workout.ended_at ?? Date.now();
    const duration =
      workout.started_at
        ? Math.round((effectiveEnd - workout.started_at) / 60000)
        : null;

    return {
      ...workout,
      exercises: exercisesWithSets,
      exerciseCount: workoutExercises.length,
      setCount: totalSets,
      duration,
    };
  };

  const refreshSelectedWorkout = async () => {
    if (!selectedWorkout) return;

    const allExercises = await getExercises();
    const refreshedWorkout = await buildWorkoutDetails(selectedWorkout, allExercises);
    if (!refreshedWorkout) return;

    setSelectedWorkout(refreshedWorkout);
    setWorkouts((prev) =>
      prev.map((w) => (w.id === refreshedWorkout.id ? refreshedWorkout : w))
    );
  };

  const loadWorkouts = async () => {
    try {
      setLoading(true);
      const recentWorkouts = await listRecentWorkouts(100); // Get more workouts for history view
      const allExercises = await getExercises();

      const workoutsWithDetails: WorkoutWithDetails[] = [];

      for (const workout of recentWorkouts) {
        const details = await buildWorkoutDetails(workout, allExercises);
        if (details) {
          workoutsWithDetails.push(details);
        }
      }

      setWorkouts(workoutsWithDetails);
    } catch (err) {
      console.error("Failed to load workouts:", err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadWorkouts();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatShortDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatDuration = (minutes: number | null) => {
    if (minutes === null) return "-";
    if (minutes < 60) return `${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  };

  const openWorkoutDetail = (workout: WorkoutWithDetails) => {
    setSelectedWorkout(workout);
    setNotesText(workout.notes ?? "");
    setDetailModalVisible(true);
  };

  const closeWorkoutDetail = () => {
    setDetailModalVisible(false);
    setSelectedWorkout(null);
    setEditingNotes(false);
  };

  const handleDeleteWorkout = (workout: WorkoutWithDetails) => {
    Alert.alert(
      "Delete Workout",
      `Are you sure you want to delete this workout from ${formatShortDate(workout.started_at)}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Capture exercise IDs before deletion for recomputation
              const exerciseIds = workout.exercises.map(e => e.exercise_id);
              
              await deleteWorkout(workout.id);
              
              // Recompute progression state for all affected exercises (prog_engine.md §10)
              for (const exerciseId of exerciseIds) {
                await recomputeProgressionState(exerciseId);
              }
              
              closeWorkoutDetail();
              loadWorkouts();
            } catch {
              Alert.alert("Error", "Failed to delete workout");
            }
          },
        },
      ]
    );
  };

  const openEditSet = (set: Set) => {
    if (!selectedWorkout) return;
    const workoutExercise =
      selectedWorkout.exercises.find((we) => we.id === set.workout_exercise_id) ?? null;
    setEditingSet(set);
    setEditingWorkoutExercise(workoutExercise);
    setEditWeight(String(set.weight_lb));
    setEditReps(String(set.reps));
    setEditRpe(set.rpe !== null ? String(set.rpe) : "");
    setIsAddingSet(false);
    setEditSetModalVisible(true);
  };

  const openAddSet = (workoutExercise: WorkoutExerciseWithSets) => {
    setEditingSet(null);
    setEditingWorkoutExercise(workoutExercise);
    // Pre-fill with last set values if available, or defaults
    const lastSet = workoutExercise.sets[workoutExercise.sets.length - 1];
    setEditWeight(lastSet ? String(lastSet.weight_lb) : "");
    setEditReps(lastSet ? String(lastSet.reps) : "");
    setEditRpe(lastSet?.rpe !== null && lastSet?.rpe !== undefined ? String(lastSet.rpe) : "");
    setIsAddingSet(true);
    setEditSetModalVisible(true);
  };

  const closeEditSet = () => {
    setEditSetModalVisible(false);
    setEditingSet(null);
    setEditingWorkoutExercise(null);
    setIsAddingSet(false);
  };

  const handleAddNewSet = async () => {
    if (!editingWorkoutExercise || !selectedWorkout) return;

    const weightNum = parseFloat(editWeight);
    const repsNum = parseInt(editReps, 10);
    const rpeNum = editRpe ? parseFloat(editRpe) : undefined;

    if (isNaN(weightNum) || weightNum < 0) {
      Alert.alert("Invalid Weight", "Please enter a valid weight");
      return;
    }
    if (isNaN(repsNum) || repsNum <= 0) {
      Alert.alert("Invalid Reps", "Please enter a valid number of reps");
      return;
    }
    if (rpeNum !== undefined && (rpeNum < 1 || rpeNum > 10)) {
      Alert.alert("Invalid RPE", "RPE must be between 1 and 10");
      return;
    }

    try {
      // Calculate the next set index
      const nextSetIndex = editingWorkoutExercise.sets.length + 1;

      await addSet({
        workoutExerciseId: editingWorkoutExercise.id,
        setIndex: nextSetIndex,
        weightLb: weightNum,
        reps: repsNum,
        rpe: rpeNum,
      });

      // Recompute progression state for this exercise (prog_engine.md §10)
      await recomputeProgressionState(editingWorkoutExercise.exercise_id);

      closeEditSet();
      await refreshSelectedWorkout();
    } catch {
      Alert.alert("Error", "Failed to add set");
    }
  };

  const handleSaveSet = async () => {
    if (!editingSet || !selectedWorkout) return;

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

      // Recompute progression state for this exercise (prog_engine.md §10)
      const exerciseId = editingWorkoutExercise?.exercise_id;
      if (exerciseId) {
        await recomputeProgressionState(exerciseId);
      }

      closeEditSet();
      await refreshSelectedWorkout();
    } catch {
      Alert.alert("Error", "Failed to update set");
    }
  };

  const handleDeleteSet = async () => {
    if (!editingSet || !selectedWorkout) return;

    Alert.alert("Delete Set", "Are you sure you want to delete this set?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            // Capture exercise ID before deletion
            const exerciseId = editingWorkoutExercise?.exercise_id;
            
            await deleteSet(editingSet.id);
            
            // Recompute progression state for this exercise (prog_engine.md §10)
            if (exerciseId) {
              await recomputeProgressionState(exerciseId);
            }

            closeEditSet();
            await refreshSelectedWorkout();
          } catch {
            Alert.alert("Error", "Failed to delete set");
          }
        },
      },
    ]);
  };

  const handleSaveNotes = async () => {
    if (!selectedWorkout) return;

    try {
      await updateWorkoutNotes(selectedWorkout.id, notesText);
      setSelectedWorkout({ ...selectedWorkout, notes: notesText || null });
      setWorkouts((prev) =>
        prev.map((w) =>
          w.id === selectedWorkout.id ? { ...w, notes: notesText || null } : w
        )
      );
      setEditingNotes(false);
    } catch {
      Alert.alert("Error", "Failed to update notes");
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading workouts...</Text>
      </View>
    );
  }

  return (
    <View style={{flex: 1}}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {workouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No workouts yet</Text>
            <Text style={styles.emptySubtext}>
              Complete your first workout to see it here!
            </Text>
          </View>
        ) : (
          workouts.map((workout) => (
            <TouchableOpacity
              key={workout.id}
              style={styles.workoutCard}
              onPress={() => openWorkoutDetail(workout)}
            >
              <View style={styles.workoutHeader}>
                <Text style={styles.workoutDate}>
                  {formatShortDate(workout.started_at)}
                </Text>
                <Text style={styles.workoutDuration}>
                  {formatDuration(workout.duration)}
                </Text>
              </View>
              <View style={styles.workoutStats}>
                <Text style={styles.statText}>
                  {workout.exerciseCount} exercise{workout.exerciseCount !== 1 ? "s" : ""}
                </Text>
                  <Text style={styles.statDivider}>/</Text>
                <Text style={styles.statText}>
                  {workout.setCount} set{workout.setCount !== 1 ? "s" : ""}
                </Text>
              </View>
              {workout.notes && (
                <Text style={styles.notesPreview} numberOfLines={1}>
                  {workout.notes}
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Workout Detail Modal */}
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeWorkoutDetail}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeWorkoutDetail}>
              <Text style={styles.closeButton}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Workout Details</Text>
            <TouchableOpacity onPress={() => selectedWorkout && handleDeleteWorkout(selectedWorkout)}>
              <Text style={styles.deleteButton}>Delete</Text>
            </TouchableOpacity>
          </View>

          {selectedWorkout && (
            <ScrollView style={styles.modalContent}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailDate}>
                  {formatDate(selectedWorkout.started_at)}
                </Text>
                <Text style={styles.detailDuration}>
                  Duration: {formatDuration(selectedWorkout.duration)}
                </Text>
              </View>

              {/* Notes Section */}
              <View style={styles.notesSection}>
                <View style={styles.notesSectionHeader}>
                  <Text style={styles.sectionTitle}>Notes</Text>
                  {!editingNotes && (
                    <TouchableOpacity onPress={() => setEditingNotes(true)}>
                      <Text style={styles.editLink}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {editingNotes ? (
                  <View style={styles.notesEditContainer}>
                    <TextInput
                      style={styles.notesInput}
                      value={notesText}
                      onChangeText={setNotesText}
                      placeholder="Add workout notes..."
                      multiline
                      numberOfLines={3}
                    />
                    <View style={styles.notesEditButtons}>
                      <TouchableOpacity
                        style={styles.notesCancelButton}
                        onPress={() => {
                          setNotesText(selectedWorkout.notes ?? "");
                          setEditingNotes(false);
                        }}
                      >
                        <Text style={styles.notesCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.notesSaveButton}
                        onPress={handleSaveNotes}
                      >
                        <Text style={styles.notesSaveText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.notesContent}>
                    {selectedWorkout.notes || "No notes"}
                  </Text>
                )}
              </View>

              {/* Exercises and Sets */}
              <View style={styles.exercisesSection}>
                <Text style={styles.sectionTitle}>Exercises</Text>
                {selectedWorkout.exercises.map((we) => (
                  <View key={we.id} style={styles.exerciseCard}>
                    <Text style={styles.exerciseName}>{we.exercise.name}</Text>
                    <Text style={styles.muscleGroup}>
                      {we.exercise.muscle_group.replace("_", " ")}
                    </Text>
                    <View style={styles.setsContainer}>
                      {we.sets.length === 0 ? (
                        <Text style={styles.noSetsText}>No sets logged</Text>
                      ) : (
                        we.sets.map((set, idx) => (
                          <TouchableOpacity
                            key={set.id}
                            style={styles.setRow}
                            onPress={() => openEditSet(set)}
                          >
                            <Text style={styles.setNumber}>Set {idx + 1}</Text>
                            <Text style={styles.setDetails}>
                              {set.weight_lb} lb x {set.reps} reps
                            </Text>
                            {set.rpe !== null && (
                              <View
                                style={[
                                  styles.rpeBadge,
                                  { backgroundColor: getRPEColor(set.rpe) },
                                ]}
                              >
                                <Text style={styles.rpeText}>RPE {set.rpe}</Text>
                              </View>
                            )}
                            <Text style={styles.editHint}>Tap to edit</Text>
                          </TouchableOpacity>
                        ))
                      )}
                      <TouchableOpacity
                        style={styles.addSetButton}
                        onPress={() => openAddSet(we)}
                      >
                        <Text style={styles.addSetButtonText}>+ Add Set</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Edit/Add Set Modal */}
      <Modal
        visible={editSetModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeEditSet}
      >
        <View style={styles.editModalOverlay}>
          <View style={styles.editModalContent}>
            <Text style={styles.editModalTitle}>
              {isAddingSet ? "Add Set" : "Edit Set"}
            </Text>
            {isAddingSet && editingWorkoutExercise && (
              <Text style={styles.editModalSubtitle}>
                {editingWorkoutExercise.exercise.name} - Set {editingWorkoutExercise.sets.length + 1}
              </Text>
            )}

            <View style={styles.editFormRow}>
              <Text style={styles.editLabel}>Weight (lb)</Text>
              <TextInput
                style={styles.editInput}
                value={editWeight}
                onChangeText={setEditWeight}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </View>

            <View style={styles.editFormRow}>
              <Text style={styles.editLabel}>Reps</Text>
              <TextInput
                style={styles.editInput}
                value={editReps}
                onChangeText={setEditReps}
                keyboardType="number-pad"
                placeholder="0"
              />
            </View>

            <View style={styles.editFormRow}>
              <Text style={styles.editLabel}>RPE (optional)</Text>
              <TextInput
                style={styles.editInput}
                value={editRpe}
                onChangeText={setEditRpe}
                keyboardType="decimal-pad"
                placeholder="optional"
              />
            </View>

            {!isAddingSet && (
              <View style={styles.editModalButtons}>
                <TouchableOpacity
                  style={styles.editDeleteButton}
                  onPress={handleDeleteSet}
                >
                  <Text style={styles.editDeleteText}>Delete Set</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.editModalButtons}>
              <TouchableOpacity style={styles.editCancelButton} onPress={closeEditSet}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.editSaveButton} 
                onPress={isAddingSet ? handleAddNewSet : handleSaveSet}
              >
                <Text style={styles.editSaveText}>{isAddingSet ? "Add" : "Save"}</Text>
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
  content: {
    padding: 16,
  },
  loadingText: {
    textAlign: "center",
    marginTop: 50,
    fontSize: 16,
    color: "#666",
  },
  emptyState: {
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  workoutCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  workoutHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  workoutDate: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  workoutDuration: {
    fontSize: 14,
    color: "#666",
  },
  workoutStats: {
    flexDirection: "row",
    alignItems: "center",
  },
  statText: {
    fontSize: 14,
    color: "#666",
  },
  statDivider: {
    marginHorizontal: 8,
    color: "#ccc",
  },
  notesPreview: {
    marginTop: 8,
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
  },

  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  closeButton: {
    fontSize: 16,
    color: "#007AFF",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  deleteButton: {
    fontSize: 16,
    color: "#FF3B30",
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  detailHeader: {
    marginBottom: 20,
  },
  detailDate: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  detailDuration: {
    fontSize: 14,
    color: "#666",
  },

  // Notes section
  notesSection: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  notesSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  editLink: {
    fontSize: 14,
    color: "#007AFF",
  },
  notesContent: {
    fontSize: 14,
    color: "#666",
    lineHeight: 20,
  },
  notesEditContainer: {
    gap: 12,
  },
  notesInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  notesEditButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  notesCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  notesCancelText: {
    fontSize: 14,
    color: "#666",
  },
  notesSaveButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  notesSaveText: {
    fontSize: 14,
    color: "white",
    fontWeight: "600",
  },

  // Exercises section
  exercisesSection: {
    marginBottom: 20,
  },
  exerciseCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  muscleGroup: {
    fontSize: 13,
    color: "#888",
    textTransform: "capitalize",
    marginBottom: 12,
  },
  setsContainer: {
    gap: 8,
  },
  noSetsText: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },
  addSetButton: {
    backgroundColor: "#e8f4fd",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#007AFF",
    borderStyle: "dashed",
  },
  addSetButtonText: {
    color: "#007AFF",
    fontWeight: "600",
    fontSize: 14,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f8f8",
    borderRadius: 8,
    padding: 12,
  },
  setNumber: {
    fontSize: 14,
    fontWeight: "500",
    color: "#666",
    width: 50,
  },
  setDetails: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  rpeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 8,
  },
  rpeText: {
    fontSize: 12,
    color: "white",
    fontWeight: "600",
  },
  editHint: {
    fontSize: 12,
    color: "#ccc",
  },

  // Edit Set Modal
  editModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  editModalContent: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
    textAlign: "center",
  },
  editModalSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    textAlign: "center",
  },
  editFormRow: {
    marginBottom: 16,
  },
  editLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 6,
  },
  editInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  editModalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 12,
  },
  editDeleteButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FF3B30",
  },
  editDeleteText: {
    fontSize: 14,
    color: "#FF3B30",
    fontWeight: "600",
  },
  editCancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  editCancelText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  editSaveButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#007AFF",
  },
  editSaveText: {
    fontSize: 14,
    color: "white",
    fontWeight: "600",
  },
});
