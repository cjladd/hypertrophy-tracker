import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, FlatList, Text, TextInput, View } from 'react-native';
import { useSettings } from '../context/SettingsContext';
import { addSet, finishWorkout, getExercises, startWorkout } from '../lib/repo';

export default function LogScreen() {
  const [workoutId, setWorkoutId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<{ id: string; name: string }[]>([]);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [reps, setReps] = useState('5');
  const [weight, setWeight] = useState('60'); // kg
  const [setIndex, setSetIndex] = useState(1);
  const [logged, setLogged] = useState<any[]>([]);

  // Settings: progressive overload auto-increment
  const { autoIncrementWeight, weightIncrementLbs } = useSettings();
  const LBS_TO_KG = 0.45359237;

  useEffect(() => {
    getExercises().then((rows: any) => {
      setExercises(rows as any[]);
      setExerciseId(rows?.[0]?.id ?? null);
    });
  }, []);

  async function onStart() {
    const w = await startWorkout('push');
    setWorkoutId(w.id);
  }

  async function onAddSet() {
    if (!workoutId || !exerciseId) return;

    const lastWeightKg = Number(weight) || 0;
    const nextWeightKg = autoIncrementWeight
      ? lastWeightKg + weightIncrementLbs * LBS_TO_KG
      : lastWeightKg;

    const id = await addSet({
      workoutId,
      exerciseId,
      setIndex,
      reps: Number(reps),
      weightKg: nextWeightKg,
    });

    // Update UI for next set
    setLogged((prev) => [
      ...prev,
      { id, exerciseId, setIndex, reps, weight: nextWeightKg },
    ]);
    setSetIndex((n) => n + 1);
    setWeight(String(nextWeightKg)); // prefill next set with suggested weight
  }

  async function onFinish() {
    if (!workoutId) return;
    await finishWorkout(workoutId);
    setWorkoutId(null);
    setSetIndex(1);
    setLogged([]);
    router.push('/history'); // jump to history
  }

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Log Workout</Text>

      {!workoutId ? (
        <Button title="Start Workout" onPress={onStart} />
      ) : (
        <>
          <Text>Exercise</Text>
          <FlatList
            data={exercises}
            horizontal
            keyExtractor={(x) => x.id}
            renderItem={({ item }) => (
              <Button
                title={item.name}
                onPress={() => setExerciseId(item.id)}
              />
            )}
          />

          <Text>Reps</Text>
          <TextInput
            value={reps}
            onChangeText={setReps}
            keyboardType="number-pad"
            style={{ borderWidth: 1, padding: 8 }}
          />

          <Text>Weight (kg)</Text>
          <TextInput
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            style={{ borderWidth: 1, padding: 8 }}
          />

          <Button title={`Add Set #${setIndex}`} onPress={onAddSet} />

          <Text style={{ marginTop: 16, fontWeight: '600' }}>Logged Sets</Text>
          {logged.map((s) => (
            <Text key={s.id}>
              {s.setIndex}. {exercises.find((e) => e.id === s.exerciseId)?.name}{' '}
              — {s.reps} × {typeof s.weight === 'number' ? s.weight.toFixed(1) : s.weight} kg
            </Text>
          ))}

          <Button title="Finish Workout" onPress={onFinish} />
        </>
      )}
    </View>
  );
}
