// components/RPEPicker.tsx
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

const RPE_VALUES = [
  { value: undefined, label: "None", description: "No RPE" },
  { value: 6, label: "6", description: "Easy warmup" },
  { value: 7, label: "7", description: "Could do 3+ more" },
  { value: 8, label: "8", description: "Could do 2-3 more" },
  { value: 9, label: "9", description: "Could do 1 more" },
  { value: 10, label: "10", description: "Max effort" },
];

export function getRPEColor(rpe?: number): string {
  if (!rpe) return "#999";
  if (rpe <= 6) return "#34C759"; // Green - Easy
  if (rpe <= 7) return "#5AC8FA"; // Light blue - Moderate
  if (rpe <= 8) return "#FF9500"; // Orange - Hard
  if (rpe <= 9) return "#FF3B30"; // Red - Very hard
  return "#8E44AD"; // Purple - Max
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
            : "#f0f0f0";
          const textColor = isSelected ? "white" : "#666";

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
                  { color: isSelected ? "rgba(255,255,255,0.8)" : "#999" },
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
    color: "#666",
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
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
