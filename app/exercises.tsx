import {
    addExercise,
    deleteExercise,
    getExercises,
    updateExercise
} from "@/lib/repo";
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from "@/lib/types";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    FlatList,
    Keyboard,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";

export default function ExercisesScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<MuscleGroup | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [formName, setFormName] = useState("");
  const [formMuscleGroup, setFormMuscleGroup] = useState<MuscleGroup>("chest");
  const [formRepRangeMin, setFormRepRangeMin] = useState("8");
  const [formRepRangeMax, setFormRepRangeMax] = useState("12");

  useEffect(() => {
    loadExercises();
  }, []);

  useEffect(() => {
    filterExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, searchQuery, selectedMuscleGroup]);

  const normalizeName = (name: string) => name.trim().replace(/\s+/g, " ");

  const loadExercises = async () => {
    const data = await getExercises();
    setExercises(data);
  };

  const filterExercises = () => {
    let filtered = [...exercises];

    if (searchQuery) {
      filtered = filtered.filter((ex) =>
        ex.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedMuscleGroup) {
      filtered = filtered.filter((ex) => ex.muscle_group === selectedMuscleGroup);
    }

    // Group by muscle group
    const grouped = filtered.sort((a, b) => {
      if (a.muscle_group !== b.muscle_group) {
        return a.muscle_group.localeCompare(b.muscle_group);
      }
      return a.name.localeCompare(b.name);
    });

    setFilteredExercises(grouped);
  };

  const handleAddEdit = async () => {
    const normalizedName = normalizeName(formName);

    if (!normalizedName) {
      Alert.alert("Error", "Exercise name is required");
      return;
    }

    const repMin = parseInt(formRepRangeMin, 10);
    const repMax = parseInt(formRepRangeMax, 10);

    if (isNaN(repMin) || isNaN(repMax) || repMin < 1 || repMax < 1) {
      Alert.alert("Error", "Rep range values must be positive numbers");
      return;
    }

    if (repMin > repMax) {
      Alert.alert("Error", "Minimum reps cannot be greater than maximum reps");
      return;
    }

    if (repMax > 30) {
      Alert.alert("Error", "Maximum reps should be 30 or less");
      return;
    }

    const nameExists = exercises.some((ex) => {
      const existingName = normalizeName(ex.name).toLowerCase();
      const candidateName = normalizedName.toLowerCase();
      return existingName === candidateName && ex.id !== editingExercise?.id;
    });

    if (nameExists) {
      Alert.alert("Error", "An exercise with that name already exists");
      return;
    }

    try {
      if (editingExercise) {
        await updateExercise(editingExercise.id, {
          name: normalizedName,
          muscleGroup: formMuscleGroup,
          repRangeMin: repMin,
          repRangeMax: repMax,
        });
      } else {
        await addExercise(normalizedName, formMuscleGroup, repMin, repMax);
      }
      
      setModalVisible(false);
      setFormName("");
      setFormMuscleGroup("chest");
      setFormRepRangeMin("8");
      setFormRepRangeMax("12");
      setEditingExercise(null);
      loadExercises();
    } catch {
      Alert.alert("Error", "Failed to save exercise");
    }
  };

  const handleEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setFormName(exercise.name);
    setFormMuscleGroup(exercise.muscle_group);
    setFormRepRangeMin(String(exercise.rep_range_min));
    setFormRepRangeMax(String(exercise.rep_range_max));
    setModalVisible(true);
  };

  const handleDelete = (exercise: Exercise) => {
    Alert.alert(
      "Delete Exercise",
      `Are you sure you want to delete "${exercise.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteExercise(exercise.id);
              loadExercises();
            } catch (error: any) {
              Alert.alert("Error", error.message || "Failed to delete exercise");
            }
          },
        },
      ]
    );
  };

  const openAddModal = () => {
    setEditingExercise(null);
    setFormName("");
    setFormMuscleGroup("chest");
    setFormRepRangeMin("8");
    setFormRepRangeMax("12");
    setModalVisible(true);
  };

  const renderExerciseItem = ({ item }: { item: Exercise }) => (
    <View style={styles.exerciseItem}>
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName}>{item.name}</Text>
        <View style={styles.tagContainer}>
          <View style={styles.muscleTag}>
            <Text style={styles.muscleTagText}>{item.muscle_group.replace('_', ' ')}</Text>
          </View>
          <View style={styles.repRangeTag}>
            <Text style={styles.repRangeTagText}>{item.rep_range_min}-{item.rep_range_max} reps</Text>
          </View>
          {item.is_custom === 1 && (
            <View style={styles.customTag}>
              <Text style={styles.customTagText}>Custom</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => handleEdit(item)} style={styles.editButton}>
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        {item.is_custom === 1 && (
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteButton}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <Stack.Screen options={{ title: "Manage Exercises" }} />
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

      {/* Muscle Group Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[styles.filterChip, !selectedMuscleGroup && styles.filterChipActive]}
          onPress={() => setSelectedMuscleGroup(null)}
        >
          <Text style={[styles.filterChipText, !selectedMuscleGroup && styles.filterChipTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {MUSCLE_GROUPS.map((group) => (
          <TouchableOpacity
            key={group}
            style={[styles.filterChip, selectedMuscleGroup === group && styles.filterChipActive]}
            onPress={() => setSelectedMuscleGroup(group)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedMuscleGroup === group && styles.filterChipTextActive,
              ]}
            >
              {group.charAt(0).toUpperCase() + group.slice(1).replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Exercise List */}
      <FlatList
        data={filteredExercises}
        renderItem={renderExerciseItem}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No exercises found</Text>
          </View>
        }
      />

      {/* Add Button */}
      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingExercise ? "Edit Exercise" : "Add Exercise"}
            </Text>

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Exercise name"
              value={formName}
              onChangeText={setFormName}
            />

            <Text style={styles.label}>Muscle Group</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.muscleGroupPicker}>
              {MUSCLE_GROUPS.map((group) => (
                <TouchableOpacity
                  key={group}
                  style={[
                    styles.muscleGroupOption,
                    formMuscleGroup === group && styles.muscleGroupOptionActive,
                  ]}
                  onPress={() => setFormMuscleGroup(group)}
                >
                  <Text
                    style={[
                      styles.muscleGroupOptionText,
                      formMuscleGroup === group && styles.muscleGroupOptionTextActive,
                    ]}
                  >
                    {group.charAt(0).toUpperCase() + group.slice(1).replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Rep Range (for progression)</Text>
            <View style={styles.repRangeRow}>
              <View style={styles.repRangeField}>
                <Text style={styles.repRangeLabel}>Min</Text>
                <TextInput
                  style={styles.repRangeInput}
                  keyboardType="numeric"
                  value={formRepRangeMin}
                  onChangeText={setFormRepRangeMin}
                  placeholder="8"
                  maxLength={2}
                />
              </View>
              <Text style={styles.repRangeDash}>-</Text>
              <View style={styles.repRangeField}>
                <Text style={styles.repRangeLabel}>Max</Text>
                <TextInput
                  style={styles.repRangeInput}
                  keyboardType="numeric"
                  value={formRepRangeMax}
                  onChangeText={setFormRepRangeMax}
                  placeholder="12"
                  maxLength={2}
                />
              </View>
              <Text style={styles.repRangeHint}>reps</Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleAddEdit}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>
                  {editingExercise ? "Update" : "Add"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  searchContainer: {
    padding: 15,
    backgroundColor: "white",
  },
  searchInput: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
  },
  filterContainer: {
    maxHeight: 50,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  filterContent: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: "#007AFF",
  },
  filterChipText: {
    fontSize: 14,
    color: "#666",
  },
  filterChipTextActive: {
    color: "white",
    fontWeight: "600",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 15,
  },
  exerciseItem: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },
  tagContainer: {
    flexDirection: "row",
    gap: 6,
  },
  muscleTag: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  muscleTagText: {
    fontSize: 12,
    color: "#1976D2",
  },
  repRangeTag: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  repRangeTagText: {
    fontSize: 12,
    color: "#388E3C",
  },
  customTag: {
    backgroundColor: "#FFF3E0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  customTagText: {
    fontSize: 12,
    color: "#F57C00",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "#007AFF",
  },
  editButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
  },
  deleteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
  },
  deleteButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fabText: {
    fontSize: 32,
    color: "white",
    fontWeight: "300",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    marginBottom: 20,
  },
  muscleGroupPicker: {
    marginBottom: 20,
  },
  muscleGroupOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    marginRight: 8,
  },
  muscleGroupOptionActive: {
    backgroundColor: "#007AFF",
  },
  muscleGroupOptionText: {
    fontSize: 14,
    color: "#666",
  },
  muscleGroupOptionTextActive: {
    color: "white",
    fontWeight: "600",
  },
  repRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 8,
  },
  repRangeField: {
    alignItems: "center",
  },
  repRangeLabel: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 4,
  },
  repRangeInput: {
    backgroundColor: "#f0f0f0",
    padding: 12,
    borderRadius: 8,
    fontSize: 18,
    fontWeight: "600",
    width: 60,
    textAlign: "center",
  },
  repRangeDash: {
    fontSize: 18,
    color: "#666",
    marginTop: 16,
  },
  repRangeHint: {
    fontSize: 14,
    color: "#666",
    marginTop: 16,
    marginLeft: 4,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  modalButtonPrimary: {
    backgroundColor: "#007AFF",
  },
  modalButtonText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "600",
  },
  modalButtonTextPrimary: {
    color: "white",
  },
});
