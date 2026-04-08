import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Dimensions,
  Modal,
  Platform,
  Image as RNImage,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCoach } from "@/coach/context/CoachContext";
import { Colors, Backgrounds, Spacing, BorderRadius, Typography, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl, buildPhotoUrl } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PANEL_WIDTH = Math.min(SCREEN_WIDTH * 0.85, 340);

interface CoachStatusPanelProps {
  visible: boolean;
  onClose: () => void;
  onNavigate?: (screen: string) => void;
}

interface Academy {
  id: string;
  name: string;
}

interface CoachMembership {
  id: string;
  coachId: string;
  academyId: string;
  role: string;
  isActive: boolean;
  academy: { id: string; name: string; slug: string; isFreelance?: boolean } | null;
}

export function CoachStatusPanel({ visible, onClose, onNavigate }: CoachStatusPanelProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach, academy, focusMode, setFocusMode } = useCoach();
  const [shouldRender, setShouldRender] = useState(visible);
  const [showAcademyPicker, setShowAcademyPicker] = useState(false);
  
  const slideAnim = useSharedValue(PANEL_WIDTH);
  const overlayOpacity = useSharedValue(0);
  const academyPickerHeight = useSharedValue(0);
  const academyPickerOpacity = useSharedValue(0);
  
  const { data: academies = [] } = useQuery<CoachMembership[]>({
    queryKey: ["/api/coach/academies"],
    enabled: !!coach?.id,
  });
  
  const activeAcademies = academies
    .filter((m) => m.isActive && m.academy)
    .sort((a, b) => {
      if (a.academy?.isFreelance && !b.academy?.isFreelance) return -1;
      if (!a.academy?.isFreelance && b.academy?.isFreelance) return 1;
      return 0;
    });
  
  const collapseAcademyPicker = () => {
    setShowAcademyPicker(false);
    academyPickerHeight.value = withSpring(0, { damping: 20, stiffness: 200 });
    academyPickerOpacity.value = withTiming(0, { duration: 150 });
  };

  const handleSwitchAcademy = async (academyId: string) => {
    if (academyId === academy?.id) {
      collapseAcademyPicker();
      return;
    }
    try {
      await apiRequest("POST", "/api/coach/switch-academy", { academyId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      collapseAcademyPicker();
      queryClient.invalidateQueries();
    } catch (error) {
      console.error("Failed to switch academy:", error);
    }
  };
  
  const { data: coachXpData } = useQuery<{
    level: number;
    totalXp: number;
    currentLevelXp: number;
    requiredForLevel: number;
    xpPercent: number;
  }>({
    queryKey: ["/api/coach", coach?.id, "xp"],
    enabled: !!coach?.id,
  });

  const { data: coachStats } = useQuery<{
    sessionsCount: number;
    playersCount: number;
    streak: number;
    totalSessionsScheduled: number;
  }>({
    queryKey: ["/api/coach", coach?.id, "stats"],
    enabled: !!coach?.id,
  });

  const { data: freelanceData } = useQuery<{
    hasFreelanceLicense: boolean;
    freelanceAcademy: { id: string; name: string } | null;
    profile: { businessName: string | null; slug: string | null } | null;
  }>({
    queryKey: ["/api/coach/freelance-profile"],
    enabled: !!coach?.id,
  });

  const coachXP = React.useMemo(() => {
    if (coachXpData) {
      return {
        level: coachXpData.level,
        currentXP: coachXpData.currentLevelXp,
        requiredXP: coachXpData.requiredForLevel,
        xpPercent: coachXpData.xpPercent,
        totalXP: coachXpData.totalXp,
      };
    }
    const level = coach?.level || 1;
    const totalXp = coach?.totalXp || 0;
    let accumulatedXp = 0;
    for (let lvl = 1; lvl < level; lvl++) {
      accumulatedXp += 500 + (lvl - 1) * 100;
    }
    const requiredXP = 500 + (level - 1) * 100;
    const currentXP = Math.max(0, totalXp - accumulatedXp);
    const xpPercent = Math.min(100, Math.max(0, requiredXP > 0 ? Math.round((currentXP / requiredXP) * 100) : 0));
    return { level, currentXP, requiredXP, xpPercent, totalXP: totalXp };
  }, [coachXpData, coach?.level, coach?.totalXp]);

  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      slideAnim.value = withSpring(0, { damping: 20, stiffness: 200 });
      overlayOpacity.value = withTiming(1, { duration: 200 });
    } else {
      slideAnim.value = withSpring(PANEL_WIDTH, { damping: 20, stiffness: 200 });
      overlayOpacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(setShouldRender)(false);
      });
    }
  }, [visible]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideAnim.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const academyPickerStyle = useAnimatedStyle(() => ({
    maxHeight: academyPickerHeight.value,
    opacity: academyPickerOpacity.value,
    overflow: "hidden" as const,
  }));

  const toggleAcademyPicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isOpening = !showAcademyPicker;
    setShowAcademyPicker(isOpening);
    
    const targetHeight = isOpening ? activeAcademies.length * 56 : 0;
    academyPickerHeight.value = withSpring(targetHeight, { damping: 20, stiffness: 200 });
    academyPickerOpacity.value = withTiming(isOpening ? 1 : 0, { duration: 150 });
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    slideAnim.value = withSpring(PANEL_WIDTH, { damping: 20, stiffness: 200 });
    overlayOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(onClose, 200);
  };

  const handleFocusModeToggle = (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFocusMode(value);
  };

  const handleMenuPress = (action: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onNavigate) {
      onNavigate(action);
    }
    handleClose();
  };

  const getLevelTitle = (level: number) => {
    if (level >= 50) return "Master Coach";
    if (level >= 40) return "Elite Coach";
    if (level >= 30) return "Expert Coach";
    if (level >= 20) return "Senior Coach";
    if (level >= 10) return "Coach";
    if (level >= 5) return "Assistant Coach";
    return "Rookie Coach";
  };

  if (!shouldRender) return null;

  return (
    <Modal transparent visible={shouldRender} animationType="none" onRequestClose={handleClose}>
      <View style={styles.container}>
        <Animated.View style={[styles.overlay, overlayStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View style={[styles.panel, panelStyle, { paddingTop: insets.top }]}>
          <LinearGradient
            colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.panelContent}>
            <View style={styles.header}>
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={Colors.dark.tabIconDefault} />
              </Pressable>
              <Text style={styles.panelTitle}>STATUS</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView 
              style={styles.scrollView}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Spacing.xl }]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.profileSection}>
                <View style={styles.avatarContainer}>
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                    style={styles.avatarGradient}
                  >
                    {coach?.photoUrl ? (
                      Platform.OS === 'web' ? (
                        <RNImage
                          source={{ uri: buildPhotoUrl(coach.photoUrl)! }}
                          style={styles.avatarImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Image
                          source={{ uri: buildPhotoUrl(coach.photoUrl)! }}
                          style={styles.avatarImage}
                          contentFit="cover"
                        />
                      )
                    ) : (
                      <View style={styles.avatarInner}>
                        <Ionicons name="person" size={32} color={Colors.dark.primary} />
                      </View>
                    )}
                  </LinearGradient>
                  <View style={styles.levelBadgeContainer}>
                    <Text style={styles.levelBadge}>{coachXP.level}</Text>
                  </View>
                </View>
                
                <Text style={styles.coachName}>{coach?.name || "Coach"}</Text>
                <Text style={styles.coachTitle}>{getLevelTitle(coachXP.level)}</Text>
              </View>

              <View style={styles.xpSection}>
                <View style={styles.xpHeader}>
                  <Text style={styles.xpLabel}>EXPERIENCE</Text>
                  <Text style={styles.xpTotal}>{coachXP.totalXP?.toLocaleString() || 0} XP</Text>
                </View>
                <View style={styles.xpBarContainer}>
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.xpCyan]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.xpBarFill, { width: `${coachXP.xpPercent}%` }]}
                  />
                </View>
                <View style={styles.xpProgress}>
                  <Text style={styles.xpProgressText}>
                    {coachXP.currentXP} / {coachXP.requiredXP} to Level {coachXP.level + 1}
                  </Text>
                </View>
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Ionicons name="calendar" size={20} color={Colors.dark.primary} />
                  <Text style={styles.statValue}>{coachStats?.sessionsCount ?? "--"}</Text>
                  <Text style={styles.statLabel}>Sessions</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="people" size={20} color={Colors.dark.xpCyan} />
                  <Text style={styles.statValue}>{coachStats?.playersCount ?? "--"}</Text>
                  <Text style={styles.statLabel}>Players</Text>
                </View>
                <View style={styles.statCard}>
                  <Ionicons name="trending-up" size={20} color={Colors.dark.gold} />
                  <Text style={styles.statValue}>{coachStats?.streak ?? 0}</Text>
                  <Text style={styles.statLabel}>Streak</Text>
                </View>
              </View>

              {activeAcademies.length > 1 ? (
                <View style={styles.settingsSection}>
                  <Text style={styles.sectionTitle}>ACADEMY</Text>
                  <Pressable 
                    style={styles.academySwitcherButton}
                    onPress={toggleAcademyPicker}
                  >
                    <View style={[styles.settingIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                      <Ionicons name="business-outline" size={20} color={Colors.dark.xpCyan} />
                    </View>
                    <View style={styles.academySwitcherInfo}>
                      <Text style={styles.menuLabel}>{academy?.name || "Select Academy"}</Text>
                      <Text style={styles.academySwitcherSubtext}>{activeAcademies.length} academies</Text>
                    </View>
                    <Ionicons 
                      name={showAcademyPicker ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color={Colors.dark.tabIconDefault} 
                    />
                  </Pressable>
                  
                  <Animated.View style={[styles.academyPickerList, academyPickerStyle]}>
                    {activeAcademies.map((membership) => (
                      <Pressable
                        key={membership.id}
                        style={[
                          styles.academyPickerItem,
                          membership.academyId === academy?.id && styles.academyPickerItemActive,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          handleSwitchAcademy(membership.academyId);
                        }}
                      >
                        <View style={[
                          styles.academyPickerIcon,
                          membership.academyId === academy?.id && styles.academyPickerIconActive,
                          membership.academy?.isFreelance && styles.academyPickerIconFreelance,
                        ]}>
                          {membership.academy?.isFreelance ? (
                            <Ionicons name="ribbon" size={16} color={Colors.dark.primary} />
                          ) : (
                            <Text style={styles.academyPickerInitial}>
                              {membership.academy?.name?.charAt(0).toUpperCase() || "A"}
                            </Text>
                          )}
                        </View>
                        <View style={styles.academyPickerTextContainer}>
                          <View style={styles.academyPickerNameRow}>
                            <Text style={[
                              styles.academyPickerName,
                              membership.academyId === academy?.id && styles.academyPickerNameActive,
                            ]}>
                              {membership.academy?.name || "Academy"}
                            </Text>
                            {membership.academy?.isFreelance ? (
                              <View style={styles.freelancePickerBadge}>
                                <Text style={styles.freelancePickerBadgeText}>FREELANCE</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        {membership.academyId === academy?.id ? (
                          <Ionicons name="checkmark-circle" size={18} color={Colors.dark.primary} />
                        ) : null}
                      </Pressable>
                    ))}
                  </Animated.View>
                </View>
              ) : null}

              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>COACH SETTINGS</Text>

                <View style={styles.settingItem}>
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIcon, { backgroundColor: Colors.dark.primary + "20" }]}>
                      <Ionicons name="eye-off-outline" size={20} color={Colors.dark.primary} />
                    </View>
                    <View>
                      <Text style={styles.settingLabel}>Focus Mode</Text>
                      <Text style={styles.settingDescription}>Hide notifications on court</Text>
                    </View>
                  </View>
                  <Switch
                    value={focusMode}
                    onValueChange={handleFocusModeToggle}
                    trackColor={{ false: Colors.dark.backgroundTertiary, true: Colors.dark.primary + "60" }}
                    thumbColor={focusMode ? Colors.dark.primary : Colors.dark.tabIconDefault}
                  />
                </View>

                <Pressable 
                  style={styles.menuItem}
                  onPress={() => handleMenuPress("Availability")}
                >
                  <View style={[styles.settingIcon, { backgroundColor: Colors.dark.xpCyan + "20" }]}>
                    <Ionicons name="time-outline" size={20} color={Colors.dark.xpCyan} />
                  </View>
                  <Text style={styles.menuLabel}>Availability</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
                </Pressable>

                <Pressable 
                  style={styles.menuItem}
                  onPress={() => handleMenuPress("Notifications")}
                >
                  <View style={[styles.settingIcon, { backgroundColor: Colors.dark.gold + "20" }]}>
                    <Ionicons name="notifications-outline" size={20} color={Colors.dark.gold} />
                  </View>
                  <Text style={styles.menuLabel}>Notifications</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
                </Pressable>

                <Pressable 
                  style={styles.menuItem}
                  onPress={() => handleMenuPress("CourtPreferences")}
                >
                  <View style={[styles.settingIcon, { backgroundColor: Colors.dark.orange + "20" }]}>
                    <Ionicons name="tennisball-outline" size={20} color={Colors.dark.orange} />
                  </View>
                  <Text style={styles.menuLabel}>Court Preferences</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
                </Pressable>

                <Pressable 
                  style={styles.menuItem}
                  onPress={() => handleMenuPress("CoachProfile")}
                >
                  <View style={[styles.settingIcon, { backgroundColor: Colors.dark.diamondSilver + "20" }]}>
                    <Ionicons name="person-outline" size={20} color={Colors.dark.diamondSilver} />
                  </View>
                  <Text style={styles.menuLabel}>Edit Profile</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.tabIconDefault} />
                </Pressable>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.sectionTitle}>FREELANCE LICENSE</Text>
                
                <Pressable 
                  style={styles.freelanceCard}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleMenuPress("FreelanceLicense");
                  }}
                >
                  <LinearGradient
                    colors={freelanceData?.hasFreelanceLicense 
                      ? [Colors.dark.primary + "30", Colors.dark.xpCyan + "20"]
                      : [Colors.dark.backgroundTertiary, Colors.dark.backgroundSecondary]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.freelanceCardGradient}
                  >
                    <View style={styles.freelanceCardContent}>
                      <View style={[
                        styles.freelanceIconContainer,
                        freelanceData?.hasFreelanceLicense && styles.freelanceIconActive
                      ]}>
                        <Ionicons 
                          name={freelanceData?.hasFreelanceLicense ? "ribbon" : "ribbon-outline"} 
                          size={24} 
                          color={freelanceData?.hasFreelanceLicense ? Colors.dark.primary : Colors.dark.tabIconDefault} 
                        />
                      </View>
                      <View style={styles.freelanceTextContainer}>
                        <Text style={styles.freelanceTitle}>
                          {freelanceData?.hasFreelanceLicense ? "Freelance Active" : "Go Freelance"}
                        </Text>
                        <Text style={styles.freelanceSubtitle}>
                          {freelanceData?.hasFreelanceLicense 
                            ? freelanceData?.profile?.businessName || "Your personal brand"
                            : "Create your own academy"
                          }
                        </Text>
                      </View>
                      <View style={[
                        styles.freelanceStatusBadge,
                        freelanceData?.hasFreelanceLicense ? styles.freelanceStatusActive : styles.freelanceStatusInactive
                      ]}>
                        <Text style={[
                          styles.freelanceStatusText,
                          freelanceData?.hasFreelanceLicense && styles.freelanceStatusTextActive
                        ]}>
                          {freelanceData?.hasFreelanceLicense ? "ACTIVE" : "INACTIVE"}
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                </Pressable>
              </View>

              <Pressable 
                style={styles.logoutButton}
                onPress={() => handleMenuPress("Logout")}
              >
                <Ionicons name="log-out-outline" size={20} color={Colors.dark.error} />
                <Text style={styles.logoutText}>Log Out</Text>
              </Pressable>

              <Text style={styles.versionText}>Coach App v1.0.0</Text>
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  panel: {
    width: PANEL_WIDTH,
    height: "100%",
    borderTopLeftRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.lg,
    overflow: "hidden",
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 20,
  },
  panelContent: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  panelTitle: {
    ...Typography.caption,
    color: Colors.dark.primary,
    letterSpacing: 2,
    fontWeight: "700",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  
  profileSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarContainer: {
    position: "relative",
    marginBottom: Spacing.md,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: Colors.dark.backgroundDefault,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: 74,
    height: 74,
    borderRadius: 37,
  },
  levelBadgeContainer: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.dark.backgroundSecondary,
  },
  levelBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  coachName: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  coachTitle: {
    ...Typography.small,
    color: Colors.dark.primary,
    opacity: 0.9,
  },
  
  xpSection: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "20",
  },
  xpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  xpLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
  },
  xpTotal: {
    ...Typography.small,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
  xpBarContainer: {
    height: 8,
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: Spacing.sm,
  },
  xpBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  xpProgress: {
    alignItems: "center",
  },
  xpProgressText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  
  statsGrid: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    alignItems: "center",
    gap: Spacing.xs,
  },
  statValue: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  statLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  
  settingsSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    letterSpacing: 1,
    marginBottom: Spacing.md,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  settingLabel: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  settingDescription: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  menuLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.dark.error + "40",
    marginBottom: Spacing.lg,
  },
  logoutText: {
    ...Typography.body,
    color: Colors.dark.error,
    fontWeight: "500",
  },
  
  versionText: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    opacity: 0.5,
  },
  
  academySwitcherButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  academySwitcherInfo: {
    flex: 1,
  },
  academySwitcherSubtext: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  academyPickerList: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  academyPickerItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  academyPickerItemActive: {
    backgroundColor: Colors.dark.primary + "15",
  },
  academyPickerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  academyPickerIconActive: {
    backgroundColor: Colors.dark.primary + "30",
  },
  academyPickerInitial: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  academyPickerName: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  academyPickerNameActive: {
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  academyPickerIconFreelance: {
    backgroundColor: Colors.dark.primary + "20",
  },
  academyPickerTextContainer: {
    flex: 1,
  },
  academyPickerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  freelancePickerBadge: {
    backgroundColor: Colors.dark.primary + "25",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  freelancePickerBadgeText: {
    fontSize: 8,
    fontWeight: "700",
    color: Colors.dark.primary,
    letterSpacing: 0.5,
  },
  
  freelanceCard: {
    borderRadius: BorderRadius.md,
    overflow: "hidden",
  },
  freelanceCardGradient: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  freelanceCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  freelanceIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.backgroundTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  freelanceIconActive: {
    backgroundColor: Colors.dark.primary + "25",
  },
  freelanceTextContainer: {
    flex: 1,
  },
  freelanceTitle: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  freelanceSubtitle: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginTop: 2,
  },
  freelanceStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  freelanceStatusActive: {
    backgroundColor: Colors.dark.primary + "25",
  },
  freelanceStatusInactive: {
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  freelanceStatusText: {
    ...Typography.caption,
    fontWeight: "700",
    letterSpacing: 1,
    color: Colors.dark.tabIconDefault,
  },
  freelanceStatusTextActive: {
    color: Colors.dark.primary,
  },
});
