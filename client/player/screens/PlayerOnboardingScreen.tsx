import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
  TextInput,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, { 
  FadeIn, 
  FadeInDown,
  useAnimatedStyle, 
  withSpring,
  interpolate,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Colors, Spacing, Typography, BorderRadius, CardStyles, GlowColors } from "@/constants/theme";
import { apiRequest, getApiUrl, apiFetch } from "@/lib/query-client";
import { saveAuthState, setAuthToken, AuthUser } from "@/lib/auth";
import { useAuth } from "@/coach/context/AuthContext";
import { TshirtSize } from "@shared/schema";

import { makeReactiveStyles } from "@/hooks/useThemedStyles";
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingData {
  academyId: string | null;
  academyName: string | null;
  motivationType: string | null;
  dateOfBirth: string | null;
  height: number | null;
  tshirtSize: TshirtSize | null;
  dominantHand: string | null;
  backhandType: string | null;
  experienceLevel: string | null;
  enjoymentTags: string[];
  focusGoals: string[];
  selfConfidenceFlags: string[];
}

interface Academy {
  id: string;
  name: string;
  slug: string;
  coachCount: number;
  playerCount: number;
}

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
}

const MOTIVATION_OPTIONS = [
  { id: "fun", label: "I play tennis for fun", icon: "happy-outline" },
  { id: "improve", label: "I want to improve seriously", icon: "trending-up-outline" },
  { id: "compete", label: "I want to compete", icon: "trophy-outline" },
  { id: "unsure", label: "I'm not sure yet", icon: "help-circle-outline" },
];

const EXPERIENCE_OPTIONS = [
  { id: "new", label: "New to tennis" },
  { id: "6-12months", label: "6-12 months" },
  { id: "1-3years", label: "1-3 years" },
  { id: "3-5years", label: "3-5 years" },
  { id: "5-10years", label: "5-10 years" },
  { id: "10-20years", label: "10-20 years" },
  { id: "20+years", label: "20+ years" },
];

const BACKHAND_OPTIONS = [
  { id: "single", label: "Single-handed", icon: "hand-right-outline" },
  { id: "double", label: "Double-handed", icon: "body-outline" },
];

const HAND_OPTIONS = [
  { id: "right", label: "Right-handed", icon: "hand-right-outline" },
  { id: "left", label: "Left-handed", icon: "hand-left-outline" },
];

const TSHIRT_SIZE_OPTIONS: { id: TshirtSize; label: string; isKids?: boolean }[] = [
  { id: "2T", label: "2T", isKids: true },
  { id: "3T", label: "3T", isKids: true },
  { id: "4T", label: "4T", isKids: true },
  { id: "YXS", label: "Youth XS", isKids: true },
  { id: "YS", label: "Youth S", isKids: true },
  { id: "YM", label: "Youth M", isKids: true },
  { id: "YL", label: "Youth L", isKids: true },
  { id: "YXL", label: "Youth XL", isKids: true },
  { id: "XS", label: "XS" },
  { id: "S", label: "S" },
  { id: "M", label: "M" },
  { id: "L", label: "L" },
  { id: "XL", label: "XL" },
  { id: "XXL", label: "XXL" },
  { id: "XXXL", label: "XXXL" },
];

const ENJOYMENT_OPTIONS = [
  { id: "rallies", label: "Hitting rallies", icon: "repeat-outline" },
  { id: "winning", label: "Winning points", icon: "star-outline" },
  { id: "technique", label: "Learning technique", icon: "school-outline" },
  { id: "social", label: "Playing with others", icon: "people-outline" },
  { id: "active", label: "Being active", icon: "fitness-outline" },
  { id: "competing", label: "Competing", icon: "ribbon-outline" },
];

const FOCUS_OPTIONS = [
  { id: "technique", label: "Technique", icon: "construct-outline" },
  { id: "confidence", label: "Confidence", icon: "shield-checkmark-outline" },
  { id: "fitness", label: "Fitness", icon: "barbell-outline" },
  { id: "focus", label: "Focus", icon: "eye-outline" },
  { id: "strategy", label: "Playing smarter", icon: "bulb-outline" },
  { id: "social", label: "Social / Teamwork", icon: "people-circle-outline" },
];

const CONFIDENCE_OPTIONS = [
  { id: "confident", label: "I feel confident on court" },
  { id: "basics", label: "I know the basics" },
  { id: "nervous", label: "I get nervous in matches" },
  { id: "learning", label: "I'm still learning fundamentals" },
];

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

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

function ProgressBar({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  return (
    <View style={styles.progressContainer}>
      {Array.from({ length: totalSteps }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.progressDot,
            index <= currentStep ? styles.progressDotActive : null,
          ]}
        />
      ))}
    </View>
  );
}

function SelectableCard({ 
  selected, 
  onPress, 
  label, 
  icon,
  disabled,
}: { 
  selected: boolean; 
  onPress: () => void; 
  label: string;
  icon?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.selectableCard,
        selected ? styles.selectableCardActive : null,
        disabled ? styles.selectableCardDisabled : null,
      ]}
      onPress={() => {
        if (!disabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }
      }}
      disabled={disabled}
    >
      {icon ? (
        <Ionicons 
          name={icon as any} 
          size={24} 
          color={selected ? Colors.dark.primary : Colors.dark.textMuted} 
        />
      ) : null}
      <Text style={[
        styles.selectableCardText,
        selected ? styles.selectableCardTextActive : null,
      ]}>
        {label}
      </Text>
      {selected ? (
        <View style={styles.checkIcon}>
          <Ionicons name="checkmark" size={16} color={Colors.dark.buttonText} />
        </View>
      ) : null}
    </Pressable>
  );
}

interface JoinCodeAcademy {
  id: string;
  name: string;
  slug: string;
  city?: string;
  country?: string;
  description?: string;
  coachCount: number;
  playerCount: number;
}

function AcademySelectionStep({ data, setData, onNext }: StepProps) {
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);
  const [foundAcademy, setFoundAcademy] = useState<JoinCodeAcademy | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [showBrowse, setShowBrowse] = useState(false);

  const { data: academiesData, isLoading, isError, refetch, isFetching } = useQuery<{ academies: Academy[] }>({
    queryKey: ["/api/academies/browse"],
    enabled: showBrowse,
  });

  const academies = academiesData?.academies || [];

  const handleJoinCodeLookup = async () => {
    if (joinCode.length < 4) {
      setJoinCodeError("Please enter at least 4 characters");
      return;
    }
    
    setIsLookingUp(true);
    setJoinCodeError(null);
    setFoundAcademy(null);
    
    try {
      const response = await apiFetch(`/api/academies/join-code/${joinCode.toUpperCase()}`);
      const result = await response.json();
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setJoinCodeError("Please log in again to search for academies");
        } else {
          setJoinCodeError(result.error || "Academy not found");
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        setFoundAcademy(result.academy);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      setJoinCodeError("Connection error. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleSelectAcademy = (academy: { id: string; name: string }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setData((prev) => ({ 
      ...prev, 
      academyId: academy.id,
      academyName: academy.name,
    }));
    setTimeout(onNext, 300);
  };

  if (isLoading && showBrowse) {
    return (
      <View style={styles.stepContainer}>
        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
          <Text style={styles.stepTitle}>Find Your Academy</Text>
          <Text style={styles.stepSubtitle}>
            Loading available academies...
          </Text>
        </Animated.View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Please wait...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.stepContainer} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Find Your Academy</Text>
        <Text style={styles.stepSubtitle}>
          Enter the code your coach gave you, or browse available academies.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.joinCodeSection}>
        <View style={styles.joinCodeInputRow}>
          <TextInput
            style={styles.joinCodeInput}
            value={joinCode}
            onChangeText={(text) => {
              setJoinCode(text.toUpperCase());
              setJoinCodeError(null);
              setFoundAcademy(null);
            }}
            placeholder="Enter join code (e.g. ABC123)"
            placeholderTextColor={Colors.dark.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />
          <Pressable
            style={[styles.lookupButton, isLookingUp && styles.buttonDisabled]}
            onPress={handleJoinCodeLookup}
            disabled={isLookingUp || joinCode.length < 4}
          >
            {isLookingUp ? (
              <Text style={styles.lookupButtonText}>...</Text>
            ) : (
              <Ionicons name="search" size={20} color={Colors.dark.buttonText} />
            )}
          </Pressable>
        </View>
        
        {joinCodeError ? (
          <Text style={styles.joinCodeError}>{joinCodeError}</Text>
        ) : null}
        
        {foundAcademy ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.foundAcademyCard}>
            <View style={styles.foundAcademyHeader}>
              <View style={styles.academyIconContainer}>
                <Ionicons name="checkmark-circle" size={28} color={Colors.dark.primary} />
              </View>
              <View style={styles.academyInfo}>
                <Text style={[styles.academyName, styles.academyNameActive]}>{foundAcademy.name}</Text>
                {foundAcademy.city || foundAcademy.country ? (
                  <Text style={styles.academyLocation}>
                    {[foundAcademy.city, foundAcademy.country].filter(Boolean).join(", ")}
                  </Text>
                ) : null}
                <Text style={styles.academyStats}>
                  {foundAcademy.coachCount} coach{foundAcademy.coachCount !== 1 ? "es" : ""} · {foundAcademy.playerCount} player{foundAcademy.playerCount !== 1 ? "s" : ""}
                </Text>
              </View>
            </View>
            {foundAcademy.description ? (
              <Text style={styles.academyDescription}>{foundAcademy.description}</Text>
            ) : null}
            <Pressable
              style={styles.joinFoundAcademyButton}
              onPress={() => handleSelectAcademy(foundAcademy)}
            >
              <Ionicons name="arrow-forward" size={18} color={Colors.dark.buttonText} />
              <Text style={styles.joinFoundAcademyText}>Join {foundAcademy.name}</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </Animated.View>

      {!showBrowse ? (
        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
          <Pressable
            style={styles.browseButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowBrowse(true);
            }}
          >
            <Ionicons name="globe-outline" size={20} color={Colors.dark.primary} />
            <Text style={styles.browseButtonText}>Browse All Academies</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.optionsContainer}>
          {isError ? (
            <View style={styles.errorContainer}>
              <Ionicons name="cloud-offline-outline" size={48} color={Colors.dark.textMuted} />
              <Pressable
                style={styles.retryButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  refetch();
                }}
                disabled={isFetching}
              >
                <Ionicons name="refresh-outline" size={20} color={Colors.dark.buttonText} />
                <Text style={styles.retryButtonText}>
                  {isFetching ? "Retrying..." : "Try Again"}
                </Text>
              </Pressable>
            </View>
          ) : academies.length === 0 ? (
            <View style={styles.emptyAcademiesContainer}>
              <Ionicons name="business-outline" size={48} color={Colors.dark.textMuted} />
              <Text style={styles.emptyAcademiesText}>No academies available</Text>
              <Text style={styles.emptyAcademiesSubtext}>
                Ask your coach for a join code to get started.
              </Text>
            </View>
          ) : (
            academies.map((academy) => (
              <Pressable
                key={academy.id}
                style={[
                  styles.academyCard,
                  data.academyId === academy.id ? styles.academyCardActive : null,
                ]}
                onPress={() => handleSelectAcademy(academy)}
              >
                <View style={styles.academyIconContainer}>
                  <Ionicons 
                    name="tennisball-outline" 
                    size={28} 
                    color={data.academyId === academy.id ? Colors.dark.primary : Colors.dark.textMuted} 
                  />
                </View>
                <View style={styles.academyInfo}>
                  <Text style={[
                    styles.academyName,
                    data.academyId === academy.id ? styles.academyNameActive : null,
                  ]}>
                    {academy.name}
                  </Text>
                  <Text style={styles.academyStats}>
                    {academy.coachCount} coaches · {academy.playerCount} players
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
          )}
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.skipSection}>
        <Pressable
          style={styles.skipButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onNext();
          }}
        >
          <Text style={styles.skipButtonText}>Continue without an academy</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.dark.textMuted} />
        </Pressable>
        <Text style={styles.skipHint}>You can join an academy later from your profile</Text>
      </Animated.View>
    </ScrollView>
  );
}

function WelcomeStep({ data, setData, onNext }: StepProps) {
  return (
    <View style={styles.stepContainer}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Welcome to Glow Up Sports</Text>
        <Text style={styles.stepSubtitle}>
          This app helps you grow as a player — at your own pace.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.optionsContainer}>
        {MOTIVATION_OPTIONS.map((option) => (
          <SelectableCard
            key={option.id}
            selected={data.motivationType === option.id}
            onPress={() => {
              setData((prev) => ({ ...prev, motivationType: option.id }));
              setTimeout(onNext, 300);
            }}
            label={option.label}
            icon={option.icon}
          />
        ))}
      </Animated.View>
    </View>
  );
}

function DateOfBirthPicker({ 
  value, 
  onChange 
}: { 
  value: string | null; 
  onChange: (date: string) => void;
}) {
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

  const handleOpenPicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (value) {
      const date = new Date(value);
      setSelectedYear(date.getFullYear());
      setSelectedMonth(date.getMonth());
      setSelectedDay(date.getDate());
    } else {
      setSelectedYear(null);
      setSelectedMonth(null);
      setSelectedDay(null);
    }
    setShowPicker(true);
  };

  const handleConfirm = () => {
    if (selectedYear !== null && selectedMonth !== null && selectedDay !== null) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
      onChange(dateStr);
      setShowPicker(false);
    }
  };

  const age = value ? calculateAge(value) : null;
  const ageDisplay = age !== null && !isNaN(age) ? `${age} years old` : null;

  return (
    <>
      <Pressable
        style={[styles.datePickerButton, value ? styles.datePickerButtonActive : null]}
        onPress={handleOpenPicker}
      >
        <Ionicons 
          name="calendar-outline" 
          size={22} 
          color={value ? Colors.dark.primary : Colors.dark.textMuted} 
        />
        <Text style={[styles.datePickerText, value ? styles.datePickerTextActive : null]}>
          {value ? formatDate(value) : "Select your date of birth"}
        </Text>
        {ageDisplay ? (
          <View style={styles.ageBadge}>
            <Text style={styles.ageBadgeText}>{ageDisplay}</Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        visible={showPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setShowPicker(false)}
        >
          <Pressable style={styles.datePickerModal} onPress={() => {}}>
            <Text style={styles.datePickerModalTitle}>Select Date of Birth</Text>
            
            <View style={styles.datePickerColumns}>
              <View style={styles.datePickerColumn}>
                <Text style={styles.datePickerColumnLabel}>Year</Text>
                <ScrollView style={styles.datePickerScroll} showsVerticalScrollIndicator={false}>
                  {years.map((year) => (
                    <Pressable
                      key={year}
                      style={[
                        styles.datePickerItem,
                        selectedYear === year ? styles.datePickerItemActive : null,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedYear(year);
                      }}
                    >
                      <Text style={[
                        styles.datePickerItemText,
                        selectedYear === year ? styles.datePickerItemTextActive : null,
                      ]}>
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
                      style={[
                        styles.datePickerItem,
                        selectedMonth === index ? styles.datePickerItemActive : null,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedMonth(index);
                      }}
                    >
                      <Text style={[
                        styles.datePickerItemText,
                        selectedMonth === index ? styles.datePickerItemTextActive : null,
                      ]}>
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
                      style={[
                        styles.datePickerItem,
                        selectedDay === day ? styles.datePickerItemActive : null,
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedDay(day);
                      }}
                    >
                      <Text style={[
                        styles.datePickerItemText,
                        selectedDay === day ? styles.datePickerItemTextActive : null,
                      ]}>
                        {day}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.datePickerActions}>
              <Pressable
                style={styles.datePickerCancelButton}
                onPress={() => setShowPicker(false)}
              >
                <Text style={styles.datePickerCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.datePickerConfirmButton,
                  (selectedYear === null || selectedMonth === null || selectedDay === null) 
                    ? styles.datePickerConfirmButtonDisabled : null,
                ]}
                onPress={handleConfirm}
                disabled={selectedYear === null || selectedMonth === null || selectedDay === null}
              >
                <Text style={styles.datePickerConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ProfileStep({ data, setData, onNext }: StepProps) {
  return (
    <ScrollView 
      style={styles.profileScrollView}
      contentContainerStyle={styles.profileScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.stepContainer}>
        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
          <Text style={styles.stepTitle}>Tell us about yourself</Text>
          <Text style={styles.stepSubtitle}>
            Just the basics — your coach will help with the rest.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.sectionContainer}>
          <Text style={styles.sectionLabel}>Date of birth</Text>
          <DateOfBirthPicker
            value={data.dateOfBirth}
            onChange={(date) => setData((prev) => ({ ...prev, dateOfBirth: date }))}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.sectionContainer}>
          <Text style={styles.sectionLabel}>Height in cm (optional)</Text>
          <TextInput
            value={data.height ? String(data.height) : ""}
            onChangeText={(text) => {
              const num = parseInt(text, 10);
              setData((prev) => ({ ...prev, height: isNaN(num) ? null : num }));
            }}
            placeholder="e.g. 165"
            placeholderTextColor={Colors.dark.textMuted}
            keyboardType="numeric"
            style={styles.heightInput}
          />
          <Text style={styles.hintText}>Helps with merchandise sizing</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(280).duration(500)} style={styles.sectionContainer}>
          <Text style={styles.sectionLabel}>T-Shirt Size (optional)</Text>
          <View style={styles.tshirtSizeGrid}>
            {TSHIRT_SIZE_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  styles.tshirtSizeButton,
                  data.tshirtSize === option.id ? styles.tshirtSizeButtonActive : null,
                  option.isKids ? styles.tshirtSizeButtonKids : null,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setData((prev) => ({ 
                    ...prev, 
                    tshirtSize: prev.tshirtSize === option.id ? null : option.id 
                  }));
                }}
              >
                <Text style={[
                  styles.tshirtSizeButtonText,
                  data.tshirtSize === option.id ? styles.tshirtSizeButtonTextActive : null,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hintText}>For academy merchandise and giveaways</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.sectionContainer}>
          <Text style={styles.sectionLabel}>Dominant hand</Text>
          <View style={styles.handSelector}>
            {HAND_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  styles.handButton,
                  data.dominantHand === option.id ? styles.handButtonActive : null,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setData((prev) => ({ ...prev, dominantHand: option.id }));
                }}
              >
                <Ionicons 
                  name={option.icon as any} 
                  size={28} 
                  color={data.dominantHand === option.id ? Colors.dark.primary : Colors.dark.textMuted} 
                />
                <Text style={[
                  styles.handButtonText,
                  data.dominantHand === option.id ? styles.handButtonTextActive : null,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).duration(500)} style={styles.sectionContainer}>
          <Text style={styles.sectionLabel}>Backhand style</Text>
          <View style={styles.handSelector}>
            {BACKHAND_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  styles.handButton,
                  data.backhandType === option.id ? styles.handButtonActive : null,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setData((prev) => ({ ...prev, backhandType: option.id }));
                }}
              >
                <Ionicons 
                  name={option.icon as any} 
                  size={28} 
                  color={data.backhandType === option.id ? Colors.dark.primary : Colors.dark.textMuted} 
                />
                <Text style={[
                  styles.handButtonText,
                  data.backhandType === option.id ? styles.handButtonTextActive : null,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.sectionContainer}>
          <Text style={styles.sectionLabel}>Tennis experience</Text>
          <View style={styles.experienceGrid}>
            {EXPERIENCE_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                style={[
                  styles.experienceButton,
                  data.experienceLevel === option.id ? styles.experienceButtonActive : null,
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setData((prev) => ({ ...prev, experienceLevel: option.id }));
                }}
              >
                <Text style={[
                  styles.experienceButtonText,
                  data.experienceLevel === option.id ? styles.experienceButtonTextActive : null,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </View>
    </ScrollView>
  );
}

function EnjoymentStep({ data, setData, onNext }: StepProps) {
  const toggleEnjoyment = (id: string) => {
    setData((prev) => {
      const current = prev.enjoymentTags;
      if (current.includes(id)) {
        return { ...prev, enjoymentTags: current.filter((t) => t !== id) };
      }
      if (current.length >= 3) {
        return prev;
      }
      return { ...prev, enjoymentTags: [...current, id] };
    });
  };

  return (
    <View style={styles.stepContainer}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>What do you enjoy most?</Text>
        <Text style={styles.stepSubtitle}>
          Pick up to 3 things you love about tennis
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.optionsGrid}>
        {ENJOYMENT_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            style={[
              styles.enjoymentCard,
              data.enjoymentTags.includes(option.id) ? styles.enjoymentCardActive : null,
              data.enjoymentTags.length >= 3 && !data.enjoymentTags.includes(option.id) 
                ? styles.enjoymentCardDisabled : null,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleEnjoyment(option.id);
            }}
          >
            <Ionicons 
              name={option.icon as any} 
              size={28} 
              color={data.enjoymentTags.includes(option.id) ? Colors.dark.primary : Colors.dark.textMuted} 
            />
            <Text style={[
              styles.enjoymentCardText,
              data.enjoymentTags.includes(option.id) ? styles.enjoymentCardTextActive : null,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>

      <Text style={styles.selectionCount}>
        {data.enjoymentTags.length}/3 selected
      </Text>
    </View>
  );
}

function FocusStep({ data, setData, onNext }: StepProps) {
  const toggleFocus = (id: string) => {
    setData((prev) => {
      const current = prev.focusGoals;
      if (current.includes(id)) {
        return { ...prev, focusGoals: current.filter((t) => t !== id) };
      }
      return { ...prev, focusGoals: [...current, id] };
    });
  };

  return (
    <View style={styles.stepContainer}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>What do you want to work on?</Text>
        <Text style={styles.stepSubtitle}>
          Select areas you'd like to improve
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.optionsGrid}>
        {FOCUS_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            style={[
              styles.focusCard,
              data.focusGoals.includes(option.id) ? styles.focusCardActive : null,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleFocus(option.id);
            }}
          >
            <Ionicons 
              name={option.icon as any} 
              size={28} 
              color={data.focusGoals.includes(option.id) ? Colors.dark.primary : Colors.dark.textMuted} 
            />
            <Text style={[
              styles.focusCardText,
              data.focusGoals.includes(option.id) ? styles.focusCardTextActive : null,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

function BaselineStep({ data, setData, onNext }: StepProps) {
  const toggleConfidence = (id: string) => {
    setData((prev) => {
      const current = prev.selfConfidenceFlags;
      if (current.includes(id)) {
        return { ...prev, selfConfidenceFlags: current.filter((t) => t !== id) };
      }
      return { ...prev, selfConfidenceFlags: [...current, id] };
    });
  };

  return (
    <View style={styles.stepContainer}>
      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <Text style={styles.stepTitle}>Almost there!</Text>
        <Text style={styles.stepSubtitle}>
          Your coach will help set your level.{"\n"}This is just your starting point.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.baselineContainer}>
        <Text style={styles.sectionLabel}>How would you describe yourself? (optional)</Text>
        {CONFIDENCE_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            style={[
              styles.confidenceOption,
              data.selfConfidenceFlags.includes(option.id) ? styles.confidenceOptionActive : null,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleConfidence(option.id);
            }}
          >
            <View style={[
              styles.checkbox,
              data.selfConfidenceFlags.includes(option.id) ? styles.checkboxActive : null,
            ]}>
              {data.selfConfidenceFlags.includes(option.id) ? (
                <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />
              ) : null}
            </View>
            <Text style={[
              styles.confidenceOptionText,
              data.selfConfidenceFlags.includes(option.id) ? styles.confidenceOptionTextActive : null,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

interface Props {
  onComplete: () => void;
}

export default function PlayerOnboardingScreen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user, refreshAuth } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    academyId: null,
    academyName: null,
    motivationType: null,
    dateOfBirth: null,
    height: null,
    tshirtSize: null,
    dominantHand: null,
    backhandType: null,
    experienceLevel: null,
    enjoymentTags: [],
    focusGoals: [],
    selfConfidenceFlags: [],
  });

  const saveMutation = useMutation({
    mutationFn: async (onboardingData: OnboardingData) => {
      const response = await apiRequest("POST", "/api/player/me/onboarding", onboardingData);
      return response.json();
    },
    onSuccess: async (responseData: { success: boolean; playerId: string; token?: string; refreshToken?: string }) => {
      // If a new token was issued (player profile was created), save it
      if (responseData.token && user) {
        setAuthToken(responseData.token);
        const updatedUser: AuthUser = {
          ...user,
          playerId: responseData.playerId,
        };
        await saveAuthState(responseData.token, updatedUser, responseData.refreshToken);
      }
      
      // Refresh auth to get updated user data
      await refreshAuth();
      
      queryClient.invalidateQueries({ queryKey: ["/api/player/me/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onComplete();
    },
  });

  const handleNext = () => {
    if (currentStep < 5) {
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
    saveMutation.mutate(data);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return !!data.academyId;
      case 1:
        return !!data.motivationType;
      case 2:
        return !!data.dateOfBirth && !!data.dominantHand && !!data.backhandType && !!data.experienceLevel;
      case 3:
        return data.enjoymentTags.length > 0;
      case 4:
        return data.focusGoals.length > 0;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <AcademySelectionStep data={data} setData={setData} onNext={handleNext} />;
      case 1:
        return <WelcomeStep data={data} setData={setData} onNext={handleNext} />;
      case 2:
        return <ProfileStep data={data} setData={setData} onNext={handleNext} />;
      case 3:
        return <EnjoymentStep data={data} setData={setData} onNext={handleNext} />;
      case 4:
        return <FocusStep data={data} setData={setData} onNext={handleNext} />;
      case 5:
        return <BaselineStep data={data} setData={setData} onNext={handleNext} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.lg }]}>
      <LinearGradient
        colors={["rgba(0,212,255,0.1)", "transparent"]}
        style={styles.gradient}
      />

      <ProgressBar currentStep={currentStep} totalSteps={6} />

      <View style={styles.content}>
        {renderStep()}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {currentStep > 0 ? (
          <Pressable style={styles.backButton} onPress={handleBack}>
            <Ionicons name="chevron-back" size={20} color={Colors.dark.textMuted} />
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}

        {currentStep === 5 ? (
          <Pressable
            style={[styles.nextButton, !canProceed() ? styles.nextButtonDisabled : null]}
            onPress={handleComplete}
            disabled={!canProceed() || saveMutation.isPending}
          >
            <Text style={styles.nextButtonText}>
              {saveMutation.isPending ? "Saving..." : "Let's Go!"}
            </Text>
            <Ionicons name="rocket-outline" size={20} color={Colors.dark.buttonText} />
          </Pressable>
        ) : currentStep === 0 || currentStep === 1 ? null : (
          <Pressable
            style={[styles.nextButton, !canProceed() ? styles.nextButtonDisabled : null]}
            onPress={handleNext}
            disabled={!canProceed()}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.dark.buttonText} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = makeReactiveStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundRoot,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  progressDotActive: {
    backgroundColor: Colors.dark.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  stepContainer: {
    flex: 1,
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
  optionsContainer: {
    gap: Spacing.md,
  },
  selectableCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectableCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  selectableCardDisabled: {
    opacity: 0.5,
  },
  selectableCardText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  selectableCardTextActive: {
    color: Colors.dark.primary,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionContainer: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  ageSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  ageButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  ageButtonActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  ageButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  ageButtonTextActive: {
    color: Colors.dark.primary,
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  handButtonActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  handButtonText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  handButtonTextActive: {
    color: Colors.dark.primary,
  },
  experienceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  experienceButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  experienceButtonActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  experienceButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  experienceButtonTextActive: {
    color: Colors.dark.primary,
  },
  heightInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundTertiary,
  },
  hintText: {
    ...Typography.caption,
    color: Colors.dark.textMuted,
    marginTop: Spacing.sm,
  },
  tshirtSizeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  tshirtSizeButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "transparent",
    minWidth: 60,
    alignItems: "center",
  },
  tshirtSizeButtonActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  tshirtSizeButtonKids: {
    borderColor: Colors.dark.orange + "30",
  },
  tshirtSizeButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  tshirtSizeButtonTextActive: {
    color: Colors.dark.primary,
  },
  optionsGrid: {
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
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  enjoymentCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
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
    color: Colors.dark.primary,
  },
  selectionCount: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  focusCard: {
    width: "47%",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  focusCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  focusCardText: {
    ...Typography.small,
    color: Colors.dark.text,
    textAlign: "center",
  },
  focusCardTextActive: {
    color: Colors.dark.primary,
  },
  baselineContainer: {
    gap: Spacing.md,
  },
  confidenceOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
  },
  confidenceOptionActive: {
    backgroundColor: `${Colors.dark.primary}10`,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.dark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  confidenceOptionText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  confidenceOptionTextActive: {
    color: Colors.dark.primary,
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
    backgroundColor: Colors.dark.primary,
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
  profileScrollView: {
    flex: 1,
  },
  profileScrollContent: {
    paddingBottom: Spacing.xl,
  },
  datePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  datePickerButtonActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
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
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  ageBadgeText: {
    ...Typography.small,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  datePickerModal: {
    width: "90%",
    maxWidth: 400,
    backgroundColor: Colors.dark.backgroundSecondary,
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
    backgroundColor: Colors.dark.backgroundRoot,
    borderRadius: BorderRadius.md,
  },
  datePickerItem: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: "center",
  },
  datePickerItemActive: {
    backgroundColor: `${Colors.dark.primary}20`,
  },
  datePickerItemText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  datePickerItemTextActive: {
    color: Colors.dark.primary,
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
    backgroundColor: Colors.dark.backgroundRoot,
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
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.md,
  },
  datePickerConfirmButtonDisabled: {
    opacity: 0.5,
  },
  datePickerConfirmText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  emptyAcademiesContainer: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.md,
  },
  emptyAcademiesText: {
    ...Typography.h3,
    color: Colors.dark.text,
  },
  emptyAcademiesSubtext: {
    ...Typography.body,
    color: Colors.dark.textMuted,
    textAlign: "center",
  },
  academyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  academyCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: `${Colors.dark.primary}10`,
  },
  academyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dark.backgroundTertiary,
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
    color: Colors.dark.primary,
  },
  academyStats: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.lg,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
  },
  retryButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  joinCodeSection: {
    marginBottom: Spacing.lg,
  },
  joinCodeInputRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  joinCodeInput: {
    flex: 1,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.dark.text,
    ...Typography.body,
    borderWidth: 2,
    borderColor: Colors.dark.backgroundTertiary,
    letterSpacing: 2,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
  },
  lookupButton: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.dark.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  lookupButtonText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  joinCodeError: {
    ...Typography.small,
    color: Colors.dark.error,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  foundAcademyCard: {
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    backgroundColor: `${Colors.dark.primary}15`,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    gap: Spacing.md,
  },
  foundAcademyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  academyLocation: {
    ...Typography.small,
    color: Colors.dark.textMuted,
  },
  academyDescription: {
    ...Typography.small,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  joinFoundAcademyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.dark.primary,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  joinFoundAcademyText: {
    ...Typography.body,
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  dividerText: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  browseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  browseButtonText: {
    ...Typography.body,
    color: Colors.dark.primary,
    fontWeight: "600",
  },
  skipSection: {
    marginTop: Spacing.xl,
    alignItems: "center",
    paddingBottom: Spacing.xl,
  },
  skipButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  skipButtonText: {
    ...Typography.body,
    color: Colors.dark.textMuted,
  },
  skipHint: {
    ...Typography.small,
    color: Colors.dark.textMuted,
    marginTop: Spacing.xs,
    opacity: 0.7,
  },
}));
