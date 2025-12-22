import { addSet, finishWorkout, getExercises, listRecentWorkouts, startWorkout } from "@/lib/repo";
import { useEffect, useState } from "react";
import { Button, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Index() {
  const [exercises, setExercises] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWorkoutId, setCurrentWorkoutId] = useState<string | null>(null);

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

  const handleStartWorkout = async () => {
    try {
      const workout = await startWorkout("Push");
      setCurrentWorkoutId(workout.id);
      console.log("Started workout:", workout.id);
      loadData();
    } catch (error) {
      console.error("Error starting workout:", error);
    }
  };

  const handleAddSet = async () => {
    if (!currentWorkoutId || exercises.length === 0) return;
    
    try {
      await addSet({
        workoutId: currentWorkoutId,
        exerciseId: exercises[0].id,
        setIndex: 1,
        reps: 10,
        weightKg: 100,
        rpe: 8,
        isWarmup: 0
      });
      console.log("Added set");
    } catch (error) {
      console.error("Error adding set:", error);
    }
  };

  const handleFinishWorkout = async () => {
    if (!currentWorkoutId) return;
    
    try {
      await finishWorkout(currentWorkoutId);
      setCurrentWorkoutId(null);
      console.log("Finished workout");
      loadData();
    } catch (error) {
      console.error("Error finishing workout:", error);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Hypertrophy Tracker</Text>
      <Text style={styles.subtitle}>Database Test Screen</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Exercises ({exercises.length})</Text>
        {exercises.map((ex) => (
          <Text key={ex.id} style={styles.item}>• {ex.name}</Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Workouts ({workouts.length})</Text>
        {workouts.length === 0 ? (
          <Text style={styles.item}>No workouts yet</Text>
        ) : (
          workouts.map((wk: any) => (
            <Text key={wk.id} style={styles.item}>
              • {new Date(wk.started_at).toLocaleDateString()} - {wk.split_day || 'No split'}
            </Text>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Test</Text>
        {!currentWorkoutId ? (
          <Button title="Start Workout" onPress={handleStartWorkout} />
        ) : (
          <>
            <Text style={styles.status}>✓ Workout in progress</Text>
            <Button title="Add Set" onPress={handleAddSet} />
            <View style={{ height: 10 }} />
            <Button title="Finish Workout" onPress={handleFinishWorkout} />
          </>
        )}
      </View>

      <Text style={styles.footer}>
        Database is working! ✓{"\n"}
        Ready for feature development.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  section: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  item: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  status: {
    fontSize: 14,
    color: '#4CAF50',
    marginBottom: 10,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 40,
  },
});
