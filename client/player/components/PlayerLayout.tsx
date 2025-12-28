import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "@/constants/theme";

interface PlayerLayoutProps {
  children: React.ReactNode;
  useSafeArea?: boolean;
  style?: any;
}

export default function PlayerLayout({ 
  children, 
  useSafeArea = true,
  style 
}: PlayerLayoutProps) {
  const insets = useSafeAreaInsets();

  return (
    <View 
      style={[
        styles.container,
        useSafeArea && { paddingTop: insets.top },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
});
