import React, { useState } from "react";
import { View, StyleSheet, Pressable, Modal } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut, useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
export interface ReactionType {
  type: string;
  iconName: string;
  color: string;
  label: string;
}

export const REACTIONS: ReactionType[] = [
  { type: "clap", iconName: "hand-left", color: "#FFD700", label: "Nice!" },
  { type: "fire", iconName: "flame", color: "#FF6B35", label: "Fire!" },
  { type: "tennis", iconName: "tennisball", color: "#9AE66E", label: "Game!" },
  { type: "muscle", iconName: "fitness", color: "#4ECDC4", label: "Strong!" },
  { type: "star", iconName: "star", color: "#FFD700", label: "Amazing!" },
];

interface ReactionButtonProps {
  reaction: ReactionType;
  isSelected: boolean;
  onPress: () => void;
  size?: "small" | "medium" | "large";
  showLabel?: boolean;
}

export function ReactionButton({ 
  reaction, 
  isSelected, 
  onPress, 
  size = "medium",
  showLabel = false 
}: ReactionButtonProps) {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  
  const iconSize = size === "small" ? 18 : size === "large" ? 28 : 22;
  const containerSize = size === "small" ? 32 : size === "large" ? 48 : 40;
  
  const handlePressIn = () => {
    scale.value = withSpring(1.2);
  };
  
  const handlePressOut = () => {
    scale.value = withSpring(1);
  };
  
  return (
    <Pressable 
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View 
        style={[
          styles.reactionButton,
          { 
            width: containerSize, 
            height: containerSize,
            backgroundColor: isSelected ? reaction.color + "30" : "rgba(255, 255, 255, 0.06)",
            borderColor: isSelected ? reaction.color : "transparent",
            borderWidth: isSelected ? 2 : 0,
          },
          animatedStyle,
        ]}
      >
        <Ionicons 
          name={reaction.iconName as any} 
          size={iconSize} 
          color={reaction.color} 
        />
      </Animated.View>
      {showLabel ? (
        <ThemedText style={[styles.reactionLabel, { color: reaction.color }]}>
          {reaction.label}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

interface ReactionPickerProps {
  selectedReaction?: string | null;
  onSelect: (type: string) => void;
  onRemove?: () => void;
  layout?: "row" | "grid";
  size?: "small" | "medium" | "large";
  showLabels?: boolean;
}

export function ReactionPicker({ 
  selectedReaction, 
  onSelect, 
  onRemove,
  layout = "row",
  size = "medium",
  showLabels = false,
}: ReactionPickerProps) {
  const handlePress = (type: string) => {
    if (selectedReaction === type && onRemove) {
      onRemove();
    } else {
      onSelect(type);
    }
  };
  
  return (
    <View style={[styles.container, layout === "grid" && styles.containerGrid]}>
      {REACTIONS.map((reaction) => (
        <ReactionButton
          key={reaction.type}
          reaction={reaction}
          isSelected={selectedReaction === reaction.type}
          onPress={() => handlePress(reaction.type)}
          size={size}
          showLabel={showLabels}
        />
      ))}
    </View>
  );
}

interface ReactionPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: string) => void;
  currentReaction?: string | null;
}

export function ReactionPickerModal({ 
  visible, 
  onClose, 
  onSelect,
  currentReaction,
}: ReactionPickerModalProps) {
  const handleSelect = (type: string) => {
    onSelect(type);
    onClose();
  };
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Animated.View 
          entering={ZoomIn.duration(200)}
          exiting={ZoomOut.duration(150)}
          style={styles.modalContent}
        >
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.modalInner}>
            <ThemedText style={styles.modalTitle}>React</ThemedText>
            <ReactionPicker
              selectedReaction={currentReaction}
              onSelect={handleSelect}
              size="large"
              showLabels
            />
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

interface ReactionSummaryProps {
  reactions: Record<string, number>;
  totalCount: number;
  onPress?: () => void;
}

export function ReactionSummary({ reactions, totalCount, onPress }: ReactionSummaryProps) {
  if (totalCount === 0) return null;
  
  const topReactions = Object.entries(reactions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  return (
    <Pressable style={styles.summaryContainer} onPress={onPress}>
      <View style={styles.summaryIcons}>
        {topReactions.map(([type], index) => {
          const reaction = REACTIONS.find(r => r.type === type);
          if (!reaction) return null;
          return (
            <View 
              key={type} 
              style={[
                styles.summaryIcon,
                { marginLeft: index > 0 ? -8 : 0, zIndex: 10 - index }
              ]}
            >
              <Ionicons 
                name={reaction.iconName as any} 
                size={14} 
                color={reaction.color} 
              />
            </View>
          );
        })}
      </View>
      <ThemedText style={styles.summaryCount}>{totalCount}</ThemedText>
    </Pressable>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  containerGrid: {
    flexWrap: "wrap",
    justifyContent: "center",
  },
  reactionButton: {
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  reactionLabel: {
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    backgroundColor: Backgrounds.card,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  modalInner: {
    padding: Spacing.lg,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  summaryContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  summaryIcons: {
    flexDirection: "row",
  },
  summaryIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  summaryCount: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
}));
