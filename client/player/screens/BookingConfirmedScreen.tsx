import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  Platform,
  Share,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getBallLevelAccentColor } from "@/coach/components/calendar/calendarUtils";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type BookingConfirmedParams = {
  BookingConfirmed: {
    sessionType: string;
    dateStr: string;
    timeStr: string;
    coachName?: string;
    coachPhotoUrl?: string;
    coachWelcomeMessage?: string;
    durationMinutes?: number;
    locationName?: string;
    focusArea?: string;
    courtLocation?: string | null;
    sessionId?: string;
    ballLevel?: string;
  };
};

interface SessionCourtInfo {
  id: string;
  date: string;
  time: string;
  coachName: string;
  locationName?: string | null;
  courtLocation?: string | null;
}

interface CourtBookingStatus {
  id?: string;
  status?: "pending" | "confirmed" | "rejected";
  anyPlayerUploaded?: boolean;
  uploadedByName?: string | null;
}

function Particle({ delay, x, color }: { delay: number; x: number; color: string }) {
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const endY = SCREEN_H * 0.7;
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(y, {
          toValue: endY,
          duration: 1800 + Math.random() * 800,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 600, delay: 1000, useNativeDriver: true }),
        ]),
        Animated.spring(scale, {
          toValue: 0.6 + Math.random() * 0.8,
          useNativeDriver: true,
          damping: 8,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: x,
          backgroundColor: color,
          transform: [{ translateY: y }, { scale }],
          opacity,
        },
      ]}
    />
  );
}

const CONFETTI_COLORS = [
  Colors.dark.primary,
  "#A855F7",
  "#3B82F6",
  "#EC4899",
  "#F97316",
  "#22C55E",
  "#EAB308",
];

export default function BookingConfirmedScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<BookingConfirmedParams, "BookingConfirmed">>();

  const {
    sessionType,
    dateStr,
    timeStr,
    coachName,
    coachPhotoUrl,
    coachWelcomeMessage,
    durationMinutes,
    locationName,
    focusArea,
    courtLocation: courtLocationParam,
    sessionId,
    ballLevel,
  } = route.params ?? {};

  // Derive ball-level accent color (red/orange/green/yellow → matching hex).
  // Falls back to the academy primary when no level is set.
  const levelColor = getBallLevelAccentColor(ballLevel) ?? Colors.dark.primary;

  const [courtSkipped, setCourtSkipped] = useState(false);

  const checkAnim = useRef(new Animated.Value(0)).current;
  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(30)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    Animated.sequence([
      Animated.spring(checkAnim, { toValue: 1, damping: 10, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(titleAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(cardAnim, { toValue: 0, useNativeDriver: true, damping: 14 }),
      ]),
    ]).start();
  }, []);

  // Fetch session court info when sessionId is available but courtLocation not in params
  const { data: sessionCourtInfo } = useQuery<SessionCourtInfo | null>({
    queryKey: [`/api/player/me/session/${sessionId}/court-booking`],
    enabled: !!sessionId && !courtLocationParam,
  });

  // Fetch court booking confirmation status (includes anyPlayerUploaded for group coverage)
  const { data: courtBookingStatus } = useQuery<CourtBookingStatus | null>({
    queryKey: [`/api/player/sessions/${sessionId}/court-booking-confirmation`],
    enabled: !!sessionId,
  });

  // Resolve courtLocation from params or fetched session info
  const courtLocation = courtLocationParam ?? sessionCourtInfo?.courtLocation ?? null;

  const sessionTypeLabel =
    sessionType === "private"
      ? "Private Lesson"
      : sessionType === "semi_private"
      ? "Semi-Private Lesson"
      : sessionType === "group"
      ? "Group Session"
      : "Lesson";

  const particles = Array.from({ length: 22 }, (_, i) => ({
    x: Math.random() * SCREEN_W,
    delay: i * 80,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));

  const handleShare = async () => {
    try {
      const msg = `Just booked a ${sessionTypeLabel} on ${dateStr} at ${timeStr}${coachName ? ` with ${coachName}` : ""}. See you on the court!`;
      await Share.share({ message: msg });
    } catch { /* non-fatal */ }
  };

  const handleUploadCourt = () => {
    if (!sessionId) return;
    navigation.navigate("CourtBookingConfirmation", { sessionId });
  };

  // Group coverage: another player has already uploaded a booking for this court
  const isCoveredByOtherPlayer =
    !!courtBookingStatus?.anyPlayerUploaded && !!courtBookingStatus.uploadedByName;
  const coveredByName = courtBookingStatus?.uploadedByName ?? null;

  // Current player already has a record (uploaded themselves)
  const playerAlreadyUploaded =
    !!courtBookingStatus?.id &&
    (courtBookingStatus.status === "pending" || courtBookingStatus.status === "confirmed");

  const showCourtCard = !!courtLocation && !!sessionId && !courtSkipped;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.background]}
        style={StyleSheet.absoluteFill}
      />

      {/* Confetti particles */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map((p, i) => (
          <Particle key={i} x={p.x} delay={p.delay} color={p.color} />
        ))}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Coach photo or check mark hero */}
        <Animated.View style={[styles.checkWrap, { transform: [{ scale: checkAnim }] }]}>
          {coachPhotoUrl ? (
            <View style={styles.coachPhotoContainer}>
              <Image
                source={{ uri: coachPhotoUrl }}
                style={[styles.coachPhoto, { borderColor: levelColor }]}
                contentFit="cover"
              />
              <View style={styles.coachPhotoCheck}>
                <Ionicons name="checkmark-circle" size={32} color={levelColor} />
              </View>
            </View>
          ) : (
            <LinearGradient
              colors={[levelColor + "40", levelColor + "10"]}
              style={styles.checkGradient}
            >
              <View style={styles.checkRing}>
                <Ionicons name="checkmark-circle" size={72} color={levelColor} />
              </View>
            </LinearGradient>
          )}
        </Animated.View>

        {/* Title */}
        <Animated.View style={{ opacity: titleAnim }}>
          <Text style={styles.title}>Booking Confirmed!</Text>
          <Text style={styles.subtitle}>{sessionTypeLabel} is on the books</Text>
        </Animated.View>

        {/* Details card — border tinted by ball-level colour */}
        <Animated.View
          style={[
            styles.detailsCard,
            { opacity: cardOpacity, transform: [{ translateY: cardAnim }], borderColor: levelColor + "40" },
          ]}
        >
          <View style={styles.detailRow}>
            <Ionicons name="calendar" size={20} color={levelColor} />
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>{dateStr}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Ionicons name="time" size={20} color={levelColor} />
            <Text style={styles.detailLabel}>Time</Text>
            <Text style={styles.detailValue}>{timeStr}</Text>
          </View>
          {durationMinutes ? (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Ionicons name="hourglass" size={20} color={levelColor} />
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>{durationMinutes} min</Text>
              </View>
            </>
          ) : null}
          {coachName ? (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Ionicons name="person" size={20} color={levelColor} />
                <Text style={styles.detailLabel}>Coach</Text>
                <Text style={styles.detailValue}>{coachName}</Text>
              </View>
            </>
          ) : null}
          {locationName ? (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Ionicons name="location" size={20} color={levelColor} />
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>{locationName}</Text>
              </View>
            </>
          ) : null}
          {focusArea ? (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Ionicons name="tennisball" size={20} color={levelColor} />
                <Text style={styles.detailLabel}>Focus</Text>
                <Text style={styles.detailValue}>{focusArea}</Text>
              </View>
            </>
          ) : null}
        </Animated.View>

        {/* Coach welcome message */}
        {coachWelcomeMessage ? (
          <Animated.View style={[styles.welcomeCard, { opacity: cardOpacity }]}>
            <View style={styles.welcomeRow}>
              <Ionicons name="chatbubble-ellipses" size={16} color={Colors.dark.primary} />
              <Text style={styles.welcomeFrom}>Message from your coach</Text>
            </View>
            <Text style={styles.welcomeText}>{coachWelcomeMessage}</Text>
          </Animated.View>
        ) : null}

        {/* Court booking prompt — only when series requires external court booking */}
        {showCourtCard ? (
          <Animated.View style={[styles.courtCard, { opacity: cardOpacity }]}>
            {isCoveredByOtherPlayer ? (
              /* Group coverage: someone else already booked the court */
              <>
                <View style={styles.courtCardHeader}>
                  <View style={styles.courtCoveredIcon}>
                    <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                  </View>
                  <Text style={styles.courtCardTitleCovered}>Court already booked</Text>
                </View>
                <Text style={styles.courtCardBody}>
                  {`${coveredByName} has uploaded a booking for this court. You're all set.`}
                </Text>
              </>
            ) : playerAlreadyUploaded ? (
              /* Current player already uploaded */
              <>
                <View style={styles.courtCardHeader}>
                  <View style={styles.courtUploadedIcon}>
                    <Ionicons name="checkmark-circle" size={20} color="#F59E0B" />
                  </View>
                  <Text style={styles.courtCardTitle}>Court screenshot submitted</Text>
                </View>
                <Text style={styles.courtCardBody}>
                  Your booking screenshot is pending coach review.
                </Text>
              </>
            ) : (
              /* Not yet booked — prompt to upload */
              <>
                <View style={styles.courtCardHeader}>
                  <Ionicons name="alert-circle-outline" size={20} color="#F59E0B" />
                  <Text style={styles.courtCardTitle}>Book your court</Text>
                </View>
                <Text style={styles.courtCardVenue}>{courtLocation}</Text>
                <Text style={styles.courtCardBody}>
                  {`Book your court via the venue's booking app, then upload your confirmation screenshot here.`}
                </Text>

                <Pressable style={styles.uploadBtn} onPress={handleUploadCourt}>
                  <Ionicons name="cloud-upload-outline" size={16} color="#000" />
                  <Text style={styles.uploadBtnText}>Upload Screenshot</Text>
                </Pressable>

                <Pressable
                  style={styles.skipBtn}
                  onPress={() => setCourtSkipped(true)}
                >
                  <Text style={styles.skipBtnText}>Skip for now</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        ) : courtSkipped && courtLocation ? (
          <Animated.View style={[styles.skippedNote, { opacity: cardOpacity }]}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.dark.textMuted} />
            <Text style={styles.skippedNoteText}>
              {"We'll remind you 3 days before the session."}
            </Text>
          </Animated.View>
        ) : null}

        {/* Action buttons */}
        <Animated.View style={[styles.actions, { opacity: cardOpacity }]}>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => navigation.navigate("PlayerHome")}
          >
            <LinearGradient
              colors={[Colors.dark.primary, Colors.dark.primary + "CC"]}
              style={styles.primaryBtnGradient}
            >
              <Text style={styles.primaryBtnText}>Back to Home</Text>
            </LinearGradient>
          </Pressable>

          <View style={styles.rowButtons}>
            <Pressable
              style={[styles.secondaryBtn, { flex: 1 }]}
              onPress={() => navigation.navigate("MyLessonRequests")}
            >
              <Text style={styles.secondaryBtnText}>My Bookings</Text>
            </Pressable>
            <Pressable
              style={[styles.shareBtn]}
              onPress={handleShare}
            >
              <Ionicons name="share-outline" size={20} color={Colors.dark.textSecondary || Colors.dark.text} />
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  particle: {
    position: "absolute",
    top: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  checkWrap: {
    alignItems: "center",
  },
  checkGradient: {
    borderRadius: 70,
    padding: 16,
  },
  checkRing: {
    alignItems: "center",
    justifyContent: "center",
  },
  coachPhotoContainer: {
    position: "relative",
    width: 100,
    height: 100,
  },
  coachPhoto: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: Colors.dark.primary,
  },
  coachPhotoCheck: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: Colors.dark.text,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary || Colors.dark.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
  detailsCard: {
    width: "100%",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "25",
    gap: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  detailLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.textMuted,
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 14,
    color: Colors.dark.text,
    fontWeight: "700",
    textAlign: "right",
    flex: 1.5,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.dark.border || Colors.dark.primary + "15",
  },
  welcomeCard: {
    width: "100%",
    backgroundColor: (Colors.dark.primary) + "10",
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: (Colors.dark.primary) + "30",
    gap: Spacing.xs,
  },
  welcomeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  welcomeFrom: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  welcomeText: {
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
    fontStyle: "italic",
  },
  // Court booking card
  courtCard: {
    width: "100%",
    backgroundColor: "#F59E0B10",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "#F59E0B40",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  courtCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  courtCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#F59E0B",
  },
  courtCardTitleCovered: {
    fontSize: 14,
    fontWeight: "700",
    color: "#22C55E",
  },
  courtCoveredIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  courtUploadedIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  courtCardVenue: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  courtCardBody: {
    fontSize: 13,
    color: Colors.dark.textSecondary || Colors.dark.textMuted,
    lineHeight: 18,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "#F59E0B",
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    marginTop: 2,
  },
  uploadBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#000",
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  skipBtnText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textDecorationLine: "underline",
  },
  skippedNote: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  skippedNoteText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    fontStyle: "italic",
  },
  actions: {
    width: "100%",
    gap: Spacing.sm,
  },
  primaryBtn: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  primaryBtnGradient: {
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.buttonText || "#000",
  },
  rowButtons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border || Colors.dark.primary + "30",
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.dark.textSecondary || Colors.dark.text,
  },
  shareBtn: {
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border || Colors.dark.primary + "30",
  },
}));
