import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
  withTiming,
  interpolate,
  Extrapolate,
  runOnJS,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, FontSizes, BorderRadius, Typography } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { useHeaderHeight } from "@react-navigation/elements";
import Slider from "@react-native-community/slider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type MatchType = "singles" | "doubles";
type Step = "type" | "datetime" | "level" | "details" | "success";

const BALL_LEVELS = [
  { id: "blue", label: "Blue", color: "#3B82F6", sublevel: 1 },
  { id: "red", label: "Red", color: "#EF4444", sublevel: 2 },
  { id: "orange", label: "Orange", color: "#F97316", sublevel: 3 },
  { id: "green", label: "Green", color: "#22C55E", sublevel: 4 },
  { id: "yellow", label: "Yellow", color: "#EAB308", sublevel: 5 },
  { id: "glow", label: "Glow", color: Colors.dark.primary, sublevel: 6 },
];

const GLOW_LEVELS = Array.from({ length: 9 }, (_, i) => ({
  level: i + 1,
  label: `GLOW ${i + 1}`,
}));

export default function CreateMatchScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const queryClient = useQueryClient();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<Step>("type");
  const [matchType, setMatchType] = useState<MatchType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>("18:00");
  const [isAdult, setIsAdult] = useState(true);
  const [skillLevelMin, setSkillLevelMin] = useState(1);
  const [skillLevelMax, setSkillLevelMax] = useState(9);
  const [selectedBallLevel, setSelectedBallLevel] = useState<string>("green");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Get player info to determine if adult or kid
  const { data: playerData } = useQuery({
    queryKey: ["/api/player/me/profile"],
  });

  useEffect(() => {
    if (playerData?.player) {
      const ballLevel = playerData.player.ballLevel?.toLowerCase() || "";
      const isPlayerAdult = ballLevel.includes("glow") || ballLevel.includes("adult");
      setIsAdult(isPlayerAdult);
      
      if (!isPlayerAdult) {
        setSelectedBallLevel(ballLevel.split("_")[0] || "green");
      }
    }
  }, [playerData]);

  // Animation values
  const cardScale = useSharedValue(1);
  const singlesScale = useSharedValue(1);
  const doublesScale = useSharedValue(1);
  const progressWidth = useSharedValue(0);
  const celebrationScale = useSharedValue(0);

  // Step progress
  const steps: Step[] = ["type", "datetime", "level", "details", "success"];
  const stepIndex = steps.indexOf(currentStep);

  useEffect(() => {
    progressWidth.value = withSpring((stepIndex / (steps.length - 2)) * 100, {
      damping: 15,
      stiffness: 100,
    });
  }, [currentStep]);

  // Create match mutation
  const createMatchMutation = useMutation({
    mutationFn: async () => {
      const matchData = {
        matchType,
        title: title || `Looking for ${matchType} partner`,
        description,
        requiredLevelMin: isAdult ? skillLevelMin : 1,
        requiredLevelMax: isAdult ? skillLevelMax : 20,
        requiredBallLevel: !isAdult ? selectedBallLevel : null,
        preferredDate: selectedDate.toISOString().split("T")[0],
        preferredTime: selectedTime,
        maxPlayers: matchType === "doubles" ? 4 : 2,
      };
      
      const { getAuthHeaders } = await import("@/lib/auth");
      const res = await fetch(new URL("/api/play/create-match-request", getApiUrl()).toString(), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        body: JSON.stringify(matchData),
      });
      
      if (!res.ok) throw new Error("Failed to create match");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/play/open-matches"] });
      setCurrentStep("success");
      celebrationScale.value = withSequence(
        withTiming(1.2, { duration: 300 }),
        withSpring(1, { damping: 8, stiffness: 100 })
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const handleSelectType = (type: MatchType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const targetScale = type === "singles" ? singlesScale : doublesScale;
    targetScale.value = withSequence(
      withTiming(0.95, { duration: 100 }),
      withSpring(1, { damping: 10, stiffness: 200 })
    );
    setMatchType(type);
    
    setTimeout(() => {
      setCurrentStep("datetime");
    }, 400);
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const stepOrder: Step[] = ["type", "datetime", "level", "details"];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const stepOrder: Step[] = ["type", "datetime", "level", "details"];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    } else {
      navigation.goBack();
    }
  };

  const handlePublish = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    createMatchMutation.mutate();
  };

  const singlesAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: singlesScale.value }],
  }));

  const doublesAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: doublesScale.value }],
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const celebrationAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: celebrationScale.value }],
    opacity: celebrationScale.value,
  }));

  // Date options (next 7 days)
  const dateOptions = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return date;
  });

  // Time slots
  const timeSlots = [
    "06:00", "07:00", "08:00", "09:00", "10:00", "11:00",
    "12:00", "13:00", "14:00", "15:00", "16:00", "17:00",
    "18:00", "19:00", "20:00", "21:00", "22:00",
  ];

  const formatDate = (date: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
      month: months[date.getMonth()],
    };
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      <View style={styles.progressBar}>
        <Animated.View style={[styles.progressFill, progressAnimatedStyle]} />
      </View>
      <View style={styles.stepDots}>
        {["type", "datetime", "level", "details"].map((step, index) => (
          <View
            key={step}
            style={[
              styles.stepDot,
              stepIndex >= index && styles.stepDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );

  const renderTypeStep = () => (
    <Animated.View 
      entering={FadeIn.duration(400)} 
      exiting={FadeOut.duration(200)}
      style={styles.stepContainer}
    >
      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <Text style={styles.stepTitle}>What type of match?</Text>
        <Text style={styles.stepSubtitle}>Choose your game style</Text>
      </Animated.View>

      <View style={styles.typeCards}>
        <Animated.View style={singlesAnimatedStyle}>
          <Pressable
            style={[styles.typeCard, matchType === "singles" && styles.typeCardSelected]}
            onPress={() => handleSelectType("singles")}
          >
            <LinearGradient
              colors={matchType === "singles" ? [Colors.dark.primary, Colors.dark.primaryGlow] : [Colors.dark.backgroundSecondary, Colors.dark.backgroundTertiary]}
              style={styles.typeCardGradient}
            >
              <View style={styles.typeIconContainer}>
                <Ionicons 
                  name="person" 
                  size={48} 
                  color={matchType === "singles" ? Colors.dark.backgroundRoot : Colors.dark.primary} 
                />
              </View>
              <Text style={[styles.typeCardTitle, matchType === "singles" && styles.typeCardTitleSelected]}>
                Singles
              </Text>
              <Text style={[styles.typeCardDesc, matchType === "singles" && styles.typeCardDescSelected]}>
                1 vs 1 match
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        <Animated.View style={doublesAnimatedStyle}>
          <Pressable
            style={[styles.typeCard, matchType === "doubles" && styles.typeCardSelected]}
            onPress={() => handleSelectType("doubles")}
          >
            <LinearGradient
              colors={matchType === "doubles" ? [Colors.dark.xpCyan, "#00A3D9"] : [Colors.dark.backgroundSecondary, Colors.dark.backgroundTertiary]}
              style={styles.typeCardGradient}
            >
              <View style={styles.typeIconContainer}>
                <Ionicons 
                  name="people" 
                  size={48} 
                  color={matchType === "doubles" ? Colors.dark.backgroundRoot : Colors.dark.xpCyan} 
                />
              </View>
              <Text style={[styles.typeCardTitle, matchType === "doubles" && styles.typeCardTitleSelected]}>
                Doubles
              </Text>
              <Text style={[styles.typeCardDesc, matchType === "doubles" && styles.typeCardDescSelected]}>
                2 vs 2 match
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>

      <Animated.View 
        entering={FadeInUp.delay(300).duration(400)}
        style={styles.tipContainer}
      >
        <Ionicons name="bulb" size={20} color={Colors.dark.gold} />
        <Text style={styles.tipText}>Tap a card to select your match type</Text>
      </Animated.View>
    </Animated.View>
  );

  const renderDateTimeStep = () => (
    <Animated.View 
      entering={SlideInRight.duration(300)} 
      exiting={SlideOutLeft.duration(200)}
      style={styles.stepContainer}
    >
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>When do you want to play?</Text>
        <Text style={styles.stepSubtitle}>Pick a date and time</Text>

        <Text style={styles.sectionLabel}>Date</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateScroll}
        >
          {dateOptions.map((date, index) => {
            const formatted = formatDate(date);
            const isSelected = selectedDate.toDateString() === date.toDateString();
            return (
              <Pressable
                key={index}
                style={[styles.dateCard, isSelected && styles.dateCardSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedDate(date);
                }}
              >
                <Text style={[styles.dateDay, isSelected && styles.dateDaySelected]}>
                  {formatted.day}
                </Text>
                <Text style={[styles.dateNumber, isSelected && styles.dateNumberSelected]}>
                  {formatted.date}
                </Text>
                <Text style={[styles.dateMonth, isSelected && styles.dateMonthSelected]}>
                  {formatted.month}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionLabel}>Time</Text>
        <View style={styles.timeGrid}>
          {timeSlots.map((time) => {
            const isSelected = selectedTime === time;
            return (
              <Pressable
                key={time}
                style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedTime(time);
                }}
              >
                <Text style={[styles.timeText, isSelected && styles.timeTextSelected]}>
                  {time}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.bottomActions}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Pressable style={styles.nextButton} onPress={handleNext}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
            style={styles.nextButtonGradient}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
          </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );

  const renderLevelStep = () => (
    <Animated.View 
      entering={SlideInRight.duration(300)} 
      exiting={SlideOutLeft.duration(200)}
      style={styles.stepContainer}
    >
      <Text style={styles.stepTitle}>Skill Level</Text>
      <Text style={styles.stepSubtitle}>
        {isAdult ? "Set your GLOW level range" : "Select ball level"}
      </Text>

      {isAdult ? (
        <View style={styles.levelSliderContainer}>
          <View style={styles.levelRangeDisplay}>
            <View style={styles.levelBadge}>
              <Ionicons name="flash" size={16} color={Colors.dark.primary} />
              <Text style={styles.levelBadgeText}>GLOW {skillLevelMin}</Text>
            </View>
            <View style={styles.levelRangeLine} />
            <View style={styles.levelBadge}>
              <Ionicons name="flash" size={16} color={Colors.dark.primary} />
              <Text style={styles.levelBadgeText}>GLOW {skillLevelMax}</Text>
            </View>
          </View>

          <Text style={styles.sliderLabel}>Minimum Level: {skillLevelMin}</Text>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={9}
            step={1}
            value={skillLevelMin}
            onValueChange={(value) => {
              setSkillLevelMin(value);
              if (value > skillLevelMax) setSkillLevelMax(value);
            }}
            minimumTrackTintColor={Colors.dark.primary}
            maximumTrackTintColor={Colors.dark.border}
            thumbTintColor={Colors.dark.primary}
          />

          <Text style={styles.sliderLabel}>Maximum Level: {skillLevelMax}</Text>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={9}
            step={1}
            value={skillLevelMax}
            onValueChange={(value) => {
              setSkillLevelMax(value);
              if (value < skillLevelMin) setSkillLevelMin(value);
            }}
            minimumTrackTintColor={Colors.dark.xpCyan}
            maximumTrackTintColor={Colors.dark.border}
            thumbTintColor={Colors.dark.xpCyan}
          />
        </View>
      ) : (
        <View style={styles.ballLevelGrid}>
          {BALL_LEVELS.map((ball) => {
            const isSelected = selectedBallLevel === ball.id;
            return (
              <Pressable
                key={ball.id}
                style={[
                  styles.ballLevelCard,
                  isSelected && { borderColor: ball.color, borderWidth: 2 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSelectedBallLevel(ball.id);
                }}
              >
                <View style={[styles.ballIcon, { backgroundColor: ball.color }]}>
                  <Ionicons name="tennisball" size={24} color={Colors.dark.text} />
                </View>
                <Text style={[styles.ballLevelText, isSelected && { color: ball.color }]}>
                  {ball.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.bottomActions}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Pressable style={styles.nextButton} onPress={handleNext}>
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
            style={styles.nextButtonGradient}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.dark.backgroundRoot} />
          </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );

  const renderDetailsStep = () => (
    <Animated.View 
      entering={SlideInRight.duration(300)} 
      exiting={SlideOutLeft.duration(200)}
      style={styles.stepContainer}
    >
      <Text style={styles.stepTitle}>Almost there!</Text>
      <Text style={styles.stepSubtitle}>Add some details (optional)</Text>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Title</Text>
        <TextInput
          style={styles.textInput}
          placeholder={`Looking for ${matchType} partner`}
          placeholderTextColor={Colors.dark.textMuted}
          value={title}
          onChangeText={setTitle}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.inputLabel}>Description</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          placeholder="Any preferences? Competitive or casual? Let others know..."
          placeholderTextColor={Colors.dark.textMuted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Match Summary</Text>
        <View style={styles.summaryRow}>
          <Ionicons name={matchType === "singles" ? "person" : "people"} size={18} color={Colors.dark.primary} />
          <Text style={styles.summaryText}>{matchType === "singles" ? "Singles" : "Doubles"}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Ionicons name="calendar" size={18} color={Colors.dark.xpCyan} />
          <Text style={styles.summaryText}>
            {formatDate(selectedDate).day}, {formatDate(selectedDate).date} {formatDate(selectedDate).month} at {selectedTime}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Ionicons name="fitness" size={18} color={Colors.dark.gold} />
          <Text style={styles.summaryText}>
            {isAdult ? `GLOW ${skillLevelMin} - ${skillLevelMax}` : selectedBallLevel.charAt(0).toUpperCase() + selectedBallLevel.slice(1)}
          </Text>
        </View>
      </View>

      <View style={styles.bottomActions}>
        <Pressable style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Pressable 
          style={styles.publishButton} 
          onPress={handlePublish}
          disabled={createMatchMutation.isPending}
        >
          <LinearGradient
            colors={[Colors.dark.successNeon, "#00C853"]}
            style={styles.nextButtonGradient}
          >
            {createMatchMutation.isPending ? (
              <ActivityIndicator size="small" color={Colors.dark.backgroundRoot} />
            ) : (
              <>
                <Ionicons name="rocket" size={20} color={Colors.dark.backgroundRoot} />
                <Text style={styles.nextButtonText}>Publish Match</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </Animated.View>
  );

  const renderSuccessStep = () => (
    <Animated.View 
      entering={FadeIn.duration(400)}
      style={styles.successContainer}
    >
      <Animated.View style={[styles.celebrationCircle, celebrationAnimatedStyle]}>
        <LinearGradient
          colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
          style={styles.celebrationGradient}
        >
          <Ionicons name="checkmark" size={80} color={Colors.dark.backgroundRoot} />
        </LinearGradient>
      </Animated.View>

      <Animated.Text 
        entering={FadeInUp.delay(200).duration(400)}
        style={styles.successTitle}
      >
        Match Posted!
      </Animated.Text>
      
      <Animated.Text 
        entering={FadeInUp.delay(400).duration(400)}
        style={styles.successSubtitle}
      >
        Other players can now see and join your match. We'll notify you when someone joins!
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(600).duration(400)}>
        <Pressable 
          style={styles.doneButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.goBack();
          }}
        >
          <LinearGradient
            colors={[Colors.dark.primary, Colors.dark.primaryGlow]}
            style={styles.doneButtonGradient}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </LinearGradient>
        </Pressable>

        <Pressable 
          style={styles.viewMatchesButton}
          onPress={() => {
            navigation.navigate("OpenMatches" as never);
          }}
        >
          <Text style={styles.viewMatchesText}>View Open Matches</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { paddingTop: headerHeight }]}>
      <LinearGradient
        colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundSecondary]}
        style={StyleSheet.absoluteFill}
      />

      {currentStep !== "success" && renderStepIndicator()}

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {currentStep === "type" && renderTypeStep()}
        {currentStep === "datetime" && renderDateTimeStep()}
        {currentStep === "level" && renderLevelStep()}
        {currentStep === "details" && renderDetailsStep()}
        {currentStep === "success" && renderSuccessStep()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
  },
  stepIndicator: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.dark.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  stepDots: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.border,
  },
  stepDotActive: {
    backgroundColor: Colors.dark.primary,
  },
  stepContainer: {
    flex: 1,
    paddingTop: Spacing.xl,
  },
  stepTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xl,
  },
  typeCards: {
    flexDirection: "row",
    gap: Spacing.md,
    justifyContent: "center",
  },
  typeCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md) / 2,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  typeCardSelected: {
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  typeCardGradient: {
    padding: Spacing.xl,
    alignItems: "center",
    minHeight: 180,
    justifyContent: "center",
  },
  typeIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  typeCardTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  typeCardTitleSelected: {
    color: Colors.dark.backgroundRoot,
  },
  typeCardDesc: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
  },
  typeCardDescSelected: {
    color: "rgba(0,0,0,0.6)",
  },
  tipContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xl * 2,
    padding: Spacing.md,
    backgroundColor: Colors.dark.gold + "15",
    borderRadius: BorderRadius.md,
  },
  tipText: {
    ...Typography.caption,
    color: Colors.dark.gold,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  dateScroll: {
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  dateCard: {
    width: 60,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  dateCardSelected: {
    backgroundColor: Colors.dark.primary + "20",
    borderColor: Colors.dark.primary,
  },
  dateDay: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: 4,
  },
  dateDaySelected: {
    color: Colors.dark.primary,
  },
  dateNumber: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  dateNumberSelected: {
    color: Colors.dark.primary,
  },
  dateMonth: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  dateMonthSelected: {
    color: Colors.dark.primary,
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  timeChip: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm * 4) / 5,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
  },
  timeChipSelected: {
    backgroundColor: Colors.dark.xpCyan + "20",
    borderColor: Colors.dark.xpCyan,
  },
  timeText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  timeTextSelected: {
    color: Colors.dark.xpCyan,
  },
  bottomActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: "auto",
    paddingTop: Spacing.xl,
  },
  backButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  nextButton: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
  },
  publishButton: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
  },
  nextButtonGradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  nextButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  levelSliderContainer: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  levelRangeDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  levelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.dark.primary + "20",
    borderRadius: BorderRadius.full,
  },
  levelBadgeText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "700",
  },
  levelRangeLine: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.dark.primary + "40",
  },
  sliderLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  slider: {
    width: "100%",
    height: 50,
  },
  ballLevelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    justifyContent: "center",
  },
  ballLevelCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md * 2) / 3,
    padding: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  ballIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  ballLevelText: {
    ...Typography.caption,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  inputContainer: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    ...Typography.label,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.xs,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  summaryCard: {
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  summaryTitle: {
    ...Typography.label,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  summaryText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl * 2,
  },
  celebrationCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: "hidden",
    marginBottom: Spacing.xl,
  },
  celebrationGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    ...Typography.h1,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  successSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl * 2,
    paddingHorizontal: Spacing.lg,
  },
  doneButton: {
    width: SCREEN_WIDTH - Spacing.lg * 4,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: Spacing.md,
  },
  doneButtonGradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButtonText: {
    ...Typography.body,
    color: Colors.dark.backgroundRoot,
    fontWeight: "700",
  },
  viewMatchesButton: {
    padding: Spacing.md,
    alignItems: "center",
  },
  viewMatchesText: {
    ...Typography.body,
    color: Colors.dark.xpCyan,
    fontWeight: "600",
  },
});
