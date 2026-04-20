import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";
import {
  Backgrounds,
  Spacing,
  BorderRadius,
  Typography,
  TextColors,
  FunctionColors,
} from "@/constants/theme";

export interface ActionSheetItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  isLoading?: boolean;
  isDestructive?: boolean;
  keepOpenWhileLoading?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  actions: ActionSheetItem[];
}

export function ActionSheet({ visible, onClose, actions }: ActionSheetProps) {
  const backdropOpacity = useSharedValue(0);
  const sheetTranslateY = useSharedValue(400);
  const [activeLoadingId, setActiveLoadingId] = useState<string | null>(null);
  const [loadingHasStarted, setLoadingHasStarted] = useState(false);
  const loadingFallbackRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 250 });
      sheetTranslateY.value = withSpring(0, { damping: 20, stiffness: 180 });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      sheetTranslateY.value = withTiming(400, { duration: 200 });
      setActiveLoadingId(null);
      setLoadingHasStarted(false);
      if (loadingFallbackRef.current) {
        clearTimeout(loadingFallbackRef.current);
        loadingFallbackRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (!activeLoadingId) return;
    const activeAction = actions.find((a) => a.id === activeLoadingId);
    if (!activeAction) return;

    if (!loadingHasStarted && activeAction.isLoading) {
      setLoadingHasStarted(true);
    } else if (loadingHasStarted && !activeAction.isLoading) {
      if (loadingFallbackRef.current) {
        clearTimeout(loadingFallbackRef.current);
        loadingFallbackRef.current = null;
      }
      setActiveLoadingId(null);
      setLoadingHasStarted(false);
      triggerDismiss();
    }
  }, [actions, activeLoadingId, loadingHasStarted]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const triggerDismiss = () => {
    backdropOpacity.value = withTiming(0, { duration: 200 });
    sheetTranslateY.value = withTiming(400, { duration: 200 });
    setTimeout(onClose, 200);
  };

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    triggerDismiss();
  };

  const handleAction = (action: ActionSheetItem) => {
    if (action.isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    action.onPress();
    if (action.keepOpenWhileLoading) {
      setActiveLoadingId(action.id);
      setLoadingHasStarted(false);
      if (loadingFallbackRef.current) clearTimeout(loadingFallbackRef.current);
      loadingFallbackRef.current = setTimeout(() => {
        setActiveLoadingId(null);
        setLoadingHasStarted(false);
        triggerDismiss();
      }, 15000);
    } else {
      triggerDismiss();
    }
  };

  const isBlocked = activeLoadingId !== null;
  const regularActions = actions.filter((a) => !a.isDestructive);
  const destructiveActions = actions.filter((a) => a.isDestructive);

  const renderActionRow = (action: ActionSheetItem, isDestructiveRow: boolean) => {
    const iconColor = isDestructiveRow ? FunctionColors.error : (action.color ?? TextColors.secondary);
    const textColor = isDestructiveRow ? FunctionColors.error : (action.color ?? TextColors.primary);
    const iconBg = isDestructiveRow ? FunctionColors.error + "20" : (action.color ?? TextColors.secondary) + "20";
    const isThisLoading = action.id === activeLoadingId || action.isLoading;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.actionRow,
          pressed && !isBlocked && styles.actionRowPressed,
        ]}
        onPress={() => handleAction(action)}
        disabled={isBlocked || action.isLoading}
      >
        <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
          {isThisLoading ? (
            <ActivityIndicator size="small" color={iconColor} />
          ) : (
            <Ionicons name={action.icon} size={18} color={iconColor} />
          )}
        </View>
        <Text style={[styles.actionLabel, { color: textColor, opacity: isBlocked && action.id !== activeLoadingId ? 0.45 : 1 }]}>
          {action.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleDismiss}>
      <View style={styles.container}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <BlurView intensity={20} style={StyleSheet.absoluteFill} />
          {!isBlocked ? (
            <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
          ) : null}
        </Animated.View>

        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.handle} />

          <View style={styles.actionsGroup}>
            {regularActions.map((action, index) => (
              <React.Fragment key={action.id}>
                {index > 0 ? <View style={styles.separator} /> : null}
                {renderActionRow(action, false)}
              </React.Fragment>
            ))}
          </View>

          {destructiveActions.length > 0 ? (
            <View style={[styles.actionsGroup, styles.destructiveGroup]}>
              {destructiveActions.map((action, index) => (
                <React.Fragment key={action.id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  {renderActionRow(action, true)}
                </React.Fragment>
              ))}
            </View>
          ) : null}

          <View style={styles.actionsGroup}>
            <Pressable
              style={({ pressed }) => [
                styles.actionRow,
                styles.cancelRow,
                pressed && !isBlocked && styles.actionRowPressed,
              ]}
              onPress={isBlocked ? undefined : handleDismiss}
              disabled={isBlocked}
            >
              <Text style={[styles.cancelLabel, isBlocked && { opacity: 0.45 }]}>Cancel</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Backgrounds.elevated,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl + 8,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: Spacing.sm,
  },
  actionsGroup: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  destructiveGroup: {
    borderColor: FunctionColors.error + "20",
  },
  separator: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginLeft: 56,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  actionRowPressed: {
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  actionLabel: {
    ...Typography.body,
    fontWeight: "500",
  },
  cancelRow: {
    justifyContent: "center",
  },
  cancelLabel: {
    ...Typography.body,
    color: TextColors.secondary,
    fontWeight: "600",
    textAlign: "center",
  },
}));

export default ActionSheet;
