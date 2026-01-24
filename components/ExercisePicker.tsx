// components/ExercisePicker.tsx
import { getExercises } from "@/lib/repo";
import { MUSCLE_GROUPS, type Exercise, type MuscleGroup } from "@/lib/types";
import { useEffect, useState } from "react";
import {
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from "react-native-safe-area-context";

const FILTER_OPTIONS: (MuscleGroup | "all")[] = ["all", ...MUSCLE_GROUPS];

interface ExercisePickerProps {
  visible: boolean;
  onSelect: (exercise: Exercise) => void;
  onClose: () => void;
}

export default function ExercisePicker({ visible, onSelect, onClose }: ExercisePickerProps) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<MuscleGroup | "all">("all");

  useEffect(() => {
    if (visible) {
      loadExercises();
    }
  }, [visible]);

  useEffect(() => {
    filterExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, searchQuery, selectedMuscleGroup]);

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

    if (selectedMuscleGroup !== "all") {
      filtered = filtered.filter((ex) => ex.muscle_group === selectedMuscleGroup);
    }

    // Group by muscle group for better organization
    const grouped = filtered.sort((a, b) => {
      if (a.muscle_group !== b.muscle_group) {
        return a.muscle_group.localeCompare(b.muscle_group);
      }
      return a.name.localeCompare(b.name);
    });

    setFilteredExercises(grouped);
  };

  const handleSelect = (exercise: Exercise) => {
    onSelect(exercise);
    setSearchQuery("");
    setSelectedMuscleGroup("all");
  };

  const renderExerciseItem = ({ item }: { item: Exercise }) => (
    <TouchableOpacity style={styles.exerciseItem} onPress={() => handleSelect(item)}>
      <View style={styles.exerciseInfo}>
        <Text style={styles.exerciseName}>{item.name}</Text>
        <View style={styles.muscleTag}>
          <Text style={styles.muscleTagText}>{item.muscle_group}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSectionHeader = (muscleGroup: string) => {
    const firstItemIndex = filteredExercises.findIndex(
      (ex) => ex.muscle_group === muscleGroup
    );
    if (firstItemIndex === -1) return null;

    const isFirst =
      firstItemIndex === 0 ||
      filteredExercises[firstItemIndex - 1].muscle_group !== muscleGroup;

    if (!isFirst) return null;

    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>
          {muscleGroup.charAt(0).toUpperCase() + muscleGroup.slice(1)}
        </Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={styles.container} edges={["top"]}>
          <View style={styles.header}>
            <Text style={styles.title}>Select Exercise</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </TouchableOpacity>
          </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
        </View>

        {/* Muscle Group Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterContainer}
          contentContainerStyle={styles.filterContent}
        >
          {FILTER_OPTIONS.map((group) => (
            <TouchableOpacity
              key={group}
              style={[
                styles.filterChip,
                selectedMuscleGroup === group && styles.filterChipActive,
              ]}
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
            renderItem={({ item, index }) => (
              <View>
                {renderSectionHeader(item.muscle_group)}
                {renderExerciseItem({ item })}
              </View>
            )}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No exercises found</Text>
                <Text style={styles.emptySubtext}>
                  Try adjusting your search or filters
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: "#666",
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
  sectionHeader: {
    paddingVertical: 8,
    marginBottom: 5,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#007AFF",
    textTransform: "uppercase",
  },
  exerciseItem: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  exerciseInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    flex: 1,
  },
  muscleTag: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  muscleTagText: {
    fontSize: 12,
    color: "#1976D2",
    fontWeight: "500",
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#999",
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#bbb",
  },
});

