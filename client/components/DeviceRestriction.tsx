import React, { useEffect, useState, ReactNode } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import * as Device from "expo-device";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Colors, Spacing, BorderRadius, Typography } from "@/constants/theme";

interface DeviceRestrictionProps {
  children: ReactNode;
}

export function DeviceRestriction({ children }: DeviceRestrictionProps) {
  const [isTablet, setIsTablet] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkDevice = async () => {
      try {
        if (Platform.OS === "web") {
          const { width, height } = Dimensions.get("window");
          const aspectRatio = width / height;
          const isLargeScreen = width > 768 || height > 1024;
          setIsTablet(false);
          setIsChecking(false);
          return;
        }

        const deviceType = await Device.getDeviceTypeAsync();
        const isTabletDevice = deviceType === Device.DeviceType.TABLET;
        
        setIsTablet(isTabletDevice);
        setIsChecking(false);
      } catch (error) {
        console.log("Device check error:", error);
        setIsChecking(false);
      }
    };

    checkDevice();
  }, []);

  if (isChecking) {
    return null;
  }

  if (isTablet) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={["#0A0A0A", "#1A1A1A"]}
          style={StyleSheet.absoluteFillObject}
        />
        
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons name="phone-portrait-outline" size={80} color={Colors.dark.primary} />
          </View>
          
          <Text style={styles.title}>Phone Only</Text>
          
          <Text style={styles.subtitle}>
            Glow Up Sports is designed for mobile phones only
          </Text>
          
          <View style={styles.instructionCard}>
            <Ionicons name="information-circle" size={24} color={Colors.dark.xpCyan} />
            <Text style={styles.instructionText}>
              Please use an iPhone or Android phone to access this app. Tablets and iPads are not supported.
            </Text>
          </View>
          
          <View style={styles.deviceList}>
            <View style={styles.deviceItem}>
              <Ionicons name="logo-apple" size={24} color={Colors.dark.text} />
              <Text style={styles.deviceText}>iPhone</Text>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
            </View>
            <View style={styles.deviceItem}>
              <Ionicons name="logo-android" size={24} color={Colors.dark.text} />
              <Text style={styles.deviceText}>Android Phone</Text>
              <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
            </View>
            <View style={[styles.deviceItem, styles.deviceItemDisabled]}>
              <Ionicons name="tablet-portrait-outline" size={24} color={Colors.dark.textMuted} />
              <Text style={[styles.deviceText, styles.deviceTextDisabled]}>iPad / Tablet</Text>
              <Ionicons name="close-circle" size={20} color={Colors.dark.error} />
            </View>
          </View>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    maxWidth: 400,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.dark.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
    borderWidth: 2,
    borderColor: Colors.dark.primary + "30",
  },
  title: {
    ...Typography.h1,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 24,
  },
  instructionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    backgroundColor: Colors.dark.xpCyan + "10",
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.xpCyan + "30",
  },
  instructionText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
    lineHeight: 22,
  },
  deviceList: {
    width: "100%",
    gap: Spacing.md,
  },
  deviceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  deviceItemDisabled: {
    opacity: 0.6,
    borderColor: Colors.dark.error + "30",
  },
  deviceText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
    fontWeight: "600",
  },
  deviceTextDisabled: {
    color: Colors.dark.textMuted,
  },
});
