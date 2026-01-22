// components/DraggableExerciseList.tsx
// Reusable draggable list component for reordering exercises
// Uses react-native-draggable-flatlist for proper drag-to-reorder functionality

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DraggableFlatList, {
    RenderItemParams,
    ScaleDecorator,
} from "react-native-draggable-flatlist";

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
}

export default function DraggableExerciseList({
  items,
  onReorder,
}: DraggableExerciseListProps) {
  const renderItem = ({
    item,
    drag,
    isActive,
    getIndex,
  }: RenderItemParams<DraggableItem>) => {
    const index = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <View
          style={[
            styles.itemContainer,
            isActive && styles.itemContainerActive,
          ]}
        >
          <View style={styles.orderNumber}>
            <Text style={styles.orderNumberText}>{index + 1}</Text>
          </View>

          <TouchableOpacity
            style={styles.dragHandle}
            onLongPress={drag}
            delayLongPress={100}
          >
            <Ionicons name="menu" size={24} color={isActive ? "#007AFF" : "#999"} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.itemContent}
            onPress={item.onPress}
            disabled={!item.onPress || isActive}
          >
            <View style={styles.itemTextContainer}>
              <Text style={styles.itemName}>{item.displayName}</Text>
              {item.subtitle && (
                <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
              )}
            </View>
          </TouchableOpacity>

          {item.onRemove && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={item.onRemove}
              disabled={isActive}
            >
              <Ionicons name="close" size={20} color="#FF3B30" />
            </TouchableOpacity>
          )}
        </View>
      </ScaleDecorator>
    );
  };

  const handleDragEnd = ({
    from,
    to,
  }: {
    data: DraggableItem[];
    from: number;
    to: number;
  }) => {
    if (from !== to) {
      onReorder(from, to);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.dragHint}>Hold and drag ☰ to reorder</Text>
      <DraggableFlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        onDragEnd={handleDragEnd}
        containerStyle={styles.listContainer}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  dragHint: {
    fontSize: 13,
    color: "#888",
    textAlign: "center",
    marginBottom: 8,
    fontStyle: "italic",
  },
  listContainer: {
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
    paddingHorizontal: 8,
  },
  itemContainerActive: {
    backgroundColor: "#e3f2fd",
    borderColor: "#007AFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  orderNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  orderNumberText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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
  removeButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});

