import logger from "@/lib/logger";
import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  ScrollView,
  TextInput,
  Modal,
  Image,
  Platform,
  Alert,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  ZoomIn,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  useSharedValue,
  runOnJS,
} from "react-native-reanimated";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
  CardStyles,
  GlowColors,
  BallLevelColors,
  Shadows,
 Backgrounds, } from "@/constants/theme";
import { apiRequest, getApiUrl, apiFetch } from "@/lib/query-client";
import { saveAuthState, setAuthToken, AuthUser } from "@/lib/auth";
import { useAuth } from "@/coach/context/AuthContext";
import { TshirtSize, childTshirtSizes, adultTshirtSizes } from "@shared/schema";
import { SPORT_DEFINITIONS } from "@/player/context/SportContext";
import * as Localization from "expo-localization";
import * as Location from "expo-location";

const ISO_TO_COUNTRY: Record<string, string> = {
  AE: "United Arab Emirates",
  ID: "Indonesia",
  NL: "Netherlands",
  GB: "United Kingdom",
  US: "United States",
  SA: "Saudi Arabia",
  QA: "Qatar",
  BH: "Bahrain",
  KW: "Kuwait",
  OM: "Oman",
  EG: "Egypt",
  AU: "Australia",
  SG: "Singapore",
  MY: "Malaysia",
  DE: "Germany",
  FR: "France",
  ES: "Spain",
  IT: "Italy",
  BE: "Belgium",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  PL: "Poland",
  IN: "India",
  PK: "Pakistan",
  ZA: "South Africa",
  KE: "Kenya",
  NG: "Nigeria",
  BR: "Brazil",
  AR: "Argentina",
  MX: "Mexico",
  CA: "Canada",
  NZ: "New Zealand",
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type AgeGroup = "kid" | "teen" | "adult";

function getAgeGroup(age: number): AgeGroup {
  if (age < 4) return "kid"; // Toddlers also treated as kids
  if (age >= 4 && age <= 10) return "kid";
  if (age >= 11 && age <= 17) return "teen";
  return "adult";
}

function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function getBallLevel(age: number): { level: string; color: string; description: string; isGlowLevel?: boolean } {
  if (age < 4) {
    return { level: "Blue", color: BallLevelColors.blue, description: "Starting your tennis journey - soft foam fun!" };
  }
  if (age >= 4 && age <= 6) {
    return { level: "Red", color: BallLevelColors.red, description: "Mini court, soft ball - perfect for beginners!" };
  }
  if (age >= 7 && age <= 8) {
    return { level: "Orange", color: BallLevelColors.orange, description: "3/4 court - building your skills!" };
  }
  if (age >= 9 && age <= 10) {
    return { level: "Green", color: BallLevelColors.green, description: "Full court, slower ball - almost there!" };
  }
  if (age >= 11 && age <= 17) {
    return { level: "Yellow", color: BallLevelColors.yellow, description: "Standard ball - you're ready for the real deal!" };
  }
  // Adults (18+) get Glow Level system instead of ball levels
  return { level: "Adult DSS", color: GlowColors.primary, description: "You'll get your Glow Rating after your first assessment session!", isGlowLevel: true };
}

function getBallLevelColor(ballLevel: string): string {
  const level = ballLevel.toLowerCase();
  if (level.includes("blue")) return BallLevelColors.blue;
  if (level.includes("red")) return BallLevelColors.red;
  if (level.includes("orange")) return BallLevelColors.orange;
  if (level.includes("green")) return BallLevelColors.green;
  if (level.includes("yellow")) return BallLevelColors.yellow;
  if (level.includes("glow") || level.includes("adult")) return GlowColors.primary;
  return Colors.dark.primary;
}

type PlayStyleKey = "baseline_warrior" | "net_ninja" | "serve_machine" | "all_court_ace" | "counter_puncher" | "tactical_mastermind";

interface OnboardingData {
  dateOfBirth: string | null;
  gender: string | null;
  profilePhotoUri: string | null;
  ballLevel: string | null;
  selectedSports: string[];
  motivationType: string | null;
  motivationTypes: string[];
  experienceLevel: string | null;
  height: number | null;
  tshirtSize: TshirtSize | null;
  dominantHand: string | null;
  backhandType: string | null;
  tennisIdol: string | null;
  customIdol: string | null;
  enjoymentTags: string[];
  focusGoals: string[];
  typicalPlayTimes: string[];
  academyId: string | null;
  academyName: string | null;
  shortTermGoal: string | null;
  shortTermGoals: string[];
  longTermDream: string | null;
  parentEmail: string | null;
  quizScore: number;
  quizAnswers: string[];
  playStyle: PlayStyleKey | null;
}

interface Academy {
  id: string;
  name: string;
  slug: string;
  coachCount: number;
  playerCount: number;
  city?: string | null;
  country?: string | null;
}

interface AcademyCountry {
  country: string;
  cities: string[];
}

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  playerName?: string;
  age?: number;
  ageGroup?: AgeGroup;
}

const TOTAL_STEPS = 20;

function ProgressBar({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <View style={styles.progressContainer}>
      {Array.from({ length: totalSteps }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.progressDot,
            index <= currentStep ? styles.progressDotActive : null,
            index === currentStep ? styles.progressDotCurrent : null,
          ]}
        />
      ))}
    </View>
  );
}

function ConfettiPiece({ delay, color }: { delay: number; color: string }) {
  const translateY = useSharedValue(-50);
  const translateX = useSharedValue((Math.random() - 0.5) * SCREEN_WIDTH);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const randomX = (Math.random() - 0.5) * 100;
    translateY.value = withSequence(
      withTiming(-50, { duration: 0 }),
      withTiming(SCREEN_HEIGHT + 100, { duration: 2500 + delay })
    );
    translateX.value = withSequence(
      withTiming(translateX.value, { duration: 0 }),
      withTiming(translateX.value + randomX, { duration: 2500 + delay })
    );
    rotate.value = withRepeat(withTiming(360, { duration: 1000 }), -1);
    opacity.value = withSequence(
      withTiming(1, { duration: 500 }),
      withTiming(1, { duration: 1500 }),
      withTiming(0, { duration: 500 })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: 10,
          height: 10,
          backgroundColor: color,
          borderRadius: 2,
        },
        animatedStyle,
      ]}
    />
  );
}

function Confetti() {
  const colors = [GlowColors.primary, "#FF4D4D", "#FFB020", "#00D4FF", "#E040FB", "#FFD700"];
  const pieces = Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    color: colors[i % colors.length],
    delay: Math.random() * 500,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((piece) => (
        <ConfettiPiece key={piece.id} delay={piece.delay} color={piece.color} />
      ))}
    </View>
  );
}

function WelcomeStep({ onNext }: StepProps) {
  const logoScale = useSharedValue(0.8);

  useEffect(() => {
    logoScale.value = withRepeat(
      withSequence(
        withSpring(1.05, { damping: 3 }),
        withSpring(0.95, { damping: 3 })
      ),
      -1,
      true
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <View style={styles.welcomeContainer}>
      <LinearGradient
        colors={["rgba(200, 255, 61, 0.15)", "transparent"]}
        style={styles.welcomeGradient}
      />
      
      <Animated.View entering={ZoomIn.delay(200).springify()} style={[styles.logoContainer, logoStyle]}>
        <Ionicons name="tennisball" size={80} color={GlowColors.primary} />
      </Animated.View>

      <Animated.Text entering={FadeInDown.delay(400).duration(600)} style={styles.welcomeTitle}>
        Welcome to{"\n"}Glow Up Sports!
      </Animated.Text>

      <Animated.Text entering={FadeInDown.delay(600).duration(600)} style={styles.welcomeSubtitle}>
        Your tennis journey starts here. Let's set up your profile and find the perfect training path for you.
      </Animated.Text>

      <Animated.View entering={FadeInUp.delay(800).duration(600)} style={styles.welcomeCTA}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onNext();
          }}
        >
          <Text style={styles.primaryButtonText}>Let's Go!</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </Animated.View>

      <Pressable
        style={styles.skipButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNext();
        }}
      >
        <Text style={styles.skipButtonText}>Skip intro</Text>
      </Pressable>
    </View>
  );
}

function BirthdayStep({ data, setData, onNext, playerName }: StepProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const years = Array.from({ length: 80 }, (_, i) => new Date().getFullYear() - i);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const days = selectedYear !== null && selectedMonth !== null
    ? Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1)
    : [];

  const handleConfirm = () => {
    if (selectedYear !== null && selectedMonth !== null && selectedDay !== null) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;
      setData((prev) => ({ ...prev, dateOfBirth: dateStr }));
      setShowPicker(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const age = data.dateOfBirth ? calculateAge(data.dateOfBirth) : null;
  const ageGroup = age !== null ? getAgeGroup(age) : null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>
          {playerName ? `Hey ${playerName}!` : "Hey there!"}
        </Text>
        <Text style={styles.stepSubtitle}>When's your birthday? This helps us personalize your experience.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)}>
        <Pressable
          style={[styles.datePickerButton, data.dateOfBirth ? styles.datePickerButtonActive : null]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (data.dateOfBirth) {
              const date = new Date(data.dateOfBirth);
              setSelectedYear(date.getFullYear());
              setSelectedMonth(date.getMonth());
              setSelectedDay(date.getDate());
            }
            setShowPicker(true);
          }}
        >
          <Ionicons
            name="calendar-outline"
            size={24}
            color={data.dateOfBirth ? GlowColors.primary : Colors.dark.textMuted}
          />
          <Text style={[styles.datePickerText, data.dateOfBirth ? styles.datePickerTextActive : null]}>
            {data.dateOfBirth ? formatDate(data.dateOfBirth) : "Select your birthday"}
          </Text>
          {age !== null ? (
            <View style={styles.ageBadge}>
              <Text style={styles.ageBadgeText}>{age} years old</Text>
            </View>
          ) : null}
        </Pressable>

        {age !== null && ageGroup ? (
          <Animated.View entering={FadeIn.delay(200)} style={styles.ageGroupCard}>
            <Ionicons
              name={ageGroup === "kid" ? "happy-outline" : ageGroup === "teen" ? "flash-outline" : "person-outline"}
              size={24}
              color={GlowColors.primary}
            />
            <Text style={styles.ageGroupText}>
              {age < 4 ? "Little Champion" : ageGroup === "kid" ? "Junior Player" : ageGroup === "teen" ? "Rising Star" : "Adult Player"}
            </Text>
          </Animated.View>
        ) : null}
      </Animated.View>

      {data.dateOfBirth ? (
        <Animated.View entering={FadeInUp.delay(400).duration(400)} style={styles.birthdayNextContainer}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNext();
            }}
          >
            <Text style={styles.primaryButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
          </Pressable>
        </Animated.View>
      ) : null}

      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)}>
          <Pressable style={styles.datePickerModal} onPress={() => {}}>
            <Text style={styles.datePickerModalTitle}>Select Birthday</Text>

            <View style={styles.datePickerColumns}>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerColumnLabel}>Year</Text>
                <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                  {years.map((year) => (
                    <Pressable
                      key={year}
                      style={[styles.datePickerItem, selectedYear === year ? styles.datePickerItemActive : null]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedYear(year);
                      }}
                    >
                      <Text style={[styles.datePickerItemText, selectedYear === year ? styles.datePickerItemTextActive : null]}>
                        {year}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerColumnLabel}>Month</Text>
                <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                  {months.map((month, index) => (
                    <Pressable
                      key={month}
                      style={[styles.datePickerItem, selectedMonth === index ? styles.datePickerItemActive : null]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedMonth(index);
                      }}
                    >
                      <Text style={[styles.datePickerItemText, selectedMonth === index ? styles.datePickerItemTextActive : null]}>
                        {month.substring(0, 3)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerColumnLabel}>Day</Text>
                <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                  {days.map((day) => (
                    <Pressable
                      key={day}
                      style={[styles.datePickerItem, selectedDay === day ? styles.datePickerItemActive : null]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDay(day);
                      }}
                    >
                      <Text style={[styles.datePickerItemText, selectedDay === day ? styles.datePickerItemTextActive : null]}>
                        {day}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.datePickerActions}>
              <Pressable style={styles.datePickerCancelButton} onPress={() => setShowPicker(false)}>
                <Text style={styles.datePickerCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.datePickerConfirmButton,
                  !(selectedYear && selectedMonth !== null && selectedDay) ? styles.datePickerConfirmButtonDisabled : null,
                ]}
                onPress={handleConfirm}
                disabled={!(selectedYear && selectedMonth !== null && selectedDay)}
              >
                <Text style={styles.datePickerConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function PhotoUploadStep({ data, setData, onNext, playerName }: StepProps) {
  const [uploading, setUploading] = useState(false);

  const pickImage = async (useCamera: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const permissionMethod = useCamera
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync;

    const { status } = await permissionMethod();
    if (status !== "granted") {
      return;
    }

    const launchMethod = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;

    const result = await launchMethod({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setData((prev) => ({ ...prev, profilePhotoUri: result.assets[0].uri }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>
          Let's see who we're working with{playerName ? `, ${playerName}` : ""}!
        </Text>
        <Text style={styles.stepSubtitle}>Add a profile photo so coaches can recognize you.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.photoUploadContainer}>
        <View style={[styles.avatarContainer, data.profilePhotoUri ? styles.avatarContainerActive : null]}>
          {data.profilePhotoUri ? (
            <Image source={{ uri: data.profilePhotoUri }} style={styles.avatarImage} />
          ) : (
            <Ionicons name="person" size={60} color={Colors.dark.textMuted} />
          )}
        </View>

        <View style={styles.photoButtons}>
          <Pressable style={styles.photoButton} onPress={() => pickImage(true)}>
            <Ionicons name="camera-outline" size={24} color={GlowColors.primary} />
            <Text style={styles.photoButtonText}>Take Photo</Text>
          </Pressable>

          <Pressable style={styles.photoButton} onPress={() => pickImage(false)}>
            <Ionicons name="images-outline" size={24} color={GlowColors.primary} />
            <Text style={styles.photoButtonText}>Choose from Gallery</Text>
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.photoActions}>
        <Pressable
          style={[styles.primaryButton, !data.profilePhotoUri ? styles.primaryButtonSecondary : null]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onNext();
          }}
        >
          <Text style={[styles.primaryButtonText, !data.profilePhotoUri ? styles.primaryButtonTextSecondary : null]}>
            {data.profilePhotoUri ? "Continue" : "Skip for now"}
          </Text>
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

function GenderStep({ data, setData, onNext, playerName }: StepProps) {
  const genderOptions = [
    { id: "male", label: "Male", icon: "male-outline" },
    { id: "female", label: "Female", icon: "female-outline" },
    { id: "prefer_not_to_say", label: "Prefer not to say", icon: "person-outline" },
  ];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>
          {playerName ? `Hey ${playerName}!` : "One more thing"}
        </Text>
        <Text style={styles.stepSubtitle}>How would you like to be addressed?</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.genderContainer}>
        {genderOptions.map((option) => (
          <Pressable
            key={option.id}
            style={[styles.genderCard, data.gender === option.id ? styles.genderCardActive : null]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setData((prev) => ({ ...prev, gender: option.id }));
              setTimeout(onNext, 300);
            }}
          >
            <View style={[styles.genderIcon, data.gender === option.id ? styles.genderIconActive : null]}>
              <Ionicons
                name={option.icon as any}
                size={24}
                color={data.gender === option.id ? Colors.dark.backgroundRoot : Colors.dark.textMuted}
              />
            </View>
            <Text style={[styles.genderText, data.gender === option.id ? styles.genderTextActive : null]}>
              {option.label}
            </Text>
            {data.gender === option.id ? (
              <Ionicons name="checkmark-circle" size={24} color={GlowColors.primary} />
            ) : null}
          </Pressable>
        ))}
      </Animated.View>
    </ScrollView>
  );
}

function BallLevelRevealStep({ data, setData, onNext, age }: StepProps & { age: number }) {
  const [revealed, setRevealed] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const calculatedBallLevel = getBallLevel(age);
  const isAdult = age >= 18;
  
  // Use the data.ballLevel if already set (user adjusted), otherwise use calculated
  const currentBallLevelId = data.ballLevel || (isAdult ? "glow" : calculatedBallLevel.level.toLowerCase());
  const ballLevel = data.ballLevel 
    ? { level: data.ballLevel.charAt(0).toUpperCase() + data.ballLevel.slice(1), color: getBallLevelColor(data.ballLevel), description: calculatedBallLevel.description, isGlowLevel: data.ballLevel === "glow" }
    : calculatedBallLevel;

  useEffect(() => {
    const timer = setTimeout(() => {
      setRevealed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Save the ball level to data when revealed
      if (!data.ballLevel) {
        const levelToSave = isAdult ? "glow" : calculatedBallLevel.level.toLowerCase();
        setData(prev => ({ ...prev, ballLevel: levelToSave }));
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const ballOptions = [
    { id: "blue", label: "Blue Ball", color: BallLevelColors.blue, description: "Soft foam fun for little ones" },
    { id: "red", label: "Red Ball", color: BallLevelColors.red, description: "Mini court, soft ball" },
    { id: "orange", label: "Orange Ball", color: BallLevelColors.orange, description: "3/4 court" },
    { id: "green", label: "Green Ball", color: BallLevelColors.green, description: "Full court, slower ball" },
    { id: "yellow", label: "Yellow Ball", color: BallLevelColors.yellow, description: "Standard ball" },
  ];

  return (
    <View style={styles.ballLevelContainer}>
      {revealed ? <Confetti /> : null}

      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>{isAdult ? "Your Glow Level" : "Your Ball Level"}</Text>
        <Text style={styles.stepSubtitle}>
          {isAdult 
            ? "As an adult player, you'll be rated on our Glow DSS system!"
            : "Based on your age, here's the perfect ball for you!"}
        </Text>
      </Animated.View>

      {revealed ? (
        <Animated.View entering={ZoomIn.springify()} style={styles.ballLevelCard}>
          <View style={[styles.ballIcon, { backgroundColor: ballLevel.color }]}>
            <Ionicons name={isAdult ? "star" : "tennisball"} size={48} color="#FFFFFF" />
          </View>
          <Text style={[styles.ballLevelTitle, { color: ballLevel.color }]}>
            {isAdult ? "Glow DSS Rating" : `${ballLevel.level} Ball`}
          </Text>
          <Text style={styles.ballLevelDescription}>{ballLevel.description}</Text>
          
          {!isAdult ? (
            <Pressable 
              style={styles.adjustLink}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowAdjustModal(true);
              }}
            >
              <Ionicons name="help-circle-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={styles.adjustLinkText}>This doesn't seem right?</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : (
        <Animated.View style={styles.loadingBall}>
          <Ionicons name="tennisball-outline" size={80} color={Colors.dark.textMuted} />
          <Text style={styles.loadingText}>Calculating...</Text>
        </Animated.View>
      )}

      {revealed ? (
        <Animated.View entering={FadeInUp.delay(500)}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNext();
            }}
          >
            <Text style={styles.primaryButtonText}>Awesome!</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      <Modal visible={showAdjustModal} transparent animationType="fade" onRequestClose={() => setShowAdjustModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowAdjustModal(false)}>
          <Pressable style={styles.adjustModal} onPress={() => {}}>
            <Text style={styles.adjustModalTitle}>Change Ball Level</Text>
            <Text style={styles.adjustModalSubtitle}>Select your actual playing level:</Text>
            
            <View style={styles.adjustOptions}>
              {ballOptions.map((option) => (
                <Pressable
                  key={option.id}
                  style={[styles.adjustOption, data.ballLevel === option.id && styles.adjustOptionSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setData(prev => ({ ...prev, ballLevel: option.id }));
                    setShowAdjustModal(false);
                  }}
                >
                  <View style={[styles.adjustBallIcon, { backgroundColor: option.color }]}>
                    <Ionicons name="tennisball" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.adjustOptionInfo}>
                    <Text style={styles.adjustOptionLabel}>{option.label}</Text>
                    <Text style={styles.adjustOptionDesc}>{option.description}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            
            <Pressable style={styles.adjustCancelButton} onPress={() => setShowAdjustModal(false)}>
              <Text style={styles.adjustCancelText}>Keep {ballLevel.level} Ball</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function PlatformWelcomeVideoStep({ onNext }: StepProps) {
  const { data: videoData } = useQuery<{ url: string | null }>({
    queryKey: ["/api/public/platform/welcome-video"],
  });

  const hasVideo = !!videoData?.url;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Welcome to Glow Up Sports</Text>
        <Text style={styles.stepSubtitle}>Watch this quick intro to see what your tennis journey looks like</Text>
      </Animated.View>

      <Animated.View entering={ZoomIn.delay(300).springify()} style={styles.videoContainer}>
        {hasVideo ? (
          <View style={styles.videoPlayer}>
            <LinearGradient
              colors={[`${GlowColors.primary}30`, `${GlowColors.secondary}30`]}
              style={styles.videoPlaceholder}
            >
              <Ionicons name="play-circle" size={64} color={GlowColors.primary} />
              <Text style={styles.videoPlaceholderText}>Platform Welcome Video</Text>
              <Text style={styles.videoUrlHint}>{videoData.url}</Text>
            </LinearGradient>
          </View>
        ) : (
          <View style={styles.videoPlayer}>
            <LinearGradient
              colors={[`${GlowColors.primary}30`, `${GlowColors.secondary}30`]}
              style={styles.videoPlaceholder}
            >
              <Ionicons name="tennisball" size={64} color={GlowColors.primary} />
              <Text style={styles.videoPlaceholderText}>Your Glow Journey Awaits</Text>
              <Text style={styles.videoPlaceholderSubtext}>Level up your game with personalized coaching</Text>
            </LinearGradient>
          </View>
        )}
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.videoFeatures}>
        <View style={styles.videoFeatureItem}>
          <View style={[styles.videoFeatureIcon, { backgroundColor: `${GlowColors.primary}20` }]}>
            <Ionicons name="trending-up" size={20} color={GlowColors.primary} />
          </View>
          <Text style={styles.videoFeatureText}>Track your progress</Text>
        </View>
        <View style={styles.videoFeatureItem}>
          <View style={[styles.videoFeatureIcon, { backgroundColor: `${GlowColors.secondary}20` }]}>
            <Ionicons name="trophy" size={20} color={GlowColors.secondary} />
          </View>
          <Text style={styles.videoFeatureText}>Earn XP & badges</Text>
        </View>
        <View style={styles.videoFeatureItem}>
          <View style={[styles.videoFeatureIcon, { backgroundColor: `${GlowColors.tertiary}20` }]}>
            <Ionicons name="people" size={20} color={GlowColors.tertiary} />
          </View>
          <Text style={styles.videoFeatureText}>Connect with coaches</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(600).duration(400)} style={styles.videoNextContainer}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onNext();
          }}
        >
          <Text style={styles.primaryButtonText}>Let's Go!</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

function AcademyWelcomeVideoStep({ data, onNext }: StepProps) {
  const { data: academyData } = useQuery<{ welcomeVideoUrl?: string; name?: string }>({
    queryKey: data.academyId ? [`/api/academies/${data.academyId}/settings`] : [],
    enabled: !!data.academyId,
  });

  // Auto-skip if no academy was selected
  useEffect(() => {
    if (!data.academyId) {
      onNext();
    }
  }, [data.academyId, onNext]);

  // Don't render if no academy - we're auto-skipping
  if (!data.academyId) {
    return null;
  }

  const hasVideo = !!academyData?.welcomeVideoUrl;
  const academyName = data.academyName || academyData?.name || "Your Academy";

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Welcome to {academyName}</Text>
        <Text style={styles.stepSubtitle}>A message from your new tennis family</Text>
      </Animated.View>

      <Animated.View entering={ZoomIn.delay(300).springify()} style={styles.videoContainer}>
        {hasVideo ? (
          <View style={styles.videoPlayer}>
            <LinearGradient
              colors={[`${GlowColors.secondary}30`, `${GlowColors.tertiary}30`]}
              style={styles.videoPlaceholder}
            >
              <Ionicons name="play-circle" size={64} color={GlowColors.secondary} />
              <Text style={styles.videoPlaceholderText}>Academy Welcome Video</Text>
              <Text style={styles.videoUrlHint}>{academyData.welcomeVideoUrl}</Text>
            </LinearGradient>
          </View>
        ) : (
          <View style={styles.videoPlayer}>
            <LinearGradient
              colors={[`${GlowColors.secondary}30`, `${GlowColors.tertiary}30`]}
              style={styles.videoPlaceholder}
            >
              <Ionicons name="school" size={64} color={GlowColors.secondary} />
              <Text style={styles.videoPlaceholderText}>Ready to Start</Text>
              <Text style={styles.videoPlaceholderSubtext}>Your coaches are excited to meet you</Text>
            </LinearGradient>
          </View>
        )}
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(500).duration(400)} style={styles.academyHighlights}>
        <Text style={styles.academyHighlightsTitle}>What's Next</Text>
        <View style={styles.nextStepItem}>
          <View style={styles.nextStepNumber}><Text style={styles.nextStepNumberText}>1</Text></View>
          <Text style={styles.nextStepText}>Book your first session</Text>
        </View>
        <View style={styles.nextStepItem}>
          <View style={styles.nextStepNumber}><Text style={styles.nextStepNumberText}>2</Text></View>
          <Text style={styles.nextStepText}>Meet your coach</Text>
        </View>
        <View style={styles.nextStepItem}>
          <View style={styles.nextStepNumber}><Text style={styles.nextStepNumberText}>3</Text></View>
          <Text style={styles.nextStepText}>Start earning XP</Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.delay(600).duration(400)} style={styles.videoNextContainer}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onNext();
          }}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </Animated.View>
    </ScrollView>
  );
}

function WhyTennisStep({ data, setData, onNext, ageGroup }: StepProps) {
  const options = {
    kid: [
      { id: "fun", label: "Tennis is fun!", icon: "happy-outline" },
      { id: "friends", label: "My friends do it too", icon: "people-outline" },
      { id: "trophies", label: "I want to win trophies", icon: "trophy-outline" },
    ],
    teen: [
      { id: "fun", label: "I play for fun", icon: "happy-outline" },
      { id: "improve", label: "I want to get really good", icon: "trending-up-outline" },
      { id: "compete", label: "I want to compete", icon: "ribbon-outline" },
    ],
    adult: [
      { id: "fitness", label: "Fitness & relaxation", icon: "fitness-outline" },
      { id: "improve", label: "Serious improvement", icon: "analytics-outline" },
      { id: "compete", label: "Competitive play", icon: "trophy-outline" },
    ],
  };

  const currentOptions = options[ageGroup || "adult"];
  const selectedMotivations = data.motivationTypes || [];

  const toggleMotivation = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setData((prev) => {
      const current = prev.motivationTypes || [];
      if (current.includes(id)) {
        return { ...prev, motivationTypes: current.filter((m) => m !== id), motivationType: current.filter((m) => m !== id)[0] || null };
      }
      return { ...prev, motivationTypes: [...current, id], motivationType: id };
    });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Why Tennis?</Text>
        <Text style={styles.stepSubtitle}>What brings you to the court? (Select all that apply)</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.optionsContainer}>
        {currentOptions.map((option) => {
          const isSelected = selectedMotivations.includes(option.id);
          return (
            <Pressable
              key={option.id}
              style={[styles.selectableCard, isSelected ? styles.selectableCardActive : null]}
              onPress={() => toggleMotivation(option.id)}
            >
              <Ionicons
                name={option.icon as any}
                size={28}
                color={isSelected ? GlowColors.primary : Colors.dark.textMuted}
              />
              <Text style={[styles.selectableCardText, isSelected ? styles.selectableCardTextActive : null]}>
                {option.label}
              </Text>
              {isSelected ? (
                <View style={styles.checkIcon}>
                  <Ionicons name="checkmark" size={16} color={Colors.dark.buttonText} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Animated.View>

      {selectedMotivations.length > 0 ? (
        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.videoNextContainer}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNext();
            }}
          >
            <Text style={styles.primaryButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
          </Pressable>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

function ExperienceStep({ data, setData, onNext, age }: StepProps & { age?: number }) {
  const playerAge = age || 18;
  
  const allOptions = [
    { id: "new", label: "New to tennis", maxAge: 100 },
    { id: "6-12months", label: "6-12 months", maxAge: 100 },
    { id: "1-3years", label: "1-3 years", maxAge: 100 },
    { id: "3-5years", label: "3-5 years", maxAge: 100 },
    { id: "5-10years", label: "5-10 years", maxAge: 100 },
    { id: "10-15years", label: "10-15 years", maxAge: 100 },
    { id: "15-20years", label: "15-20 years", maxAge: 100 },
    { id: "20+years", label: "20+ years", maxAge: 100 },
  ];

  const getMaxExperience = (playerAge: number): string[] => {
    if (playerAge < 2) return ["new"];
    if (playerAge < 3) return ["new", "6-12months"];
    if (playerAge < 5) return ["new", "6-12months", "1-3years"];
    if (playerAge < 8) return ["new", "6-12months", "1-3years", "3-5years"];
    if (playerAge < 13) return ["new", "6-12months", "1-3years", "3-5years", "5-10years"];
    if (playerAge < 18) return ["new", "6-12months", "1-3years", "3-5years", "5-10years", "10-15years"];
    if (playerAge < 23) return ["new", "6-12months", "1-3years", "3-5years", "5-10years", "10-15years", "15-20years"];
    return allOptions.map(o => o.id);
  };

  const availableIds = getMaxExperience(playerAge);
  const options = allOptions.filter(opt => availableIds.includes(opt.id));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Tennis Experience</Text>
        <Text style={styles.stepSubtitle}>How long have you been playing?</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.chipsContainer}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            style={[styles.chip, data.experienceLevel === option.id ? styles.chipActive : null]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setData((prev) => ({ ...prev, experienceLevel: option.id }));
            }}
          >
            <Text style={[styles.chipText, data.experienceLevel === option.id ? styles.chipTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>

      {data.experienceLevel ? (
        <Animated.View entering={FadeInUp.delay(100).duration(300)} style={styles.videoNextContainer}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNext();
            }}
          >
            <Text style={styles.primaryButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
          </Pressable>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

function AboutYourselfStep({ data, setData, onNext, ageGroup }: StepProps) {
  const [height, setHeight] = useState(data.height?.toString() || "");

  const tshirtOptions = ageGroup === "kid" || ageGroup === "teen" 
    ? childTshirtSizes.map((size) => ({ id: size, label: size }))
    : adultTshirtSizes.map((size) => ({ id: size, label: size }));

  const handOptions = [
    { id: "right", label: "Right", icon: "hand-right-outline" },
    { id: "left", label: "Left", icon: "hand-left-outline" },
  ];

  const backhandOptions = [
    { id: "single", label: "One-handed" },
    { id: "double", label: "Two-handed" },
  ];

  const isExperienced = data.experienceLevel && data.experienceLevel !== "new";

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>About Yourself</Text>
        <Text style={styles.stepSubtitle}>A few details to help coaches understand you better.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>Height (cm)</Text>
        <TextInput
          style={styles.textInput}
          value={height}
          onChangeText={(text) => {
            setHeight(text);
            const num = parseInt(text);
            if (!isNaN(num) && num >= 50 && num <= 250) {
              setData((prev) => ({ ...prev, height: num }));
            }
          }}
          placeholder="e.g. 165"
          placeholderTextColor={Colors.dark.textMuted}
          keyboardType="numeric"
          maxLength={3}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>T-Shirt Size</Text>
        <View style={styles.chipsContainer}>
          {tshirtOptions.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.chip, styles.chipSmall, data.tshirtSize === option.id ? styles.chipActive : null]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setData((prev) => ({ ...prev, tshirtSize: option.id as TshirtSize }));
              }}
            >
              <Text style={[styles.chipText, data.tshirtSize === option.id ? styles.chipTextActive : null]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>Dominant Hand</Text>
        <View style={styles.handSelector}>
          {handOptions.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.handButton, data.dominantHand === option.id ? styles.handButtonActive : null]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setData((prev) => ({ ...prev, dominantHand: option.id }));
              }}
            >
              <Ionicons
                name={option.icon as any}
                size={32}
                color={data.dominantHand === option.id ? GlowColors.primary : Colors.dark.textMuted}
              />
              <Text style={[styles.handButtonText, data.dominantHand === option.id ? styles.handButtonTextActive : null]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>

      {isExperienced ? (
        <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.sectionContainer}>
          <Text style={styles.sectionLabel}>Backhand Style</Text>
          <View style={styles.handSelector}>
            {backhandOptions.map((option) => (
              <Pressable
                key={option.id}
                style={[styles.handButton, data.backhandType === option.id ? styles.handButtonActive : null]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setData((prev) => ({ ...prev, backhandType: option.id }));
                }}
              >
                <Text style={[styles.handButtonText, data.backhandType === option.id ? styles.handButtonTextActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

const PLAY_STYLE_ARCHETYPES: Array<{
  key: PlayStyleKey;
  name: string;
  tagline: string;
  icon: string;
  color: string;
  bgColor: string;
}> = [
  {
    key: "baseline_warrior",
    name: "Baseline Warrior",
    tagline: "Grind from the back, outlast everyone",
    icon: "tennisball",
    color: GlowColors.primary,
    bgColor: "rgba(200, 255, 61, 0.12)",
  },
  {
    key: "net_ninja",
    name: "Net Ninja",
    tagline: "Rush the net, end it fast",
    icon: "flash",
    color: "#00E5FF",
    bgColor: "rgba(0, 229, 255, 0.12)",
  },
  {
    key: "serve_machine",
    name: "Serve Machine",
    tagline: "Ace-heavy, dominate with power",
    icon: "rocket",
    color: "#FF8C00",
    bgColor: "rgba(255, 140, 0, 0.12)",
  },
  {
    key: "all_court_ace",
    name: "All-Court Ace",
    tagline: "Adapt to any court, any opponent",
    icon: "star",
    color: "#FFFFFF",
    bgColor: "rgba(255, 255, 255, 0.10)",
  },
  {
    key: "counter_puncher",
    name: "Counter-Puncher",
    tagline: "Turn defense into attack",
    icon: "shield",
    color: "#9B59B6",
    bgColor: "rgba(155, 89, 182, 0.12)",
  },
  {
    key: "tactical_mastermind",
    name: "Tactical Mastermind",
    tagline: "Outsmart, outmaneuver, outwit",
    icon: "bulb",
    color: "#FFD700",
    bgColor: "rgba(255, 215, 0, 0.12)",
  },
];

function PlayStyleStep({ data, setData, onNext }: StepProps) {
  const selected = data.playStyle;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={[styles.stepTitle, { letterSpacing: 2, textTransform: "uppercase" }]}>DISCOVER YOUR GAME</Text>
        <Text style={styles.stepSubtitle}>Every player has a DNA. Which archetype fits how you play?</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <View style={styles.archetypeGrid}>
          {PLAY_STYLE_ARCHETYPES.map((archetype, idx) => {
            const isSelected = selected === archetype.key;
            return (
              <Pressable
                key={archetype.key}
                style={[
                  styles.archetypeCard,
                  { borderColor: isSelected ? archetype.color : "rgba(255,255,255,0.08)" },
                  isSelected ? { backgroundColor: archetype.bgColor } : null,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setData((prev) => ({
                    ...prev,
                    playStyle: isSelected ? null : archetype.key,
                  }));
                }}
              >
                <View style={[styles.archetypeIconCircle, { backgroundColor: archetype.bgColor }]}>
                  <Ionicons name={archetype.icon as any} size={28} color={archetype.color} />
                </View>
                <Text style={[styles.archetypeName, { color: isSelected ? archetype.color : Colors.dark.text }]}>
                  {archetype.name}
                </Text>
                <Text style={styles.archetypeTagline} numberOfLines={2}>{archetype.tagline}</Text>
                {isSelected ? (
                  <View style={[styles.archetypeCheck, { backgroundColor: archetype.color }]}>
                    <Ionicons name="checkmark" size={12} color={Colors.dark.buttonText} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {selected ? (
        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onNext();
            }}
          >
            <Text style={styles.primaryButtonText}>Lock In My Style</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
          </Pressable>
        </Animated.View>
      ) : null}

      <Pressable
        style={styles.skipButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNext();
        }}
      >
        <Text style={styles.skipButtonText}>Decide Later</Text>
      </Pressable>
    </ScrollView>
  );
}

function TennisIdolStep({ data, setData, onNext, ageGroup }: StepProps) {
  const [customIdol, setCustomIdol] = useState(data.customIdol || "");

  const idolOptions = {
    kid: [
      { id: "alcaraz", label: "Carlos Alcaraz", emoji: "ES" },
      { id: "sinner", label: "Jannik Sinner", emoji: "IT" },
      { id: "swiatek", label: "Iga Swiatek", emoji: "PL" },
      { id: "gauff", label: "Coco Gauff", emoji: "US" },
      { id: "rune", label: "Holger Rune", emoji: "DK" },
      { id: "sabalenka", label: "Aryna Sabalenka", emoji: "BY" },
    ],
    teen: [
      { id: "alcaraz", label: "Carlos Alcaraz", emoji: "ES" },
      { id: "sinner", label: "Jannik Sinner", emoji: "IT" },
      { id: "swiatek", label: "Iga Swiatek", emoji: "PL" },
      { id: "djokovic", label: "Novak Djokovic", emoji: "RS" },
      { id: "gauff", label: "Coco Gauff", emoji: "US" },
      { id: "rune", label: "Holger Rune", emoji: "DK" },
    ],
    adult: [
      { id: "federer", label: "Roger Federer", emoji: "CH" },
      { id: "nadal", label: "Rafael Nadal", emoji: "ES" },
      { id: "djokovic", label: "Novak Djokovic", emoji: "RS" },
      { id: "serena", label: "Serena Williams", emoji: "US" },
      { id: "alcaraz", label: "Carlos Alcaraz", emoji: "ES" },
      { id: "sinner", label: "Jannik Sinner", emoji: "IT" },
    ],
  };

  const currentOptions = idolOptions[ageGroup || "adult"];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Tennis Idol</Text>
        <Text style={styles.stepSubtitle}>Who's your favorite tennis player?</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.idolGrid}>
        {currentOptions.map((option) => (
          <Pressable
            key={option.id}
            style={[styles.idolCard, data.tennisIdol === option.id ? styles.idolCardActive : null]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setData((prev) => ({ ...prev, tennisIdol: option.id, customIdol: null }));
            }}
          >
            <Ionicons name="star" size={24} color={data.tennisIdol === option.id ? GlowColors.primary : Colors.dark.textMuted} />
            <Text style={[styles.idolCardText, data.tennisIdol === option.id ? styles.idolCardTextActive : null]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>Or someone else?</Text>
        <TextInput
          style={styles.textInput}
          value={customIdol}
          onChangeText={(text) => {
            setCustomIdol(text);
            if (text.length > 0) {
              setData((prev) => ({ ...prev, tennisIdol: "other", customIdol: text }));
            }
          }}
          placeholder="Enter player name"
          placeholderTextColor={Colors.dark.textMuted}
        />
      </Animated.View>

      <Pressable
        style={styles.skipLink}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNext();
        }}
      >
        <Text style={styles.skipLinkText}>Skip this step</Text>
      </Pressable>
    </ScrollView>
  );
}

function EnjoymentStep({ data, setData, onNext }: StepProps) {
  const options = [
    { id: "rallies", label: "Rallying", icon: "repeat-outline" },
    { id: "winning", label: "Winning points", icon: "star-outline" },
    { id: "technique", label: "Learning technique", icon: "school-outline" },
    { id: "social", label: "Playing with others", icon: "people-outline" },
    { id: "active", label: "Being active", icon: "fitness-outline" },
    { id: "competing", label: "Competing", icon: "ribbon-outline" },
  ];

  const toggleSelection = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setData((prev) => {
      const current = prev.enjoymentTags;
      if (current.includes(id)) {
        return { ...prev, enjoymentTags: current.filter((t) => t !== id) };
      }
      if (current.length >= 3) return prev;
      return { ...prev, enjoymentTags: [...current, id] };
    });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>What do you enjoy?</Text>
        <Text style={styles.stepSubtitle}>Pick up to 3 things you love about tennis.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.enjoymentGrid}>
        {options.map((option) => {
          const isSelected = data.enjoymentTags.includes(option.id);
          const isDisabled = !isSelected && data.enjoymentTags.length >= 3;
          return (
            <Pressable
              key={option.id}
              style={[
                styles.enjoymentCard,
                isSelected ? styles.enjoymentCardActive : null,
                isDisabled ? styles.enjoymentCardDisabled : null,
              ]}
              onPress={() => !isDisabled && toggleSelection(option.id)}
              disabled={isDisabled}
            >
              <Ionicons name={option.icon as any} size={32} color={isSelected ? GlowColors.primary : Colors.dark.textMuted} />
              <Text style={[styles.enjoymentCardText, isSelected ? styles.enjoymentCardTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </Animated.View>

      <Text style={styles.selectionCount}>{data.enjoymentTags.length}/3 selected</Text>
    </ScrollView>
  );
}

function FocusGoalsStep({ data, setData, onNext }: StepProps) {
  const options = [
    { id: "technique", label: "Technique", icon: "construct-outline" },
    { id: "confidence", label: "Confidence", icon: "shield-checkmark-outline" },
    { id: "fitness", label: "Fitness", icon: "barbell-outline" },
    { id: "focus", label: "Focus", icon: "eye-outline" },
    { id: "strategy", label: "Playing smarter", icon: "bulb-outline" },
    { id: "teamwork", label: "Teamwork", icon: "people-circle-outline" },
  ];

  const toggleSelection = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setData((prev) => {
      const current = prev.focusGoals;
      if (current.includes(id)) {
        return { ...prev, focusGoals: current.filter((t) => t !== id) };
      }
      return { ...prev, focusGoals: [...current, id] };
    });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>What to work on?</Text>
        <Text style={styles.stepSubtitle}>Select areas you'd like to improve.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.enjoymentGrid}>
        {options.map((option) => {
          const isSelected = data.focusGoals.includes(option.id);
          return (
            <Pressable
              key={option.id}
              style={[styles.enjoymentCard, isSelected ? styles.enjoymentCardActive : null]}
              onPress={() => toggleSelection(option.id)}
            >
              <Ionicons name={option.icon as any} size={32} color={isSelected ? GlowColors.primary : Colors.dark.textMuted} />
              <Text style={[styles.enjoymentCardText, isSelected ? styles.enjoymentCardTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </ScrollView>
  );
}

function AvailabilityStep({ data, setData, onNext }: StepProps) {
  const options = [
    { id: "morning", label: "Morning", icon: "sunny-outline" },
    { id: "afternoon", label: "Afternoon", icon: "partly-sunny-outline" },
    { id: "evening", label: "Evening", icon: "moon-outline" },
    { id: "weekend", label: "Weekend", icon: "calendar-outline" },
  ];

  const toggleSelection = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setData((prev) => {
      const current = prev.typicalPlayTimes;
      if (current.includes(id)) {
        return { ...prev, typicalPlayTimes: current.filter((t) => t !== id) };
      }
      return { ...prev, typicalPlayTimes: [...current, id] };
    });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>When can you train?</Text>
        <Text style={styles.stepSubtitle}>Select your preferred training times.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.optionsContainer}>
        {options.map((option) => {
          const isSelected = data.typicalPlayTimes.includes(option.id);
          return (
            <Pressable
              key={option.id}
              style={[styles.selectableCard, isSelected ? styles.selectableCardActive : null]}
              onPress={() => toggleSelection(option.id)}
            >
              <Ionicons name={option.icon as any} size={28} color={isSelected ? GlowColors.primary : Colors.dark.textMuted} />
              <Text style={[styles.selectableCardText, isSelected ? styles.selectableCardTextActive : null]}>{option.label}</Text>
              {isSelected ? (
                <View style={styles.checkIcon}>
                  <Ionicons name="checkmark" size={16} color={Colors.dark.buttonText} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </Animated.View>
    </ScrollView>
  );
}

function AcademySelectionStep({ data, setData, onNext }: StepProps) {
  const localeRegion = Localization.getLocales?.()[0]?.regionCode ?? null;
  const localeCountry = localeRegion ? (ISO_TO_COUNTRY[localeRegion] ?? null) : null;

  const [selectedCountry, setSelectedCountry] = useState<string | null>(localeCountry);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showingAll, setShowingAll] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status === "granted") {
          const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
          if (cancelled) return;
          const [result] = await Location.reverseGeocodeAsync({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          if (cancelled) return;
          if (result?.isoCountryCode) {
            const gpsCountry = ISO_TO_COUNTRY[result.isoCountryCode.toUpperCase()] ?? null;
            if (gpsCountry) setSelectedCountry(gpsCountry);
          }
        }
      } catch (_) {
      } finally {
        if (!cancelled) setIsDetectingLocation(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const isCountryFiltered = !!selectedCountry && !showingAll;

  const { data: filteredAcademiesData, isLoading: isLoadingFiltered } = useQuery<{ academies: Academy[] }>({
    queryKey: ["/api/academies/browse", selectedCountry, selectedCity, showingAll],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (isCountryFiltered && selectedCountry) params.set("country", selectedCountry);
      if (isCountryFiltered && selectedCity) params.set("city", selectedCity);
      const path = `/api/academies/browse${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await apiFetch(path);
      if (!res.ok) throw new Error(`${res.status}: Failed to load academies`);
      return res.json() as Promise<{ academies: Academy[] }>;
    },
  });

  const { data: allAcademiesData, isLoading: isLoadingAll } = useQuery<{ academies: Academy[] }>({
    queryKey: ["/api/academies/browse"],
    queryFn: async () => {
      const res = await apiFetch("/api/academies/browse");
      if (!res.ok) throw new Error(`${res.status}: Failed to load academies`);
      return res.json() as Promise<{ academies: Academy[] }>;
    },
    enabled: isCountryFiltered,
  });

  const { data: countriesData } = useQuery<{ countries: AcademyCountry[] }>({
    queryKey: ["/api/academies/browse/countries"],
  });

  const filteredAcademies = filteredAcademiesData?.academies || [];
  const allAcademies = allAcademiesData?.academies || [];
  const countries = countriesData?.countries || [];

  const citiesInCountry: string[] = selectedCountry && countriesData
    ? (countriesData.countries.find(c => c.country === selectedCountry)?.cities ?? [])
    : [];

  const hasNoLocalAcademies = isCountryFiltered && !isLoadingFiltered && filteredAcademies.length === 0;
  const isLoading = isLoadingFiltered || (hasNoLocalAcademies && isLoadingAll);
  const displayedAcademies = hasNoLocalAcademies ? allAcademies : filteredAcademies.slice(0, 5);

  const handleSelectAcademy = (academy: { id: string; name: string }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setData((prev) => ({ ...prev, academyId: academy.id, academyName: academy.name }));
    setTimeout(onNext, 300);
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Find Your Academy</Text>
        <Text style={styles.stepSubtitle}>Join an academy or continue independently.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.locationHeader}>
        <View style={styles.locationRow}>
          {isDetectingLocation ? (
            <>
              <Ionicons name="location-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={[styles.locationLabel, { color: Colors.dark.textMuted }]}>Detecting location...</Text>
            </>
          ) : selectedCountry && !showingAll ? (
            <>
              <Ionicons name="location" size={16} color={GlowColors.primary} />
              <Text style={styles.locationLabel}>Academies in {selectedCountry}</Text>
            </>
          ) : (
            <>
              <Ionicons name="globe-outline" size={16} color={Colors.dark.textMuted} />
              <Text style={[styles.locationLabel, { color: Colors.dark.textMuted }]}>All academies</Text>
            </>
          )}
        </View>
        <Pressable
          style={styles.changeCountryButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowCountryModal(true);
          }}
        >
          <Ionicons name="swap-horizontal" size={13} color={GlowColors.primary} />
          <Text style={styles.changeCountryButtonText}>
            {selectedCountry && !showingAll ? `Not in ${selectedCountry}?` : "Choose country"}
          </Text>
        </Pressable>
      </Animated.View>

      {citiesInCountry.length > 1 ? (
        <Animated.View entering={FadeInDown.delay(200).duration(400)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cityChipsRow} contentContainerStyle={{ gap: Spacing.sm }}>
            <Pressable
              style={[styles.cityChip, !selectedCity ? styles.cityChipActive : null]}
              onPress={() => { setSelectedCity(null); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[styles.cityChipText, !selectedCity ? styles.cityChipTextActive : null]}>All cities</Text>
            </Pressable>
            {citiesInCountry.map(city => (
              <Pressable
                key={city}
                style={[styles.cityChip, selectedCity === city ? styles.cityChipActive : null]}
                onPress={() => { setSelectedCity(city); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.cityChipText, selectedCity === city ? styles.cityChipTextActive : null]}>{city}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      {hasNoLocalAcademies ? (
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.noLocalNote}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.dark.textMuted} />
          <Text style={styles.noLocalNoteText}>
            No academies found in {selectedCountry} yet. Showing all available academies.
          </Text>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.optionsContainer}>
        {isLoading ? (
          <Text style={styles.loadingText}>Loading academies...</Text>
        ) : displayedAcademies.length > 0 ? (
          displayedAcademies.map((academy) => (
            <Pressable
              key={academy.id}
              style={[styles.academyCard, data.academyId === academy.id ? styles.academyCardActive : null]}
              onPress={() => handleSelectAcademy(academy)}
            >
              <View style={styles.academyIconContainer}>
                <Ionicons
                  name="tennisball-outline"
                  size={28}
                  color={data.academyId === academy.id ? GlowColors.primary : Colors.dark.textMuted}
                />
              </View>
              <View style={styles.academyInfo}>
                <Text style={[styles.academyName, data.academyId === academy.id ? styles.academyNameActive : null]}>
                  {academy.name}
                </Text>
                <Text style={styles.academyStats}>
                  {academy.coachCount} coaches · {academy.playerCount} players
                  {academy.city ? ` · ${academy.city}` : ""}
                </Text>
              </View>
              {data.academyId === academy.id ? (
                <View style={styles.checkIcon}>
                  <Ionicons name="checkmark" size={16} color={Colors.dark.buttonText} />
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={20} color={Colors.dark.textMuted} />
              )}
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyText}>No academies available yet.</Text>
        )}
      </Animated.View>

      <Pressable
        style={styles.skipLink}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setData(prev => ({ ...prev, academyId: null, academyName: null }));
          onNext();
        }}
      >
        <Text style={styles.skipLinkText}>I'm still looking / Continue without academy</Text>
      </Pressable>

      <Modal
        visible={showCountryModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCountryModal(false)}
      >
        <View style={styles.countryModalContainer}>
          <View style={styles.countryModalHeader}>
            <Text style={styles.countryModalTitle}>Select Country</Text>
            <Pressable onPress={() => setShowCountryModal(false)}>
              <Ionicons name="close" size={24} color={Colors.dark.text} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {countries.length > 0 ? countries.map(({ country }) => (
              <Pressable
                key={country}
                style={[styles.countryOption, selectedCountry === country ? styles.countryOptionActive : null]}
                onPress={() => {
                  setSelectedCountry(country);
                  setSelectedCity(null);
                  setShowingAll(false);
                  setShowCountryModal(false);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }}
              >
                <Text style={[styles.countryOptionText, selectedCountry === country ? styles.countryOptionTextActive : null]}>
                  {country}
                </Text>
                {selectedCountry === country ? (
                  <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
                ) : null}
              </Pressable>
            )) : null}
            <Pressable
              style={[styles.countryOption, !selectedCountry || showingAll ? styles.countryOptionActive : null]}
              onPress={() => {
                setSelectedCountry(null);
                setSelectedCity(null);
                setShowingAll(true);
                setShowCountryModal(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
            >
              <Text style={[styles.countryOptionText, (!selectedCountry || showingAll) ? styles.countryOptionTextActive : null]}>
                Show all countries
              </Text>
              {(!selectedCountry || showingAll) ? (
                <Ionicons name="checkmark-circle" size={20} color={GlowColors.primary} />
              ) : null}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function SportSelectionStep({ data, setData, onNext }: StepProps) {
  const toggleSport = (sportKey: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setData(prev => {
      const current = prev.selectedSports;
      if (current.includes(sportKey)) {
        if (current.length === 1) return prev;
        return { ...prev, selectedSports: current.filter(s => s !== sportKey) };
      }
      return { ...prev, selectedSports: [...current, sportKey] };
    });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>Which sports do you play?</Text>
      <Text style={styles.stepSubtitle}>Select all that apply. We will personalise your experience for each sport.</Text>

      <View style={styles.sportGrid}>
        {SPORT_DEFINITIONS.map(sport => {
          const isSelected = data.selectedSports.includes(sport.key);
          return (
            <Pressable
              key={sport.key}
              style={[
                styles.sportCard,
                isSelected && { borderColor: sport.color, backgroundColor: sport.color + "15" },
              ]}
              onPress={() => toggleSport(sport.key)}
            >
              <View style={[styles.sportIconCircle, { backgroundColor: sport.color + "20" }]}>
                <Ionicons name={sport.icon as keyof typeof Ionicons.glyphMap} size={28} color={sport.color} />
              </View>
              <Text style={[styles.sportCardTitle, isSelected && { color: sport.color }]}>{sport.label}</Text>
              <Text style={styles.sportCardDesc}>{sport.description}</Text>
              {isSelected ? (
                <View style={[styles.sportCheckmark, { backgroundColor: sport.color }]}>
                  <Ionicons name="checkmark" size={12} color={Colors.dark.buttonText} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

    </ScrollView>
  );
}

function GoalSettingStep({ data, setData, onNext }: StepProps) {
  const [selectedGoals, setSelectedGoals] = useState<string[]>(data.shortTermGoals || []);
  const [longTermDream, setLongTermDream] = useState(data.longTermDream || "");

  const goalChips = [
    "Improve my serve",
    "Win a match",
    "Join a team",
    "Play consistently",
    "Have fun",
  ];

  const toggleGoal = (goal: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedGoals(prev => {
      const newGoals = prev.includes(goal) 
        ? prev.filter(g => g !== goal) 
        : [...prev, goal];
      setData(d => ({ ...d, shortTermGoals: newGoals, shortTermGoal: newGoals[0] || null }));
      return newGoals;
    });
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Set Your Goals</Text>
        <Text style={styles.stepSubtitle}>What do you want to achieve? (Select all that apply)</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>3-month goals</Text>
        <View style={styles.chipsContainer}>
          {goalChips.map((chip) => (
            <Pressable
              key={chip}
              style={[styles.chip, selectedGoals.includes(chip) ? styles.chipActive : null]}
              onPress={() => toggleGoal(chip)}
            >
              <Text style={[styles.chipText, selectedGoals.includes(chip) ? styles.chipTextActive : null]}>{chip}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>Tennis Dream (optional)</Text>
        <TextInput
          style={[styles.textInput, styles.textInputMultiline]}
          value={longTermDream}
          onChangeText={(text) => {
            setLongTermDream(text);
            setData((prev) => ({ ...prev, longTermDream: text }));
          }}
          placeholder="What's your tennis dream?"
          placeholderTextColor={Colors.dark.textMuted}
          multiline
          numberOfLines={3}
        />
      </Animated.View>
    </ScrollView>
  );
}

function ParentConnectStep({ data, setData, onNext }: StepProps) {
  const [email, setEmail] = useState(data.parentEmail || "");

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Connect Your Parent</Text>
        <Text style={styles.stepSubtitle}>Let's keep your parent in the loop!</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.sectionContainer}>
        <Text style={styles.sectionLabel}>Parent's Email</Text>
        <TextInput
          style={styles.textInput}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setData((prev) => ({ ...prev, parentEmail: text }));
          }}
          placeholder="parent@email.com"
          placeholderTextColor={Colors.dark.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={styles.hintText}>We'll send them updates about your progress</Text>
      </Animated.View>

      <Pressable
        style={styles.skipLink}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNext();
        }}
      >
        <Text style={styles.skipLinkText}>Skip for now</Text>
      </Pressable>
    </ScrollView>
  );
}

function TennisQuizStep({ data, setData, onNext }: StepProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);

  const questions = [
    {
      question: "What's the score when a game starts?",
      options: ["0-0", "Love-Love", "15-15", "First-First"],
      correct: "Love-Love",
    },
    {
      question: "What's it called when you hit the ball before it bounces?",
      options: ["Smash", "Volley", "Lob", "Drop shot"],
      correct: "Volley",
    },
    {
      question: "How many sets do you need to win a match?",
      options: ["1", "2", "3", "Depends on the tournament"],
      correct: "Depends on the tournament",
    },
  ];

  const handleAnswer = (answer: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    } else {
      const score = newAnswers.filter((a, i) => a === questions[i].correct).length;
      setData((prev) => ({ ...prev, quizScore: score, quizAnswers: newAnswers }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const quizComplete = answers.length === questions.length;
  const score = answers.filter((a, i) => a === questions[i].correct).length;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Tennis Quiz</Text>
        <Text style={styles.stepSubtitle}>
          {quizComplete ? "Nice try!" : `Question ${currentQuestion + 1} of ${questions.length}`}
        </Text>
      </Animated.View>

      {quizComplete ? (
        <Animated.View entering={ZoomIn} style={styles.quizResultContainer}>
          <View style={styles.quizScoreCircle}>
            <Text style={styles.quizScoreText}>{score}/{questions.length}</Text>
          </View>
          <Text style={styles.quizResultText}>
            {score === 3 ? "Perfect!" : score >= 2 ? "Great job!" : "Keep learning!"}
          </Text>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <Text style={styles.quizQuestion}>{questions[currentQuestion].question}</Text>
          <View style={styles.optionsContainer}>
            {questions[currentQuestion].options.map((option) => (
              <Pressable
                key={option}
                style={styles.selectableCard}
                onPress={() => handleAnswer(option)}
              >
                <Text style={styles.selectableCardText}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}

      <Pressable
        style={styles.skipLink}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onNext();
        }}
      >
        <Text style={styles.skipLinkText}>{quizComplete ? "Continue" : "Skip quiz"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const SAVE_MESSAGES = [
  "BUILDING YOUR PLAYER PROFILE...",
  "CALIBRATING GLOW RANK...",
  "LINKING TO ACADEMY NETWORK...",
  "INITIALIZING XP ENGINE...",
  "WELCOME TO THE COURT.",
];

function CompletionStep({ data, playerName, onComplete, isSaving }: StepProps & { onComplete: () => void; isSaving: boolean }) {
  const [showConfetti, setShowConfetti] = useState(true);
  const [saveMessageIdx, setSaveMessageIdx] = useState(0);

  const glowPulse = useSharedValue(0.7);
  const glowPulseStyle = useAnimatedStyle(() => ({
    opacity: glowPulse.value,
    transform: [{ scale: 0.9 + glowPulse.value * 0.2 }],
  }));

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const timer = setTimeout(() => setShowConfetti(false), 3000);
    glowPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900 }),
        withTiming(0.5, { duration: 900 })
      ),
      -1,
      false
    );
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isSaving) return;
    const interval = setInterval(() => {
      setSaveMessageIdx(prev => Math.min(prev + 1, SAVE_MESSAGES.length - 1));
    }, 700);
    return () => clearInterval(interval);
  }, [isSaving]);

  const formatExperience = (exp: string | null) => {
    if (!exp) return null;
    const map: Record<string, string> = {
      "new": "Beginner",
      "6-12months": "6-12 months",
      "1-3years": "1-3 years",
      "3-5years": "3-5 years",
      "5-10years": "5-10 years",
      "10-15years": "10-15 years",
      "15-20years": "15-20 years",
      "20+years": "20+ years",
    };
    return map[exp] || exp;
  };

  if (isSaving) {
    return (
      <View style={styles.cinematicSaveOverlay}>
        <View style={styles.cinematicGlowOuter}>
          <Animated.View style={[styles.cinematicGlowRing, glowPulseStyle]} />
          <View style={styles.cinematicGlowCore} />
        </View>
        <Text style={styles.cinematicSaveMessage}>{SAVE_MESSAGES[saveMessageIdx]}</Text>
        <Text style={styles.cinematicSaveSubtext}>PLAYER PROFILE INITIALIZING</Text>
      </View>
    );
  }

  return (
    <View style={styles.completionContainer}>
      {showConfetti ? <Confetti /> : null}

      <Animated.View entering={ZoomIn.delay(200).springify()} style={styles.completionIcon}>
        <Ionicons name="checkmark-circle" size={100} color={GlowColors.primary} />
      </Animated.View>

      <Animated.Text entering={FadeInDown.delay(400).duration(600)} style={styles.completionTitle}>
        You're all set{playerName ? `, ${playerName}` : ""}!
      </Animated.Text>

      <Animated.Text entering={FadeInDown.delay(600).duration(600)} style={styles.completionSubtitle}>
        Your profile is ready. Time to start your tennis journey!
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(800).duration(600)} style={styles.profileSummary}>
        {data.experienceLevel ? (
          <View style={styles.summaryItem}>
            <Ionicons name="time-outline" size={20} color={GlowColors.primary} />
            <Text style={styles.summaryText}>
              Experience: {formatExperience(data.experienceLevel)}
            </Text>
          </View>
        ) : null}
        {data.enjoymentTags.length > 0 ? (
          <View style={styles.summaryItem}>
            <Ionicons name="heart-outline" size={20} color={GlowColors.primary} />
            <Text style={styles.summaryText}>Enjoys: {data.enjoymentTags.join(", ")}</Text>
          </View>
        ) : null}
        {data.academyName ? (
          <View style={styles.summaryItem}>
            <Ionicons name="business-outline" size={20} color={GlowColors.primary} />
            <Text style={styles.summaryText}>Academy: {data.academyName}</Text>
          </View>
        ) : null}
      </Animated.View>

      {!data.academyId ? (
        <Animated.View entering={FadeInDown.delay(900).duration(600)} style={styles.inviteNudgeCard}>
          <Ionicons name="people" size={24} color={GlowColors.primary} />
          <Text style={styles.inviteNudgeTitle}>Nodig je eerste tennismaatje uit</Text>
          <Text style={styles.inviteNudgeSubtitle}>Play and grow together with friends</Text>
          <Pressable
            style={styles.inviteNudgeBtn}
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              try {
                let inviteLink = "https://glowuptennis.app";
                try {
                  const res = await apiRequest("GET", "/api/player/me/invite-link");
                  if (res.ok) {
                    const json = await res.json();
                    if (json.link) inviteLink = json.link;
                  }
                } catch {}
                await Share.share({
                  message: `Speel tennis met mij op Glow Up Tennis! Download de app en start je reis: ${inviteLink}`,
                  title: "Nodig tennismaatjes uit",
                });
              } catch {}
            }}
          >
            <Ionicons name="share-social" size={16} color={Colors.dark.buttonText} />
            <Text style={styles.inviteNudgeBtnText}>Nodig uit</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInUp.delay(1000).duration(600)}>
        <Pressable
          style={styles.completionButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onComplete();
          }}
        >
          <Text style={styles.completionButtonText}>ENTER THE ARENA</Text>
          <Ionicons name="rocket-outline" size={22} color={Colors.dark.buttonText} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

interface Props {
  onComplete: () => void;
}

export default function PlayerOnboardingV2Screen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, refreshAuth } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    dateOfBirth: null,
    gender: null,
    profilePhotoUri: null,
    ballLevel: null,
    selectedSports: ["tennis"],
    motivationType: null,
    motivationTypes: [],
    experienceLevel: null,
    height: null,
    tshirtSize: null,
    dominantHand: null,
    backhandType: null,
    tennisIdol: null,
    customIdol: null,
    enjoymentTags: [],
    focusGoals: [],
    typicalPlayTimes: [],
    academyId: null,
    academyName: null,
    shortTermGoal: null,
    shortTermGoals: [],
    longTermDream: null,
    parentEmail: null,
    quizScore: 0,
    quizAnswers: [],
    playStyle: null,
  });

  const [completionSaving, setCompletionSaving] = useState(false);

  const playerName = user?.username || "";
  const age = data.dateOfBirth ? calculateAge(data.dateOfBirth) : null;
  const ageGroup = age !== null ? getAgeGroup(age) : "adult";
  const needsParentConnect = age !== null && age < 16;
  const isBeginner = data.experienceLevel === "new";

  const saveMutation = useMutation({
    mutationFn: async (onboardingData: OnboardingData) => {
      const payload = {
        dateOfBirth: onboardingData.dateOfBirth,
        ballLevel: onboardingData.ballLevel,
        motivationType: onboardingData.motivationType,
        experienceLevel: onboardingData.experienceLevel,
        height: onboardingData.height,
        tshirtSize: onboardingData.tshirtSize,
        dominantHand: onboardingData.dominantHand,
        backhandType: onboardingData.backhandType,
        tennisIdol: onboardingData.tennisIdol === "other" ? onboardingData.customIdol : onboardingData.tennisIdol,
        enjoymentTags: onboardingData.enjoymentTags,
        focusGoals: onboardingData.focusGoals,
        typicalPlayTimes: onboardingData.typicalPlayTimes,
        academyId: onboardingData.academyId,
        shortTermGoal: onboardingData.shortTermGoal,
        longTermDream: onboardingData.longTermDream,
        quizScore: onboardingData.quizScore,
        playStyle: onboardingData.playStyle,
        sportProfiles: onboardingData.selectedSports.reduce<Record<string, {}>>((acc, sport) => {
          acc[sport] = {};
          return acc;
        }, {}),
      };
      const response = await apiRequest("POST", "/api/player/me/onboarding", payload);
      const result = await response.json();
      
      logger.log("[Onboarding] Photo upload check:", { 
        hasPhotoUri: !!onboardingData.profilePhotoUri, 
        platform: Platform.OS,
        photoUri: onboardingData.profilePhotoUri 
      });
      
      if (onboardingData.profilePhotoUri) {
        try {
          logger.log("[Onboarding] Uploading profile photo...");
          const formData = new FormData();
          const authToken = await import("@/lib/auth").then(m => m.getAuthToken());
          
          if (Platform.OS === 'web') {
            logger.log("[Onboarding] Web platform - converting blob URL to File...");
            
            if (!onboardingData.profilePhotoUri.startsWith('blob:')) {
              console.warn("[Onboarding] Photo URI is not a blob URL:", onboardingData.profilePhotoUri.substring(0, 50));
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            try {
              const blobResponse = await fetch(onboardingData.profilePhotoUri, { signal: controller.signal });
              clearTimeout(timeoutId);
              
              if (!blobResponse.ok) {
                console.warn("[Onboarding] Failed to fetch blob URL:", blobResponse.status);
                throw new Error(`Failed to fetch blob: ${blobResponse.status}`);
              }
              
              const blob = await blobResponse.blob();
              logger.log("[Onboarding] Blob fetched successfully, size:", blob.size, "type:", blob.type);
              
              if (blob.size === 0) {
                console.warn("[Onboarding] Blob is empty, skipping upload");
                return result;
              }
              
              const extension = blob.type.split('/')[1] || 'png';
              const webFile = new window.File([blob], `profile-photo.${extension}`, { type: blob.type });
              formData.append("photo", webFile);
            } catch (blobError: any) {
              if (blobError.name === 'AbortError') {
                console.warn("[Onboarding] Photo blob fetch timed out after 30s");
              } else {
                console.warn("[Onboarding] Failed to fetch blob:", blobError.message || blobError);
              }
              return result;
            }
          } else {
            const uri = onboardingData.profilePhotoUri;
            const filename = uri.split('/').pop() || 'photo.jpg';
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1].toLowerCase().replace('jpg', 'jpeg')}` : 'image/jpeg';
            formData.append("photo", { uri, name: filename, type } as any);
          }
          
          logger.log("[Onboarding] Uploading to server...");
          const uploadController = new AbortController();
          const uploadTimeoutId = setTimeout(() => uploadController.abort(), 60000);
          
          const photoResponse = await fetch(new URL("/api/player/me/photo", getApiUrl()).toString(), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
            body: formData,
            signal: uploadController.signal,
          });
          clearTimeout(uploadTimeoutId);
          
          logger.log("[Onboarding] Photo upload response:", photoResponse.status);
          if (!photoResponse.ok) {
            const errorText = await photoResponse.text();
            console.warn("[Onboarding] Photo upload failed:", errorText);
          } else {
            const uploadResult = await photoResponse.json();
            logger.log("[Onboarding] Photo upload successful!", uploadResult);
          }
        } catch (photoError: any) {
          const errorMessage = photoError?.message || photoError?.name || String(photoError) || 'Unknown error';
          console.warn("[Onboarding] Failed to upload profile photo:", errorMessage);
        }
      }
      
      return result;
    },
    onSuccess: async (responseData: { success: boolean; playerId: string; token?: string; refreshToken?: string }) => {
      if (responseData.token && user) {
        setAuthToken(responseData.token);
        const updatedUser: AuthUser = {
          ...user,
          playerId: responseData.playerId,
        };
        await saveAuthState(responseData.token, updatedUser, responseData.refreshToken);
      }
      await refreshAuth();
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    },
    onError: () => {
      setCompletionSaving(false);
      Alert.alert(
        "Save Failed",
        "Could not save your profile. Please check your connection and try again.",
        [{ text: "OK" }]
      );
    },
  });

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    setCompletionSaving(true);
    saveMutation.mutate(data);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return true; // Welcome
      case 1: return !!data.dateOfBirth; // Birthday
      case 2: return !!data.gender; // Gender
      case 3: return true; // Photo (optional)
      case 4: return true; // Ball/Glow Level Reveal
      case 5: return true; // Platform Welcome Video
      case 6: return (data.motivationTypes?.length || 0) > 0; // Why Tennis
      case 7: return !!data.experienceLevel; // Experience
      case 8: return !!data.dominantHand; // About Yourself
      case 9: return true; // Play Style (skippable)
      case 10: return true; // Tennis Idol (optional)
      case 11: return data.enjoymentTags.length > 0; // Enjoyment
      case 12: return data.focusGoals.length > 0; // Focus Goals
      case 13: return data.typicalPlayTimes.length > 0; // Availability
      case 14: return true; // Academy Selection
      case 15: return true; // Academy Welcome Video
      case 16: return true; // Goal Setting
      case 17: return true; // Sport Selection
      case 18: return true; // Parent Connect
      case 19: return true; // Completion
      default: return false;
    }
  };

  const renderStep = () => {
    const stepProps: StepProps = { data, setData, onNext: handleNext, playerName, age: age || 18, ageGroup };

    switch (currentStep) {
      case 0: return <WelcomeStep {...stepProps} />;
      case 1: return <BirthdayStep {...stepProps} />;
      case 2: return <GenderStep {...stepProps} />;
      case 3: return <PhotoUploadStep {...stepProps} />;
      case 4: return age !== null ? <BallLevelRevealStep {...stepProps} age={age} /> : null;
      case 5: return <PlatformWelcomeVideoStep {...stepProps} />;
      case 6: return <WhyTennisStep {...stepProps} />;
      case 7: return <ExperienceStep {...stepProps} age={age || undefined} />;
      case 8: return <AboutYourselfStep {...stepProps} />;
      case 9: return <PlayStyleStep {...stepProps} />;
      case 10: return <TennisIdolStep {...stepProps} />;
      case 11: return <EnjoymentStep {...stepProps} />;
      case 12: return <FocusGoalsStep {...stepProps} />;
      case 13: return <AvailabilityStep {...stepProps} />;
      case 14: return <AcademySelectionStep {...stepProps} />;
      case 15: return <AcademyWelcomeVideoStep {...stepProps} />;
      case 16: return <GoalSettingStep {...stepProps} />;
      case 17: return <SportSelectionStep {...stepProps} />;
      case 18: return needsParentConnect ? <ParentConnectStep {...stepProps} /> : <CompletionStep {...stepProps} onComplete={handleComplete} isSaving={completionSaving} />;
      case 19: return <CompletionStep {...stepProps} onComplete={handleComplete} isSaving={completionSaving} />;
      default: return null;
    }
  };

  const isCompletionStep = currentStep === TOTAL_STEPS - 1 || (currentStep === 18 && !needsParentConnect);

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      <LinearGradient
        colors={["rgba(200, 255, 61, 0.08)", "transparent"]}
        style={styles.gradient}
      />

      {!isCompletionStep ? <ProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS} /> : null}

      <View style={styles.content}>{renderStep()}</View>

      {!isCompletionStep && currentStep !== 0 ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          {currentStep > 0 ? (
            <Pressable style={styles.backButton} onPress={handleBack}>
              <Ionicons name="chevron-back" size={20} color={Colors.dark.textMuted} />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.backButton} />
          )}

          {![0, 1, 2, 4, 5, 6, 7, 14].includes(currentStep) ? (
            <Pressable
              style={[styles.nextButton, !canProceed() ? styles.nextButtonDisabled : null]}
              onPress={handleNext}
              disabled={!canProceed()}
            >
              <Text style={styles.nextButtonText}>Next</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.dark.buttonText} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 400,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Backgrounds.surface,
  },
  progressDotActive: {
    backgroundColor: GlowColors.primary,
  },
  progressDotCurrent: {
    width: 24,
    borderRadius: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  stepContainer: {
    flexGrow: 1,
    paddingBottom: Spacing["2xl"],
  },
  stepTitle: {
    ...Typography.h1,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  welcomeGradient: {
    ...StyleSheet.absoluteFillObject,
    height: SCREEN_HEIGHT * 0.5,
  },
  logoContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing["2xl"],
    ...Shadows.glow,
  },
  welcomeTitle: {
    ...Typography.h1,
    fontSize: 32,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  welcomeSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing["2xl"],
    paddingHorizontal: Spacing.xl,
    lineHeight: 24,
  },
  welcomeCTA: {
    marginBottom: Spacing.lg,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    ...Shadows.glow,
  },
  primaryButtonSecondary: {
    backgroundColor: Backgrounds.elevated,
    ...Shadows.none,
  },
  primaryButtonText: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
  primaryButtonTextSecondary: {
    color: Colors.dark.text,
  },
  skipButton: {
    paddingVertical: Spacing.md,
    alignSelf: "center",
  },
  skipButtonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  archetypeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  archetypeCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm * 2) / 2 - 2,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: "flex-start",
    gap: Spacing.xs,
    position: "relative",
    minHeight: 110,
  },
  archetypeIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  archetypeName: {
    ...Typography.body,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 18,
  },
  archetypeTagline: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  archetypeCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  skipLink: {
    alignSelf: "center",
    paddingVertical: Spacing.lg,
  },
  skipLinkText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  datePickerButtonActive: {
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}10`,
  },
  datePickerText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    flex: 1,
  },
  datePickerTextActive: {
    color: Colors.dark.text,
  },
  ageBadge: {
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  ageBadgeText: {
    ...Typography.small,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  ageGroupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(200, 255, 61, 0.2)",
  },
  ageGroupText: {
    ...Typography.body,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Backgrounds.overlay,
    justifyContent: "center",
    alignItems: "center",
  },
  datePickerModal: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: Backgrounds.elevated,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  datePickerModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  datePickerColumns: {
    flexDirection: "row",
    gap: Spacing.md,
    height: 200,
  },
  datePickerColumn: {
    flex: 1,
  },
  datePickerColumnLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  datePickerScroll: {
    flex: 1,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
  },
  datePickerItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
  },
  datePickerItemActive: {
    backgroundColor: `${GlowColors.primary}20`,
  },
  datePickerItemText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  datePickerItemTextActive: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  datePickerActions: {
    flexDirection: "row",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  datePickerCancelButton: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
  },
  datePickerCancelText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  datePickerConfirmButton: {
    flex: 1,
    padding: Spacing.md,
    alignItems: "center",
    backgroundColor: GlowColors.primary,
    borderRadius: BorderRadius.md,
  },
  datePickerConfirmButtonDisabled: {
    opacity: 0.5,
  },
  datePickerConfirmText: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  photoUploadContainer: {
    alignItems: "center",
    gap: Spacing.xl,
    marginTop: Spacing.xl,
  },
  avatarContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  avatarContainerActive: {
    borderColor: GlowColors.primary,
  },
  avatarImage: {
    width: 144,
    height: 144,
    borderRadius: 72,
  },
  photoButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  photoButtonText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  photoActions: {
    marginTop: Spacing["2xl"],
    alignItems: "center",
  },
  ballLevelContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  ballLevelCard: {
    alignItems: "center",
    padding: Spacing["2xl"],
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    marginVertical: Spacing["2xl"],
    width: "100%",
    ...Shadows.glowSubtle,
  },
  ballIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  ballLevelTitle: {
    ...Typography.h1,
    marginBottom: Spacing.md,
  },
  ballLevelDescription: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  loadingBall: {
    alignItems: "center",
    marginVertical: Spacing["2xl"],
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    marginTop: Spacing.md,
  },
  optionsContainer: {
    gap: Spacing.md,
  },
  selectableCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectableCardActive: {
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}10`,
  },
  selectableCardText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  selectableCardTextActive: {
    color: GlowColors.primary,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GlowColors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  chipSmall: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  chipActive: {
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}10`,
  },
  chipText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  chipTextActive: {
    color: GlowColors.primary,
  },
  sectionContainer: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  textInput: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  textInputMultiline: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  hintText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  handSelector: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  handButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  handButtonActive: {
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}10`,
  },
  handButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  handButtonTextActive: {
    color: GlowColors.primary,
  },
  idolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  idolCard: {
    width: "47%",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  idolCardActive: {
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}10`,
  },
  idolCardText: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
  },
  idolCardTextActive: {
    color: GlowColors.primary,
  },
  enjoymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  enjoymentCard: {
    width: "47%",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  enjoymentCardActive: {
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}10`,
  },
  enjoymentCardDisabled: {
    opacity: 0.4,
  },
  enjoymentCardText: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
  },
  enjoymentCardTextActive: {
    color: GlowColors.primary,
  },
  selectionCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  academyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  academyCardActive: {
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}10`,
  },
  academyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Backgrounds.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  academyInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  academyName: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  academyNameActive: {
    color: GlowColors.primary,
  },
  academyStats: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    paddingVertical: Spacing.xl,
  },
  locationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  locationLabel: {
    ...Typography.small,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  changeCountryLink: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textDecorationLine: "underline",
  },
  changeCountryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}12`,
  },
  changeCountryButtonText: {
    ...Typography.small,
    color: GlowColors.primary,
    fontWeight: "600",
  },
  cityChipsRow: {
    marginBottom: Spacing.md,
    flexGrow: 0,
  },
  cityChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cityChipActive: {
    backgroundColor: `${GlowColors.primary}20`,
    borderColor: GlowColors.primary,
  },
  cityChipText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  cityChipTextActive: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  noLocalNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.xs,
    padding: Spacing.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  noLocalNoteText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  countryModalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
    paddingTop: Spacing.lg,
  },
  countryModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  countryModalTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  countryOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  countryOptionActive: {
    backgroundColor: `${GlowColors.primary}10`,
  },
  countryOptionText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  countryOptionTextActive: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  quizQuestion: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  quizResultContainer: {
    alignItems: "center",
    marginVertical: Spacing["2xl"],
  },
  quizScoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Backgrounds.card,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: GlowColors.primary,
    ...Shadows.glow,
  },
  quizScoreText: {
    ...Typography.numberLarge,
    color: GlowColors.primary,
  },
  quizResultText: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginTop: Spacing.lg,
  },
  completionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  completionIcon: {
    marginBottom: Spacing.xl,
  },
  completionTitle: {
    ...Typography.h1,
    fontSize: 28,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  completionSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing["2xl"],
  },
  profileSummary: {
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
    width: "100%",
  },
  summaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
  },
  summaryText: {
    ...Typography.small,
    color: Colors.dark.text,
  },
  completionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    ...Shadows.glow,
  },
  completionButtonText: {
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.buttonText,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  cinematicSaveOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  cinematicGlowOuter: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  cinematicGlowRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: GlowColors.primary,
    backgroundColor: "rgba(200, 255, 61, 0.06)",
  },
  cinematicGlowCore: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GlowColors.primary,
    shadowColor: GlowColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
    elevation: 8,
  },
  cinematicSaveMessage: {
    fontSize: 16,
    fontWeight: "800",
    color: GlowColors.primary,
    letterSpacing: 2,
    textAlign: "center",
    textTransform: "uppercase",
  },
  cinematicSaveSubtext: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.textMuted,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    minWidth: 80,
  },
  backButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  sportGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.xl,
    justifyContent: "center",
  },
  sportCard: {
    width: (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.md) / 2 - 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.10)",
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.sm,
    position: "relative",
  },
  sportIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  sportCardTitle: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  sportCardDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  sportCheckmark: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  adjustLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  adjustLinkText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  adjustModal: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: SCREEN_WIDTH - Spacing.xl * 2,
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  adjustModalTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  adjustModalSubtitle: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  adjustOptions: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  adjustOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Backgrounds.surface,
    borderRadius: BorderRadius.lg,
  },
  adjustBallIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  adjustOptionInfo: {
    flex: 1,
  },
  adjustOptionLabel: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  adjustOptionDesc: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  adjustCancelButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  adjustCancelText: {
    ...Typography.body,
    color: GlowColors.primary,
  },
  genderContainer: {
    gap: Spacing.md,
  },
  genderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  genderCardActive: {
    borderColor: GlowColors.primary,
    backgroundColor: `${GlowColors.primary}10`,
  },
  genderIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Backgrounds.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  genderIconActive: {
    backgroundColor: GlowColors.primary,
  },
  genderText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  genderTextActive: {
    color: GlowColors.primary,
    fontWeight: "600",
  },
  videoContainer: {
    marginVertical: Spacing.xl,
  },
  videoPlayer: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  videoPlaceholder: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  videoPlaceholderText: {
    ...Typography.h3,
    color: Colors.dark.text,
    marginTop: Spacing.sm,
  },
  videoPlaceholderSubtext: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  videoUrlHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
  },
  videoFeatures: {
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  videoFeatureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
  },
  videoFeatureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  videoFeatureText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  academyHighlights: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
  },
  academyHighlightsTitle: {
    ...Typography.h4,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
  },
  nextStepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  nextStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GlowColors.secondary,
    justifyContent: "center",
    alignItems: "center",
  },
  nextStepNumberText: {
    ...Typography.small,
    color: "#fff",
    fontWeight: "600",
  },
  nextStepText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  birthdayNextContainer: {
    marginTop: Spacing.xl,
  },
  videoNextContainer: {
    marginTop: Spacing.xl,
  },
  inviteNudgeCard: {
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: `${GlowColors.primary}30`,
    marginBottom: Spacing.lg,
    width: "100%",
  },
  inviteNudgeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.text,
    textAlign: "center",
  },
  inviteNudgeSubtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  inviteNudgeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xs,
  },
  inviteNudgeBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.buttonText,
  },
});
