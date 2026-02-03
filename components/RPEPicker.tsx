// components/RPEPicker.tsx
// RPE picker with anchor labels
import { COLORS, SHADOWS } from "@/lib/theme";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface RPEPickerProps {
  value?: number;
  onChange: (rpe: number | undefined) => void;
}

// RPE anchor labels
// These help improve input quality with clear descriptions
const RPE_VALUES = [
  { value: undefined, label: "Skip", description: "No RPE" },
  { value: 6, label: "6", description: "Warm-up / speed work" },
  { value: 7, label: "7", description: "3+ reps left" },
  { value: 8, label: "8", description: "Could do 2 more reps" },
  { value: 9, label: "9", description: "Could do 1 more rep" },
  { value: 10, label: "10", description: "Could not do another rep" },
];

/**
 * Get color for RPE value (exported for use in other components)
 */
export function getRPEColor(rpe?: number): string {
  if (!rpe) return COLORS.textTertiary;
  if (rpe <= 7) return COLORS.success;     // Green - Moderate
  if (rpe <= 8) return COLORS.warning;     // Orange - Hard
  if (rpe <= 9) return COLORS.destructive; // Red - Very hard
  return COLORS.purple;                     // Purple - Max
}

export default function RPEPicker({ value, onChange }: RPEPickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>RPE (Rate of Perceived Exertion)</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pickerContent}
      >
        {RPE_VALUES.map((item) => {
          const isSelected = value === item.value;
          const backgroundColor = isSelected
            ? getRPEColor(item.value)
            : COLORS.backgroundDark;
          const textColor = isSelected ? COLORS.textInverse : COLORS.textSecondary;

          return (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.rpeButton,
                { backgroundColor },
                isSelected && styles.rpeButtonActive,
              ]}
              onPress={() => onChange(item.value)}
            >
              <Text style={[styles.rpeButtonText, { color: textColor }]}>
                {item.label}
              </Text>
              <Text
                style={[
                  styles.rpeButtonDescription,
                  { color: isSelected ? "rgba(255,255,255,0.8)" : COLORS.textTertiary },
                ]}
              >
                {item.description}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  pickerContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  rpeButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 100,
    alignItems: "center",
  },
  rpeButtonActive: {
    ...SHADOWS.active,
  },
  rpeButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 2,
  },
  rpeButtonDescription: {
    fontSize: 11,
    textAlign: "center",
  },
});
