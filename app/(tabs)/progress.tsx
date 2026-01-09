// app/(tabs)/progress.tsx
// Progress Charts screen - Visualize strength progression over time (PRD §3F, §5)

import {
    getExerciseProgressData,
    getExercisesWithWorkoutCount,
    type ProgressDataPoint,
} from "@/lib/repo";
import type { Exercise, MuscleGroup } from "@/lib/types";
import { MUSCLE_GROUPS } from "@/lib/types";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dimensions,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { LineChart } from "react-native-chart-kit";

const screenWidth = Dimensions.get("window").width;

interface ExerciseWithCount extends Exercise {
  workout_count: number;
}

// Helper to format muscle group display names
const formatMuscleGroup = (mg: MuscleGroup): string => {
  return mg
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default function ProgressScreen() {
  const [exercises, setExercises] = useState<ExerciseWithCount[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseWithCount | null>(null);
  const [chartData, setChartData] = useState<ProgressDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingChart, setLoadingChart] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [filterMuscleGroup, setFilterMuscleGroup] = useState<MuscleGroup | null>(null);
  const selectedExerciseRef = useRef<ExerciseWithCount | null>(null);

  useEffect(() => {
    selectedExerciseRef.current = selectedExercise;
  }, [selectedExercise]);

  const loadExercises = async () => {
    try {
      setLoading(true);
      const exercisesWithCount = await getExercisesWithWorkoutCount();
      setExercises(exercisesWithCount);

      if (exercisesWithCount.length === 0) {
        setSelectedExercise(null);
        setChartData([]);
        return;
      }

      // Refresh chart for the current selection, or default to most frequent
      const currentSelection = selectedExerciseRef.current;
      if (!currentSelection) {
        await selectExercise(exercisesWithCount[0]);
      } else {
        const refreshed = exercisesWithCount.find((e) => e.id === currentSelection.id);
        await selectExercise(refreshed ?? exercisesWithCount[0]);
      }
    } catch (error) {
      console.error("Failed to load exercises:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectExercise = async (exercise: ExerciseWithCount) => {
    setSelectedExercise(exercise);
    setPickerVisible(false);
    setLoadingChart(true);

    try {
      const data = await getExerciseProgressData(exercise.id);
      setChartData(data);
    } catch (error) {
      console.error("Failed to load chart data:", error);
      setChartData([]);
    } finally {
      setLoadingChart(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadExercises();
    }, [])
  );

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // Filter exercises for picker
  const filteredExercises = filterMuscleGroup
    ? exercises.filter((e) => e.muscle_group === filterMuscleGroup)
    : exercises;

  // Prepare chart data
  const getChartConfig = () => ({
    backgroundColor: "#ffffff",
    backgroundGradientFrom: "#ffffff",
    backgroundGradientTo: "#ffffff",
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: "5",
      strokeWidth: "2",
      stroke: "#007AFF",
    },
    propsForBackgroundLines: {
      strokeDasharray: "",
      stroke: "#E5E5EA",
    },
  });

  const renderChart = () => {
    if (loadingChart) {
      return (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.placeholderText}>Loading chart...</Text>
        </View>
      );
    }

    if (chartData.length === 0) {
      return (
        <View style={styles.chartPlaceholder}>
          <Text style={styles.placeholderText}>No data yet</Text>
          <Text style={styles.placeholderSubtext}>
            Complete workouts with this exercise to see your progress
          </Text>
        </View>
      );
    }

    if (chartData.length === 1) {
      // Single data point - show it differently
      return (
        <View style={styles.singleDataPoint}>
          <Text style={styles.singleDataLabel}>Top Weight</Text>
          <Text style={styles.singleDataValue}>{chartData[0].maxWeightLb} lb</Text>
          <Text style={styles.singleDataDate}>
            {new Date(chartData[0].workoutDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
          <Text style={styles.placeholderSubtext}>
            Complete more workouts to see your progress chart
          </Text>
        </View>
      );
    }

    // Limit labels to avoid overcrowding (max 6 labels)
    const maxLabels = 6;
    const step = Math.ceil(chartData.length / maxLabels);
    const labels = chartData.map((d, i) => (i % step === 0 ? formatDate(d.workoutDate) : ""));

    const data = {
      labels,
      datasets: [
        {
          data: chartData.map((d) => d.maxWeightLb),
          color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
          strokeWidth: 2,
        },
      ],
    };

    // Calculate min/max for better Y-axis scaling
    const weights = chartData.map((d) => d.maxWeightLb);
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    const range = maxWeight - minWeight;
    const padding = range > 0 ? range * 0.1 : 10;

    return (
      <View style={styles.chartContainer}>
        <LineChart
          data={data}
          width={screenWidth - 32}
          height={220}
          chartConfig={getChartConfig()}
          bezier
          style={styles.chart}
          withInnerLines={true}
          withOuterLines={true}
          withVerticalLines={false}
          withHorizontalLines={true}
          withDots={true}
          withShadow={false}
          fromZero={minWeight > padding * 2}
          yAxisSuffix=" lb"
          segments={4}
        />
        <View style={styles.chartStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Starting</Text>
            <Text style={styles.statValue}>{chartData[0].maxWeightLb} lb</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Current</Text>
            <Text style={styles.statValue}>
              {chartData[chartData.length - 1].maxWeightLb} lb
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Change</Text>
            <Text
              style={[
                styles.statValue,
                chartData[chartData.length - 1].maxWeightLb - chartData[0].maxWeightLb >= 0
                  ? styles.positive
                  : styles.negative,
              ]}
            >
              {chartData[chartData.length - 1].maxWeightLb - chartData[0].maxWeightLb >= 0
                ? "+"
                : ""}
              {chartData[chartData.length - 1].maxWeightLb - chartData[0].maxWeightLb} lb
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Sessions</Text>
            <Text style={styles.statValue}>{chartData.length}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (exercises.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No Progress Data Yet</Text>
          <Text style={styles.emptySubtitle}>
            Complete some workouts to start tracking your progress
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Progress</Text>
      <Text style={styles.subtitle}>Track your strength gains over time</Text>

      {/* Exercise Selector */}
      <TouchableOpacity style={styles.exerciseSelector} onPress={() => setPickerVisible(true)}>
        <View>
          <Text style={styles.selectorLabel}>Exercise</Text>
          <Text style={styles.selectorValue}>
            {selectedExercise?.name ?? "Select an exercise"}
          </Text>
        </View>
        <Text style={styles.selectorArrow}>›</Text>
      </TouchableOpacity>

      {/* Chart */}
      {selectedExercise && renderChart()}

      {/* Exercise Picker Modal */}
      <Modal
        visible={pickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Exercise</Text>
            <TouchableOpacity onPress={() => setPickerVisible(false)}>
              <Text style={styles.modalClose}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Muscle Group Filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterContent}
          >
            <TouchableOpacity
              style={[styles.filterChip, !filterMuscleGroup && styles.filterChipActive]}
              onPress={() => setFilterMuscleGroup(null)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  !filterMuscleGroup && styles.filterChipTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {MUSCLE_GROUPS.map((mg) => {
              const hasExercises = exercises.some((e) => e.muscle_group === mg);
              if (!hasExercises) return null;
              return (
                <TouchableOpacity
                  key={mg}
                  style={[styles.filterChip, filterMuscleGroup === mg && styles.filterChipActive]}
                  onPress={() => setFilterMuscleGroup(mg)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filterMuscleGroup === mg && styles.filterChipTextActive,
                    ]}
                  >
                    {formatMuscleGroup(mg)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Exercise List */}
          <ScrollView style={styles.exerciseList}>
            {filteredExercises.map((exercise) => (
              <TouchableOpacity
                key={exercise.id}
                style={[
                  styles.exerciseItem,
                  selectedExercise?.id === exercise.id && styles.exerciseItemSelected,
                ]}
                onPress={() => selectExercise(exercise)}
              >
                <View>
                  <Text style={styles.exerciseName}>{exercise.name}</Text>
                  <Text style={styles.exerciseMeta}>
                    {formatMuscleGroup(exercise.muscle_group)} • {exercise.workout_count} workout
                    {exercise.workout_count !== 1 ? "s" : ""}
                  </Text>
                </View>
                {selectedExercise?.id === exercise.id && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#1c1c1e",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: "#8E8E93",
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 16,
    color: "#8E8E93",
    textAlign: "center",
    marginTop: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1c1c1e",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#8E8E93",
    textAlign: "center",
  },
  exerciseSelector: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectorLabel: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 2,
  },
  selectorValue: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1c1c1e",
  },
  selectorArrow: {
    fontSize: 24,
    color: "#8E8E93",
  },
  chartContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  chart: {
    borderRadius: 8,
    marginVertical: 8,
  },
  chartPlaceholder: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
  placeholderText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: "#AEAEB2",
    textAlign: "center",
  },
  singleDataPoint: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
  singleDataLabel: {
    fontSize: 14,
    color: "#8E8E93",
    marginBottom: 4,
  },
  singleDataValue: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#007AFF",
    marginBottom: 4,
  },
  singleDataDate: {
    fontSize: 14,
    color: "#8E8E93",
    marginBottom: 16,
  },
  chartStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E5EA",
  },
  statItem: {
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#8E8E93",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1c1c1e",
  },
  positive: {
    color: "#34C759",
  },
  negative: {
    color: "#FF3B30",
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
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1c1c1e",
  },
  modalClose: {
    fontSize: 17,
    color: "#007AFF",
    fontWeight: "600",
  },
  filterScroll: {
    backgroundColor: "#fff",
    maxHeight: 56,
  },
  filterContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#E5E5EA",
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: "#007AFF",
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1c1c1e",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  exerciseList: {
    flex: 1,
    padding: 16,
  },
  exerciseItem: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  exerciseItemSelected: {
    backgroundColor: "#E5F0FF",
    borderColor: "#007AFF",
    borderWidth: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1c1c1e",
    marginBottom: 2,
  },
  exerciseMeta: {
    fontSize: 13,
    color: "#8E8E93",
  },
  checkmark: {
    fontSize: 18,
    color: "#007AFF",
    fontWeight: "bold",
  },
});
