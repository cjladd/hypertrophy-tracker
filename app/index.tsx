import { getExercises, listRecentWorkouts } from "@/lib/repo";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function Index() {
  const [exercises, setExercises] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const ex = await getExercises();
      const wk = await listRecentWorkouts(5);
      setExercises(ex);
      setWorkouts(wk);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hypertrophy Tracker</Text>
      <Text style={styles.subtitle}>Your workout companion</Text>

      {/* Quick Actions */}
      <View style={styles.actionsSection}>
        <Link href="/log" asChild>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Start Workout</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/exercises" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Manage Exercises</Text>
          </TouchableOpacity>
        </Link>
      </View>

      {/* Stats Overview */}
      <View style={styles.statsSection}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{exercises.length}</Text>
          <Text style={styles.statLabel}>Exercises</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{workouts.length}</Text>
          <Text style={styles.statLabel}>Workouts</Text>
        </View>
      </View>

      {/* Recent Workouts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Workouts</Text>
        {workouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No workouts yet</Text>
            <Text style={styles.emptySubtext}>Start your first workout to begin tracking!</Text>
          </View>
        ) : (
          workouts.map((wk: any) => (
            <View key={wk.id} style={styles.workoutItem}>
              <Text style={styles.workoutDate}>
                {new Date(wk.started_at).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              <Text style={styles.workoutInfo}>
                {wk.ended_at ? "Completed" : "In Progress"}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* Exercise Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Exercises</Text>
        {exercises.slice(0, 5).map((ex) => (
          <View key={ex.id} style={styles.exerciseItem}>
            <Text style={styles.exerciseName}>{ex.name}</Text>
            <View style={styles.muscleTag}>
              <Text style={styles.muscleTagText}>{ex.muscle_group}</Text>
            </View>
          </View>
        ))}
        {exercises.length > 5 && (
          <Link href="/exercises" asChild>
            <TouchableOpacity style={styles.viewAllButton}>
              <Text style={styles.viewAllText}>View All ({exercises.length})</Text>
            </TouchableOpacity>
          </Link>
        )}
      </View>
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
  },
  loadingText: {
    textAlign: "center",
    marginTop: 50,
    fontSize: 16,
    color: "#666",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
  },
  actionsSection: {
    marginBottom: 25,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  secondaryButton: {
    backgroundColor: "white",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  secondaryButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
  statsSection: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 25,
  },
  statCard: {
    flex: 1,
    backgroundColor: "white",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#007AFF",
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 14,
    color: "#666",
  },
  section: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#bbb",
  },
  workoutItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  workoutDate: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 3,
  },
  workoutInfo: {
    fontSize: 14,
    color: "#666",
  },
  exerciseItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  exerciseName: {
    fontSize: 15,
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
  viewAllButton: {
    marginTop: 10,
    alignItems: "center",
  },
  viewAllText: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
