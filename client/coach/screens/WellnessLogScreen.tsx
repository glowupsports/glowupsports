import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Colors, Spacing, Backgrounds } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest } from "@/lib/query-client";

interface WellnessLog {
  id: string;
  date: string;
  sleepHours: string | null;
  sleepQuality: string | null;
  nutritionScore: number | null;
  mealsCount: number | null;
  hydrationLevel: string | null;
  energyLevel: number | null;
  moodLevel: number | null;
  stressLevel: number | null;
  physicalPain: boolean;
  painNotes: string | null;
  notes: string | null;
}

const SLEEP_QUALITIES = ["poor", "fair", "good", "excellent"];
const HYDRATION_LEVELS = ["low", "moderate", "good", "excellent"];

export default function WellnessLogScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { coach } = useCoach();
  const queryClient = useQueryClient();
  
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  
  const [sleepHours, setSleepHours] = useState<number>(7);
  const [sleepQuality, setSleepQuality] = useState<string>("good");
  const [nutritionScore, setNutritionScore] = useState<number>(3);
  const [mealsCount, setMealsCount] = useState<number>(3);
  const [hydrationLevel, setHydrationLevel] = useState<string>("good");
  const [energyLevel, setEnergyLevel] = useState<number>(3);
  const [moodLevel, setMoodLevel] = useState<number>(3);
  const [stressLevel, setStressLevel] = useState<number>(2);
  const [physicalPain, setPhysicalPain] = useState<boolean>(false);
  const [painNotes, setPainNotes] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const { data: existingLog, isLoading } = useQuery<{ log: WellnessLog | null }>({
    queryKey: ["/api/coaches", coach?.id, "wellness", selectedDate],
    enabled: !!coach?.id,
  });

  useEffect(() => {
    if (existingLog?.log) {
      const log = existingLog.log;
      setSleepHours(parseFloat(log.sleepHours || "7"));
      setSleepQuality(log.sleepQuality || "good");
      setNutritionScore(log.nutritionScore || 3);
      setMealsCount(log.mealsCount || 3);
      setHydrationLevel(log.hydrationLevel || "good");
      setEnergyLevel(log.energyLevel || 3);
      setMoodLevel(log.moodLevel || 3);
      setStressLevel(log.stressLevel || 2);
      setPhysicalPain(log.physicalPain || false);
      setPainNotes(log.painNotes || "");
      setNotes(log.notes || "");
    } else {
      setSleepHours(7);
      setSleepQuality("good");
      setNutritionScore(3);
      setMealsCount(3);
      setHydrationLevel("good");
      setEnergyLevel(3);
      setMoodLevel(3);
      setStressLevel(2);
      setPhysicalPain(false);
      setPainNotes("");
      setNotes("");
    }
  }, [existingLog]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/coaches/${coach?.id}/wellness`, {
        method: "POST",
        body: JSON.stringify({
          date: selectedDate,
          sleepHours: sleepHours.toString(),
          sleepQuality,
          nutritionScore,
          mealsCount,
          hydrationLevel,
          energyLevel,
          moodLevel,
          stressLevel,
          physicalPain,
          painNotes: physicalPain ? painNotes : null,
          notes: notes || null,
        }),
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coaches", coach?.id, "wellness"] });
      navigation.goBack();
    },
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  const getDateOptions = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split("T")[0]);
    }
    return dates;
  };

  const renderSlider = (value: number, setValue: (v: number) => void, max: number, label: string, color: string) => (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderHeader}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={[styles.sliderValue, { color }]}>{value}/{max}</Text>
      </View>
      <View style={styles.sliderTrack}>
        {Array.from({ length: max }, (_, i) => (
          <Pressable
            key={i}
            style={[
              styles.sliderDot,
              i < value && { backgroundColor: color },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setValue(i + 1);
            }}
          />
        ))}
      </View>
    </View>
  );

  const renderOptions = (options: string[], value: string, setValue: (v: string) => void, color: string) => (
    <View style={styles.optionsRow}>
      {options.map((opt) => (
        <Pressable
          key={opt}
          style={[
            styles.optionButton,
            value === opt && { backgroundColor: color + "30", borderColor: color },
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setValue(opt);
          }}
        >
          <Text style={[styles.optionText, value === opt && { color }]}>
            {opt.charAt(0).toUpperCase() + opt.slice(1)}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
          </Pressable>
          <Text style={styles.headerTitle}>LOG WELLNESS</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.dark.text} />
        </Pressable>
        <Text style={styles.headerTitle}>LOG WELLNESS</Text>
        <Pressable
          style={[styles.saveButton, saveMutation.isPending && styles.saveButtonDisabled]}
          onPress={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <ActivityIndicator size="small" color={Colors.dark.buttonText} />
          ) : (
            <Text style={styles.saveButtonText}>SAVE</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dateSection}>
          <Text style={styles.sectionTitle}>SELECT DATE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
            {getDateOptions().map((date) => {
              const isSelected = date === selectedDate;
              const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short" });
              const dayNum = new Date(date).getDate();
              return (
                <Pressable
                  key={date}
                  style={[styles.dateCard, isSelected && styles.dateCardSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedDate(date);
                  }}
                >
                  <Text style={[styles.dateDayName, isSelected && styles.dateDayNameSelected]}>
                    {dayName.toUpperCase()}
                  </Text>
                  <Text style={[styles.dateDayNum, isSelected && styles.dateDayNumSelected]}>
                    {dayNum}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bed" size={16} color={Colors.dark.xpCyan} />
            <Text style={styles.sectionTitle}>SLEEP</Text>
          </View>
          
          <View style={styles.card}>
            <View style={styles.sleepHoursRow}>
              <Text style={styles.inputLabel}>Hours of sleep</Text>
              <View style={styles.sleepHoursControls}>
                <Pressable
                  style={styles.sleepControl}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSleepHours(Math.max(0, sleepHours - 0.5));
                  }}
                >
                  <Ionicons name="remove" size={20} color={Colors.dark.text} />
                </Pressable>
                <Text style={styles.sleepHoursValue}>{sleepHours}h</Text>
                <Pressable
                  style={styles.sleepControl}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSleepHours(Math.min(12, sleepHours + 0.5));
                  }}
                >
                  <Ionicons name="add" size={20} color={Colors.dark.text} />
                </Pressable>
              </View>
            </View>
            
            <Text style={styles.inputLabel}>Sleep quality</Text>
            {renderOptions(SLEEP_QUALITIES, sleepQuality, setSleepQuality, Colors.dark.xpCyan)}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="restaurant" size={16} color={Colors.dark.gold} />
            <Text style={styles.sectionTitle}>NUTRITION</Text>
          </View>
          
          <View style={styles.card}>
            {renderSlider(nutritionScore, setNutritionScore, 5, "Overall nutrition", Colors.dark.gold)}
            
            <View style={styles.mealsRow}>
              <Text style={styles.inputLabel}>Meals eaten</Text>
              <View style={styles.mealsControls}>
                {[1, 2, 3, 4, 5].map((num) => (
                  <Pressable
                    key={num}
                    style={[styles.mealButton, mealsCount === num && styles.mealButtonSelected]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setMealsCount(num);
                    }}
                  >
                    <Text style={[styles.mealButtonText, mealsCount === num && styles.mealButtonTextSelected]}>
                      {num}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            
            <Text style={styles.inputLabel}>Hydration</Text>
            {renderOptions(HYDRATION_LEVELS, hydrationLevel, setHydrationLevel, Colors.dark.gold)}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flash" size={16} color={Colors.dark.primary} />
            <Text style={styles.sectionTitle}>ENERGY & MOOD</Text>
          </View>
          
          <View style={styles.card}>
            {renderSlider(energyLevel, setEnergyLevel, 5, "Energy level", Colors.dark.primary)}
            {renderSlider(moodLevel, setMoodLevel, 5, "Mood", Colors.dark.xpCyan)}
            {renderSlider(stressLevel, setStressLevel, 5, "Stress level", Colors.dark.orange)}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="fitness" size={16} color={Colors.dark.error} />
            <Text style={styles.sectionTitle}>PHYSICAL STATUS</Text>
          </View>
          
          <View style={styles.card}>
            <Pressable
              style={styles.painToggle}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPhysicalPain(!physicalPain);
              }}
            >
              <View style={[styles.checkbox, physicalPain && styles.checkboxChecked]}>
                {physicalPain && <Ionicons name="checkmark" size={14} color={Colors.dark.buttonText} />}
              </View>
              <Text style={styles.painLabel}>Any pain or discomfort?</Text>
            </Pressable>
            
            {physicalPain && (
              <TextInput
                style={styles.textInput}
                placeholder="Describe the pain or injury..."
                placeholderTextColor={Colors.dark.tabIconDefault}
                value={painNotes}
                onChangeText={setPainNotes}
                multiline
              />
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="create" size={16} color={Colors.dark.tabIconDefault} />
            <Text style={styles.sectionTitle}>NOTES</Text>
          </View>
          
          <View style={styles.card}>
            <TextInput
              style={styles.textInput}
              placeholder="Any additional notes about today..."
              placeholderTextColor={Colors.dark.tabIconDefault}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.root,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Backgrounds.card,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  headerSpacer: {
    width: 70,
  },
  saveButton: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.dark.buttonText,
    letterSpacing: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  dateSection: {
    gap: Spacing.sm,
  },
  dateScroll: {
    marginHorizontal: -Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  dateCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: 12,
    padding: Spacing.md,
    marginRight: Spacing.sm,
    alignItems: "center",
    minWidth: 60,
    borderWidth: 1,
    borderColor: "transparent",
  },
  dateCardSelected: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + "15",
  },
  dateDayName: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dateDayNameSelected: {
    color: Colors.dark.primary,
  },
  dateDayNum: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.dark.text,
  },
  dateDayNumSelected: {
    color: Colors.dark.primary,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.dark.text,
    letterSpacing: 1.5,
  },
  card: {
    backgroundColor: Backgrounds.card,
    borderRadius: 12,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
    marginBottom: 4,
  },
  sleepHoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sleepHoursControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  sleepControl: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  sleepHoursValue: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    minWidth: 50,
    textAlign: "center",
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  optionButton: {
    flex: 1,
    minWidth: 70,
    paddingVertical: 10,
    paddingHorizontal: Spacing.sm,
    borderRadius: 8,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
  },
  sliderContainer: {
    gap: 8,
  },
  sliderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sliderLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  sliderTrack: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  sliderDot: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Backgrounds.elevated,
  },
  mealsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mealsControls: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  mealButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Backgrounds.elevated,
    alignItems: "center",
    justifyContent: "center",
  },
  mealButtonSelected: {
    backgroundColor: Colors.dark.gold,
  },
  mealButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.dark.tabIconDefault,
  },
  mealButtonTextSelected: {
    color: Colors.dark.buttonText,
  },
  painToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Backgrounds.elevated,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.dark.error,
    borderColor: Colors.dark.error,
  },
  painLabel: {
    fontSize: 13,
    color: Colors.dark.text,
  },
  textInput: {
    backgroundColor: Backgrounds.elevated,
    borderRadius: 8,
    padding: Spacing.md,
    color: Colors.dark.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
});
