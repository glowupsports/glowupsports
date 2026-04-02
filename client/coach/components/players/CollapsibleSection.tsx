import React, { useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, LayoutAnimation, Platform, UIManager } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing } from "@/constants/theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  iconColor,
  defaultExpanded = false,
  children,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const rotateAnim = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  const toggle = () => {
    const toValue = expanded ? 0 : 1;

    LayoutAnimation.configureNext({
      duration: 250,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });

    Animated.timing(rotateAnim, {
      toValue,
      duration: 220,
      useNativeDriver: true,
    }).start();

    setExpanded((prev) => !prev);
  };

  const chevronRotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View>
      <Pressable style={styles.header} onPress={toggle}>
        <View style={styles.headerLeft}>
          {icon ? (
            <Ionicons name={icon} size={15} color={iconColor || Colors.dark.xpCyan} style={{ marginRight: Spacing.xs }} />
          ) : null}
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Ionicons name="chevron-down" size={17} color={Colors.dark.tabIconDefault} />
        </Animated.View>
      </Pressable>
      {expanded ? <View>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginBottom: 2,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
