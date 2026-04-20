import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetwork } from "@/context/NetworkContext";
import { Colors, Spacing, Typography } from "@/constants/theme";
import { makeReactiveStyles } from "@/hooks/useThemedStyles";

const theme = Colors.dark;

export default function OfflineBanner() {
  const { isOffline } = useNetwork();
  const insets = useSafeAreaInsets();

  if (!isOffline) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.xs }]}>
      <View style={styles.content}>
        <Feather name="wifi-off" size={16} color={theme.accentWarning} />
        <Text style={styles.text}>
          Offline mode is not supported yet. Please reconnect to save changes.
        </Text>
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 215, 0, 0.3)",
    zIndex: 1000,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  text: {
    ...Typography.small,
    color: theme.accentWarning,
    textAlign: "center",
    flex: 1,
  },
}));
