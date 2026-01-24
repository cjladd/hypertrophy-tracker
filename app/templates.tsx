// app/templates.tsx
// Templates screen for CRUD operations on workout templates
// Per PRD section 3E: Create, read, update, delete templates; edit exercise order

import DraggableExerciseList, { DraggableItem } from "@/components/DraggableExerciseList";
import ExercisePicker from "@/components/ExercisePicker";
import {
    createTemplate,
    deleteTemplate,
    getExercises,
    getTemplatesGroupedByRoutine,
    updateTemplate,
} from "@/lib/repo";
import type { Exercise, RoutineWithTemplates, Template } from "@/lib/types";
import { Stack, useFocusEffect } from "expo-router";
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
import { SafeAreaView } from "react-native-safe-area-context";

type ModalMode = "create" | "edit" | null;

export default function TemplatesScreen() {
  const [routineTemplates, setRoutineTemplates] = useState<RoutineWithTemplates[]>([]);
  const [standaloneTemplates, setStandaloneTemplates] = useState<Template[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);

  // Exercise picker state
  const [exercisePickerVisible, setExercisePickerVisible] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [groupedData, exercisesData] = await Promise.all([
        getTemplatesGroupedByRoutine(),
        getExercises(),
      ]);
      setRoutineTemplates(groupedData.routineTemplates);
      setStandaloneTemplates(groupedData.standaloneTemplates);
      setAllExercises(exercisesData);
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const getExerciseById = (id: string): Exercise | undefined => {
    return allExercises.find((e) => e.id === id);
  };

  const openCreateModal = () => {
    setModalMode("create");
    setEditingTemplate(null);
    setTemplateName("");
    setSelectedExerciseIds([]);
    setModalVisible(true);
  };

  const openEditModal = (template: Template) => {
    setModalMode("edit");
    setEditingTemplate(template);
    setTemplateName(template.name);
    setSelectedExerciseIds(JSON.parse(template.exercise_ids));
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setModalMode(null);
    setEditingTemplate(null);
    setTemplateName("");
    setSelectedExerciseIds([]);
  };

  const handleSave = async () => {
    const name = templateName.trim();
    if (!name) {
      Alert.alert("Error", "Please enter a template name");
      return;
    }

    if (selectedExerciseIds.length === 0) {
      Alert.alert("Error", "Please add at least one exercise");
      return;
    }

    try {
      if (modalMode === "create") {
        await createTemplate(name, selectedExerciseIds);
      } else if (modalMode === "edit" && editingTemplate) {
        await updateTemplate(editingTemplate.id, {
          name,
          exerciseIds: selectedExerciseIds,
        });
      }
      closeModal();
      await loadData();
    } catch {
      Alert.alert("Error", "Failed to save template. Name may already exist.");
    }
  };

  const handleDelete = (template: Template) => {
    Alert.alert(
      "Delete Template",
      `Are you sure you want to delete "${template.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteTemplate(template.id);
              await loadData();
            } catch {
              Alert.alert("Error", "Failed to delete template");
            }
          },
        },
      ]
    );
  };

  const handleAddExercise = (exercise: Exercise) => {
    if (!selectedExerciseIds.includes(exercise.id)) {
      setSelectedExerciseIds([...selectedExerciseIds, exercise.id]);
    }
    setExercisePickerVisible(false);
  };

  const handleRemoveExercise = (exerciseId: string) => {
    setSelectedExerciseIds(selectedExerciseIds.filter((id) => id !== exerciseId));
  };

  const handleMoveExercise = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    if (toIndex < 0 || toIndex >= selectedExerciseIds.length) return;

    const newOrder = [...selectedExerciseIds];
    const [movedItem] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, movedItem);
    setSelectedExerciseIds(newOrder);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <View style={styles.container}>
          <Stack.Screen options={{ title: "Templates" }} />
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const hasTemplates = routineTemplates.some((r) => r.days.some((d) => d.template)) || standaloneTemplates.length > 0;

  const renderTemplateCard = (template: Template) => {
    const exerciseIds: string[] = JSON.parse(template.exercise_ids);
    const exercises = exerciseIds
      .map((id) => getExerciseById(id))
      .filter(Boolean) as Exercise[];

    return (
      <View key={template.id} style={styles.templateCard}>
        <View style={styles.templateHeader}>
          <Text style={styles.templateName}>{template.name}</Text>
          <Text style={styles.exerciseCount}>
            {exercises.length} exercise{exercises.length !== 1 ? "s" : ""}
          </Text>
        </View>

        <View style={styles.exerciseList}>
          {exercises.slice(0, 5).map((exercise, index) => (
            <Text key={exercise.id} style={styles.exerciseItem}>
              {index + 1}. {exercise.name}
            </Text>
          ))}
          {exercises.length > 5 && (
            <Text style={styles.moreExercises}>
              +{exercises.length - 5} more
            </Text>
          )}
        </View>

        <View style={styles.templateActions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => openEditModal(template)}
          >
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(template)}
          >
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Templates" }} />

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
        {!hasTemplates ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No Templates Yet</Text>
            <Text style={styles.emptySubtitle}>
              Create templates to quickly start workouts with your favorite exercise
              combinations.
            </Text>
          </View>
        ) : (
          <>
            {/* Routine-linked templates */}
            {routineTemplates.map((routineGroup) => {
              const daysWithTemplates = routineGroup.days.filter((d) => d.template);
              if (daysWithTemplates.length === 0) return null;

              return (
                <View key={routineGroup.routine.id} style={styles.routineSection}>
                  <Text style={styles.routineSectionTitle}>{routineGroup.routine.name}</Text>
                  {daysWithTemplates.map((day) => {
                    if (!day.template) return null;
                    return renderTemplateCard(day.template);
                  })}
                </View>
              );
            })}

            {/* Standalone templates */}
            {standaloneTemplates.length > 0 && (
              <View style={styles.routineSection}>
                <Text style={styles.routineSectionTitle}>Other Templates</Text>
                {standaloneTemplates.map((template) => renderTemplateCard(template))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Create Button */}
      <TouchableOpacity style={styles.createButton} onPress={openCreateModal}>
        <Text style={styles.createButtonText}>+ New Template</Text>
      </TouchableOpacity>

      {/* Create/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer} edges={["top"]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {modalMode === "create" ? "New Template" : "Edit Template"}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.modalSave}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Template Name */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Template Name</Text>
              <TextInput
                style={styles.textInput}
                value={templateName}
                onChangeText={setTemplateName}
                placeholder="e.g., Push Day, Leg Day"
                placeholderTextColor="#999"
              />
            </View>

            {/* Exercises */}
            <View style={styles.formGroup}>
              <View style={styles.exercisesHeader}>
                <Text style={styles.formLabel}>
                  Exercises ({selectedExerciseIds.length})
                </Text>
                <TouchableOpacity
                  style={styles.addExerciseButton}
                  onPress={() => setExercisePickerVisible(true)}
                >
                  <Text style={styles.addExerciseText}>+ Add</Text>
                </TouchableOpacity>
              </View>

              {selectedExerciseIds.length === 0 ? (
                <Text style={styles.noExercisesText}>
                  No exercises added yet. Tap "+ Add" to add exercises.
                </Text>
              ) : (
                <DraggableExerciseList
                  items={selectedExerciseIds
                    .map((exerciseId): DraggableItem | null => {
                      const exercise = getExerciseById(exerciseId);
                      if (!exercise) return null;
                      return {
                        id: exerciseId,
                        displayName: exercise.name,
                        subtitle: exercise.muscle_group.replace("_", " "),
                        onRemove: () => handleRemoveExercise(exerciseId),
                      };
                    })
                    .filter((item): item is DraggableItem => item !== null)}
                  onReorder={handleMoveExercise}
                />
              )}
            </View>
          </ScrollView>
        </SafeAreaView>

        {/* Exercise Picker Modal */}
        <ExercisePicker
          visible={exercisePickerVisible}
          onClose={() => setExercisePickerVisible(false)}
          onSelect={handleAddExercise}
        />
      </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  routineSection: {
    marginBottom: 24,
  },
  routineSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  templateCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  templateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  templateName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  exerciseCount: {
    fontSize: 14,
    color: "#666",
  },
  exerciseList: {
    marginBottom: 12,
  },
  exerciseItem: {
    fontSize: 14,
    color: "#555",
    marginBottom: 4,
  },
  moreExercises: {
    fontSize: 14,
    color: "#888",
    fontStyle: "italic",
  },
  templateActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 12,
  },
  editButton: {
    flex: 1,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingVertical: 10,
    marginRight: 8,
    alignItems: "center",
  },
  editButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#FF3B30",
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#FF3B30",
    fontWeight: "600",
    fontSize: 14,
  },
  createButton: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  createButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
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
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalCancel: {
    fontSize: 16,
    color: "#FF3B30",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  modalSave: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "600",
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  formGroup: {
    marginBottom: 24,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  exercisesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  addExerciseButton: {
    backgroundColor: "#007AFF",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  addExerciseText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  noExercisesText: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  selectedExerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  reorderButtons: {
    flexDirection: "column",
    marginRight: 12,
  },
  reorderButton: {
    width: 28,
    height: 28,
    backgroundColor: "#f0f0f0",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
  reorderButtonDisabled: {
    opacity: 0.3,
  },
  reorderButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  selectedExerciseInfo: {
    flex: 1,
  },
  selectedExerciseName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  selectedExerciseMuscle: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
    textTransform: "capitalize",
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFE5E5",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  removeButtonText: {
    color: "#FF3B30",
    fontSize: 16,
    fontWeight: "600",
  },
  dragHint: {
    fontSize: 12,
    color: "#999",
    marginBottom: 12,
    textAlign: "center",
    fontStyle: "italic",
  },
  orderNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  orderNumberText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  exerciseActionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
