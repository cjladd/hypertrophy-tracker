// components/DraggableExerciseList.tsx
// Reusable draggable list component for reordering exercises
// Uses up/down arrows for reliable reordering without complex gesture handling

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export interface DraggableItem {
  id: string;
  displayName: string;
  subtitle?: string;
  onPress?: () => void;
  onRemove?: () => void;
}

interface DraggableExerciseListProps {
  items: DraggableItem[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  itemHeight?: number;
}

export default function DraggableExerciseList({
  items,
  onReorder,
}: DraggableExerciseListProps) {
  const handleMoveUp = (index: number) => {
    if (index > 0) {
      onReorder(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < items.length - 1) {
      onReorder(index, index + 1);
    }
  };

  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <View key={item.id} style={styles.itemContainer}>
          <View style={styles.dragHandle}>
            <Ionicons name="menu" size={24} color="#999" />
          </View>

          <TouchableOpacity
            style={styles.itemContent}
            onPress={item.onPress}
            disabled={!item.onPress}
          >
            <View style={styles.itemTextContainer}>
              <Text style={styles.itemName}>{item.displayName}</Text>
              {item.subtitle && <Text style={styles.itemSubtitle}>{item.subtitle}</Text>}
            </View>
          </TouchableOpacity>

          <View style={styles.reorderButtons}>
            <TouchableOpacity
              style={[styles.reorderButton, index === 0 && styles.reorderButtonDisabled]}
              onPress={() => handleMoveUp(index)}
              disabled={index === 0}
            >
              <Ionicons
                name="chevron-up"
                size={18}
                color={index === 0 ? "#ccc" : "#007AFF"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.reorderButton,
                index === items.length - 1 && styles.reorderButtonDisabled,
              ]}
              onPress={() => handleMoveDown(index)}
              disabled={index === items.length - 1}
            >
              <Ionicons
                name="chevron-down"
                size={18}
                color={index === items.length - 1 ? "#ccc" : "#007AFF"}
              />
            </TouchableOpacity>
          </View>

          {item.onRemove && (
            <TouchableOpacity style={styles.removeButton} onPress={item.onRemove}>
              <Text style={styles.removeText}>×</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  dragHandle: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  itemContent: {
    flex: 1,
    paddingVertical: 4,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 14,
    color: "#666",
  },
  reorderButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reorderButton: {
    padding: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  reorderButtonDisabled: {
    opacity: 0.5,
  },
  removeButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  removeText: {
    fontSize: 28,
    color: "#FF3B30",
    fontWeight: "bold",
    lineHeight: 28,
  },
});

