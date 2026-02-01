import React, { ReactNode, useCallback } from "react";
import { View, ViewStyle, StyleProp, Platform } from "react-native";
import { useTabNavigation } from "./TabNavigationContext";

interface SwipeBlockerProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SwipeBlocker({ children, style }: SwipeBlockerProps) {
  const { setScrollEnabled } = useTabNavigation();

  const handleTouchStart = useCallback(() => {
    setScrollEnabled(false);
  }, [setScrollEnabled]);

  const handleTouchEnd = useCallback(() => {
    setScrollEnabled(true);
  }, [setScrollEnabled]);

  if (Platform.OS === "web") {
    return <View style={style}>{children}</View>;
  }

  return (
    <View
      style={style}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {children}
    </View>
  );
}
