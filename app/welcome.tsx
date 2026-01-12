import { useSettings } from "@/context/SettingsContext";
import { getRoutineDays, listRoutines } from "@/lib/repo";
import type { Routine, RoutineDay } from "@/lib/types";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const { width } = Dimensions.get("window");

type RoutineWithDays = Routine & { days: RoutineDay[] };

export default function Welcome() {
  const router = useRouter();
  const { completeOnboarding, setActiveRoutineId } = useSettings();
  const [step, setStep] = useState(0);
  const [routines, setRoutines] = useState<RoutineWithDays[]>([]);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoutines();
  }, []);

  const loadRoutines = async () => {
    try {
      const allRoutines = await listRoutines();
      const routinesWithDays: RoutineWithDays[] = [];
      for (const routine of allRoutines) {
        const days = await getRoutineDays(routine.id);
        routinesWithDays.push({ ...routine, days });
      }
      setRoutines(routinesWithDays);
    } catch (err) {
      console.error("Failed to load routines:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    setActiveRoutineId(selectedRoutineId);
    completeOnboarding();
    router.replace("/(tabs)");
  };

  const handleSkip = () => {
    setActiveRoutineId(null);
    completeOnboarding();
    router.replace("/(tabs)");
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return <WelcomeStep onNext={() => setStep(1)} />;
      case 1:
        return <IntroStep onNext={() => setStep(2)} onBack={() => setStep(0)} />;
      case 2:
        return (
          <RoutineStep
            routines={routines}
            selectedRoutineId={selectedRoutineId}
            onSelectRoutine={setSelectedRoutineId}
            onComplete={handleComplete}
            onSkip={handleSkip}
            onBack={() => setStep(1)}
            loading={loading}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {renderStep()}
      <View style={styles.dotsContainer}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, step === i && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

// Step 1: Welcome
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.stepContainer}>
      <View style={styles.heroSection}>
        <Text style={styles.appIcon}>🏋️</Text>
        <Text style={styles.title}>Hypertrophy Tracker</Text>
        <Text style={styles.subtitle}>Your personal strength coach</Text>
      </View>
      <View style={styles.featureList}>
        <FeatureItem icon="📊" text="Track your workouts and progress" />
        <FeatureItem icon="📈" text="Smart progression suggestions" />
        <FeatureItem icon="💪" text="Build muscle with proven methods" />
      </View>
      <View style={styles.welcomeButtonContainer}>
        <TouchableOpacity style={styles.welcomeButton} onPress={onNext}>
          <Text style={styles.welcomeButtonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Step 2: Intro/How it works
function IntroStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>How It Works</Text>
      <View style={styles.introCards}>
        <IntroCard
          number="1"
          title="Log Your Sets"
          description="Track weight, reps, and RPE for each working set"
        />
        <IntroCard
          number="2"
          title="Get Suggestions"
          description="Smart progression tells you when to add weight or reps"
        />
        <IntroCard
          number="3"
          title="See Progress"
          description="Watch your strength grow with charts and stats"
        />
      </View>
      <View style={styles.methodBox}>
        <Text style={styles.methodTitle}>Triple Progression Method</Text>
        <Text style={styles.methodText}>
          First increase reps to your ceiling, then expand the ceiling (to 15, then 20) when 
          weight jumps are too large, then add weight. This prevents plateaus and maximizes growth.
        </Text>
      </View>
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={onNext}>
          <Text style={styles.primaryButtonText}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Step 3: Routine Selection
function RoutineStep({
  routines,
  selectedRoutineId,
  onSelectRoutine,
  onComplete,
  onSkip,
  onBack,
  loading,
}: {
  routines: RoutineWithDays[];
  selectedRoutineId: string | null;
  onSelectRoutine: (id: string) => void;
  onComplete: () => void;
  onSkip: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const getRoutineDescription = (routine: RoutineWithDays): string => {
    const dayCount = routine.days.length;
    if (routine.name === "PPL") {
      return `${dayCount}-day split • Push, Pull, Legs cycle`;
    } else if (routine.name === "Upper/Lower") {
      return `${dayCount}-day split • Alternating upper and lower body`;
    } else if (routine.name === "Full Body") {
      return `${dayCount}-day split • Train everything each session`;
    } else if (routine.name === "Bro Split") {
      return `${dayCount}-day split • One muscle group per day`;
    }
    return `${dayCount} days per cycle`;
  };

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Choose Your Routine</Text>
      <Text style={styles.stepSubtitle}>
        Pick a training split that fits your schedule. You can change this later.
      </Text>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <ScrollView style={styles.routineList} showsVerticalScrollIndicator={false}>
          {routines.map((routine) => (
            <TouchableOpacity
              key={routine.id}
              style={[
                styles.routineCard,
                selectedRoutineId === routine.id && styles.routineCardSelected,
              ]}
              onPress={() => onSelectRoutine(routine.id)}
            >
              <View style={styles.routineHeader}>
                <Text style={styles.routineName}>{routine.name}</Text>
                {selectedRoutineId === routine.id && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text style={styles.routineDescription}>
                {getRoutineDescription(routine)}
              </Text>
              <Text style={styles.routineDays}>
                {routine.days.map((d) => d.name).join(" → ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        {selectedRoutineId ? (
          <TouchableOpacity style={styles.primaryButton} onPress={onComplete}>
            <Text style={styles.primaryButtonText}>Let's Go!</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipButtonText}>Skip for Now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// Helper Components
function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function IntroCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.introCard}>
      <View style={styles.introNumber}>
        <Text style={styles.introNumberText}>{number}</Text>
      </View>
      <View style={styles.introContent}>
        <Text style={styles.introCardTitle}>{title}</Text>
        <Text style={styles.introCardDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 100,
  },
  dotsContainer: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ddd",
  },
  dotActive: {
    backgroundColor: "#007AFF",
    width: 24,
  },
  // Welcome Step
  heroSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  appIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: "#666",
  },
  featureList: {
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  featureIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  featureText: {
    fontSize: 17,
    color: "#333",
  },
  welcomeButtonContainer: {
    marginTop: "auto",
    alignItems: "center",
  },
  welcomeButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 30,
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  welcomeButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 17,
    fontWeight: "600",
  },
  // Intro Step
  stepTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 24,
  },
  introCards: {
    marginBottom: 24,
  },
  introCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  introNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#007AFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  introNumberText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  introContent: {
    flex: 1,
  },
  introCardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  introCardDescription: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
  },
  methodBox: {
    backgroundColor: "#f0f7ff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  methodText: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: "auto",
  },
  backButton: {
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 24,
  },
  backButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  skipButton: {
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    flex: 1,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  skipButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
  // Routine Step
  loader: {
    marginTop: 40,
  },
  routineList: {
    flex: 1,
    marginBottom: 16,
  },
  routineCard: {
    backgroundColor: "#f8f8f8",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  routineCardSelected: {
    borderColor: "#007AFF",
    backgroundColor: "#f0f7ff",
  },
  routineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  routineName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  checkmark: {
    fontSize: 20,
    color: "#007AFF",
    fontWeight: "bold",
  },
  routineDescription: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  routineDays: {
    fontSize: 13,
    color: "#888",
  },
});
