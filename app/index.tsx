import { listRecentWorkouts } from "@/lib/repo";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function Index() {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const wk = await listRecentWorkouts(10);
      setWorkouts(wk);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Reload data when screen comes into focus (e.g., after finishing workout)
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  // Calculate useful stats
  const getLastWorkoutText = () => {
    const completed = workouts.filter((w) => w.ended_at);
    if (completed.length === 0) return "Never";
    const last = new Date(completed[0].ended_at);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return `${diffDays}d ago`;
  };

  const getThisWeekCount = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);
    return workouts.filter((w) => w.ended_at && new Date(w.ended_at) >= startOfWeek).length;
  };

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

        <Link href="/history" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>History</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/templates" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Templates</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/exercises" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Manage Exercises</Text>
          </TouchableOpacity>
        </Link>

        <Link href="/settings" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Settings & Dev Tools</Text>
          </TouchableOpacity>
        </Link>
      </View>

      {/* Stats Overview */}
      <View style={styles.statsSection}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{getLastWorkoutText()}</Text>
          <Text style={styles.statLabel}>Last Workout</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{getThisWeekCount()}</Text>
          <Text style={styles.statLabel}>This Week</Text>
        </View>
      </View>

      {/* Recent Workouts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Workouts</Text>
          {workouts.filter((w) => w.ended_at).length > 0 && (
            <Link href="/history" asChild>
              <TouchableOpacity>
                <Text style={styles.viewAllLink}>View All</Text>
              </TouchableOpacity>
            </Link>
          )}
        </View>
        {workouts.filter((w) => w.ended_at).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No workouts yet</Text>
            <Text style={styles.emptySubtext}>Start your first workout to begin tracking!</Text>
          </View>
        ) : (
          workouts
            .filter((w) => w.ended_at)
            .slice(0, 5)
            .map((wk: any) => (
              <Link key={wk.id} href="/history" asChild>
                <TouchableOpacity style={styles.workoutItem}>
                  <Text style={styles.workoutDate}>
                    {new Date(wk.started_at).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </Text>
                  <Text style={styles.workoutInfo}>Completed</Text>
                </TouchableOpacity>
              </Link>
            ))
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  viewAllLink: {
    fontSize: 14,
    color: "#007AFF",
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
});
