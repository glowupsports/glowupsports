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
} from "react-native-reanimated";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import { countries, getCitiesForCountry } from "@shared/countries";
import { useAuth } from "@/coach/context/AuthContext";
import { SPORTS, getSportConfig, type Sport } from "@shared/sportConfig";
import { SportMultiSelector } from "@/components/SportBadge";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingData {
  academyName: string;
  country: string;
  city: string;
  location: string;
  sport: string;
  sports: string[];
  theme: "dark" | "light";
  accentColor: string;
  lessonTypes: string[];
  targetAudience: string[];
  focus: string[];
  expectations: string[];
  additionalFeedback: string;
}

interface StepProps {
  data: OnboardingData;
  setData: React.Dispatch<React.SetStateAction<OnboardingData>>;
  onNext: () => void;
  onBack?: () => void;
}

interface Step2Props extends StepProps {
  showCountryPicker: boolean;
  setShowCountryPicker: (show: boolean) => void;
  showCityPicker: boolean;
  setShowCityPicker: (show: boolean) => void;
}

function getContrastTextColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1a1a2e' : '#FFFFFF';
}

const ACCENT_COLORS = [
  { id: "green", label: "Glow Green", color: "#2ECC40" },
  { id: "purple", label: "Purple", color: "#9B59B6" },
  { id: "blue", label: "Blue", color: "#3498DB" },
  { id: "cyan", label: "Cyan", color: "#00D4FF" },
  { id: "orange", label: "Orange", color: "#FF851B" },
];

const LESSON_TYPES = [
  { id: "private", label: "Private lessons", icon: "person-outline" },
  { id: "group", label: "Group lessons", icon: "people-outline" },
];

const TARGET_AUDIENCE = [
  { id: "kids", label: "Kids", icon: "happy-outline" },
  { id: "adults", label: "Adults", icon: "person-outline" },
];

const FOCUS_OPTIONS = [
  { id: "competition", label: "Competition focused", icon: "trophy-outline" },
  { id: "recreational", label: "Recreational", icon: "heart-outline" },
];

const EXPECTATIONS = [
  { id: "planning", label: "Better planning" },
  { id: "engagement", label: "Player engagement" },
  { id: "progress", label: "Progress tracking" },
  { id: "payments", label: "Payments later" },
  { id: "all", label: "All of the above" },
];

const WALKTHROUGH_STEPS = [
  {
    icon: "analytics-outline",
    title: "Academy Overview",
    description: "This is your command center",
  },
  {
    icon: "people-outline",
    title: "Coaches",
    description: "Add yourself or invite coaches",
  },
  {
    icon: "tennisball-outline",
    title: "Players",
    description: "Players connect to your academy here",
  },
  {
    icon: "calendar-outline",
    title: "Calendar",
    description: "This will show bookings & availability",
  },
  {
    icon: "card-outline",
    title: "Finance",
    description: "Free for now. No billing is active.",
  },
];

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

function SelectableChip({ 
  selected, 
  onPress, 
  label, 
  icon,
}: { 
  selected: boolean; 
  onPress: () => void; 
  label: string;
  icon?: string;
}) {
  return (
    <Pressable
      style={[
        styles.selectableChip,
        selected ? styles.selectableChipActive : null,
      ]}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.selectionAsync();
        onPress();
      }}
    >
      {icon ? (
        <Ionicons
          name={icon as any}
          size={20}
          color={selected ? Colors.dark.primary : Colors.dark.textSecondary}
          style={styles.chipIcon}
        />
      ) : null}
      <Text style={[styles.chipLabel, selected ? styles.chipLabelActive : null]}>
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={20} color={Colors.dark.primary} />
      ) : null}
    </Pressable>
  );
}

function Step1Welcome({ onNext, onLogout }: StepProps & { onLogout?: () => void }) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      {onLogout && (
        <View style={styles.logoutContainer}>
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.dark.textSecondary} />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
        </View>
      )}
      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.welcomeContent}>
        <View style={styles.welcomeIconContainer}>
          <Ionicons name="tennisball" size={60} color={Colors.dark.primary} />
        </View>
        
        <Text style={styles.welcomeTitle}>Welcome to Glow Up Sports</Text>
        <Text style={styles.welcomeSubtitle}>
          You&apos;re about to set up your academy dashboard.{"\n"}
          Everything is editable later. Nothing here can break your app.
        </Text>
        
        <View style={styles.reassuranceBox}>
          <Ionicons name="shield-checkmark-outline" size={24} color={Colors.dark.primary} />
          <Text style={styles.reassuranceText}>
            Glow Up Sports is currently free while we build this together with academies and coaches.
          </Text>
        </View>
      </Animated.View>
      
      <View style={styles.bottomAction}>
        <Pressable style={styles.primaryButton} onPress={onNext}>
          <Text style={styles.primaryButtonText}>Start academy setup</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </View>
    </View>
  );
}

function Step2Identity({ data, setData, onNext, onBack, showCountryPicker, setShowCountryPicker, showCityPicker, setShowCityPicker }: Step2Props) {
  const insets = useSafeAreaInsets();
  const [countrySearchQuery, setCountrySearchQuery] = useState("");
  const [citySearchQuery, setCitySearchQuery] = useState("");
  
  const canContinue = data.academyName.trim().length > 0 && data.country.length > 0 && data.city.length > 0;
  
  const selectedCountry = countries.find(c => c.code === data.country);
  const availableCities = data.country ? getCitiesForCountry(data.country) : [];
  
  const filteredCountries = countrySearchQuery 
    ? countries.filter(c => c.name.toLowerCase().includes(countrySearchQuery.toLowerCase()))
    : countries;
  
  const filteredCities = citySearchQuery
    ? availableCities.filter(c => c.toLowerCase().includes(citySearchQuery.toLowerCase()))
    : availableCities;
  
  const handleCountrySelect = (countryCode: string) => {
    const country = countries.find(c => c.code === countryCode);
    setData(prev => ({ 
      ...prev, 
      country: countryCode, 
      city: "",
      location: country ? `${country.name}` : ""
    }));
    setCountrySearchQuery("");
    setShowCountryPicker(false);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  
  const handleCitySelect = (city: string) => {
    const country = countries.find(c => c.code === data.country);
    setData(prev => ({ 
      ...prev, 
      city,
      location: country ? `${city}, ${country.name}` : city
    }));
    setCitySearchQuery("");
    setShowCityPicker(false);
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>Academy Identity</Text>
          <Text style={styles.stepSubtitle}>This is how your academy will appear in the app</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Academy Name</Text>
            <TextInput
              style={styles.textInput}
              value={data.academyName}
              onChangeText={(text) => setData(prev => ({ ...prev, academyName: text }))}
              placeholder="e.g., Dubai Tennis Academy"
              placeholderTextColor={Colors.dark.textSecondary}
            />
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Country</Text>
            <Pressable 
              style={styles.dropdownButton}
              onPress={() => {
                setCountrySearchQuery("");
                setShowCountryPicker(true);
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={selectedCountry ? styles.dropdownButtonText : styles.dropdownButtonPlaceholder}>
                {selectedCountry?.name || "Select a country"}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>City</Text>
            <Pressable 
              style={[styles.dropdownButton, !data.country ? styles.dropdownButtonDisabled : null]}
              onPress={() => {
                if (data.country) {
                  setCitySearchQuery("");
                  setShowCityPicker(true);
                  if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
              disabled={!data.country}
            >
              <Text style={data.city ? styles.dropdownButtonText : styles.dropdownButtonPlaceholder}>
                {data.city || (data.country ? "Select a city" : "Select a country first")}
              </Text>
              <Ionicons name="chevron-down" size={20} color={Colors.dark.textSecondary} />
            </Pressable>
          </View>
          
          <View style={styles.inputGroup}>
            <SportMultiSelector
              selectedSports={data.sports?.length ? data.sports : ["tennis"]}
              onToggle={(sport) => {
                const current = data.sports?.length ? data.sports : ["tennis"];
                const updated = current.includes(sport)
                  ? current.filter((s) => s !== sport)
                  : [...current, sport];
                setData(prev => ({ ...prev, sports: updated.length ? updated : ["tennis"] }));
              }}
              label="Sports Offered"
            />
          </View>
          
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Preview</Text>
            <View style={styles.previewContent}>
              <View style={styles.previewIcon}>
                <Ionicons name="tennisball" size={32} color={Colors.dark.primary} />
              </View>
              <View style={styles.previewTextContainer}>
                <Text style={styles.previewName}>{data.academyName || "Your Academy"}</Text>
                <Text style={styles.previewLocation}>{data.location || "Location"}</Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomActions}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.primaryButtonFlex, !canContinue ? styles.primaryButtonDisabled : null]}
          onPress={canContinue ? onNext : undefined}
          disabled={!canContinue}
        >
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </View>
      
      <Modal visible={showCountryPicker} animationType="slide" transparent>
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Select Country</Text>
              <Pressable onPress={() => setShowCountryPicker(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            <TextInput
              style={styles.pickerSearchInput}
              value={countrySearchQuery}
              onChangeText={setCountrySearchQuery}
              placeholder="Search countries..."
              placeholderTextColor={Colors.dark.textSecondary}
            />
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <Pressable 
                  style={[styles.pickerItem, data.country === item.code ? styles.pickerItemSelected : null]}
                  onPress={() => handleCountrySelect(item.code)}
                >
                  <Text style={[styles.pickerItemText, data.country === item.code ? styles.pickerItemTextSelected : null]}>
                    {item.name}
                  </Text>
                  {data.country === item.code ? (
                    <Ionicons name="checkmark" size={20} color={Colors.dark.primary} />
                  ) : null}
                </Pressable>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
      
      <Modal visible={showCityPicker} animationType="slide" transparent>
        <View style={styles.pickerModalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Select City</Text>
              <Pressable onPress={() => setShowCityPicker(false)}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
            </View>
            <TextInput
              style={styles.pickerSearchInput}
              value={citySearchQuery}
              onChangeText={setCitySearchQuery}
              placeholder="Search cities..."
              placeholderTextColor={Colors.dark.textSecondary}
            />
            <FlatList
              data={filteredCities}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable 
                  style={[styles.pickerItem, data.city === item ? styles.pickerItemSelected : null]}
                  onPress={() => handleCitySelect(item)}
                >
                  <Text style={[styles.pickerItemText, data.city === item ? styles.pickerItemTextSelected : null]}>
                    {item}
                  </Text>
                  {data.city === item ? (
                    <Ionicons name="checkmark" size={20} color={Colors.dark.primary} />
                  ) : null}
                </Pressable>
              )}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>No cities found</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Step3Style({ data, setData, onNext, onBack }: StepProps) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>Visual Style</Text>
          <Text style={styles.stepSubtitle}>You can change this anytime</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Theme</Text>
            <View style={styles.themeOptions}>
              <Pressable
                style={[styles.themeOption, data.theme === "dark" ? styles.themeOptionActive : null]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  setData(prev => ({ ...prev, theme: "dark" }));
                }}
              >
                <Ionicons name="moon" size={24} color={data.theme === "dark" ? Colors.dark.primary : Colors.dark.textSecondary} />
                <Text style={[styles.themeLabel, data.theme === "dark" ? styles.themeLabelActive : null]}>Dark</Text>
              </Pressable>
              <Pressable
                style={[styles.themeOption, data.theme === "light" ? styles.themeOptionActive : null]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  setData(prev => ({ ...prev, theme: "light" }));
                }}
              >
                <Ionicons name="sunny" size={24} color={data.theme === "light" ? Colors.dark.primary : Colors.dark.textSecondary} />
                <Text style={[styles.themeLabel, data.theme === "light" ? styles.themeLabelActive : null]}>Light</Text>
              </Pressable>
            </View>
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Accent Color</Text>
            <View style={styles.colorOptions}>
              {ACCENT_COLORS.map(color => (
                <Pressable
                  key={color.id}
                  style={[
                    styles.colorOption,
                    { backgroundColor: color.color },
                    data.accentColor === color.id ? styles.colorOptionActive : null,
                  ]}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    setData(prev => ({ ...prev, accentColor: color.id }));
                  }}
                >
                  {data.accentColor === color.id ? (
                    <Ionicons name="checkmark" size={20} color={getContrastTextColor(color.color)} />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
          
          <View style={[
            styles.previewCard,
            data.theme === "light" ? { backgroundColor: "#F5F5F5", borderColor: "rgba(0, 0, 0, 0.1)" } : null,
          ]}>
            <Text style={[
              styles.previewLabel,
              data.theme === "light" ? { color: "#666666" } : null,
            ]}>Preview</Text>
            <View style={[styles.previewHeader, { backgroundColor: ACCENT_COLORS.find(c => c.id === data.accentColor)?.color || Colors.dark.primary }]}>
              <Text style={[
                styles.previewHeaderText,
                { color: getContrastTextColor(ACCENT_COLORS.find(c => c.id === data.accentColor)?.color || Colors.dark.primary) },
              ]}>{data.academyName || "Your Academy"}</Text>
            </View>
            <View style={[
              styles.previewThemeSample,
              data.theme === "light" 
                ? { backgroundColor: "#FFFFFF" } 
                : { backgroundColor: "#1a1a2e" },
            ]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                <View style={[
                  styles.previewAccentDot,
                  { backgroundColor: ACCENT_COLORS.find(c => c.id === data.accentColor)?.color || Colors.dark.primary },
                ]} />
                <Text style={[
                  styles.previewSampleText,
                  data.theme === "light" ? { color: "#1a1a2e" } : { color: "#FFFFFF" },
                ]}>Dashboard</Text>
              </View>
              <Text style={[
                styles.previewSampleSubtext,
                data.theme === "light" ? { color: "#666666" } : { color: "rgba(255,255,255,0.6)" },
              ]}>This is how your app will feel</Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomActions}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Pressable style={[styles.primaryButton, styles.primaryButtonFlex]} onPress={onNext}>
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </View>
    </View>
  );
}

function Step4Type({ data, setData, onNext, onBack }: StepProps) {
  const insets = useSafeAreaInsets();
  
  const toggleOption = (category: "lessonTypes" | "targetAudience" | "focus", id: string) => {
    setData(prev => {
      const current = prev[category];
      if (current.includes(id)) {
        return { ...prev, [category]: current.filter(item => item !== id) };
      }
      return { ...prev, [category]: [...current, id] };
    });
  };
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>How your academy works</Text>
          <Text style={styles.stepSubtitle}>This only helps us tune your dashboard defaults</Text>
          
          <View style={styles.disclaimerBox}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.dark.xpCyan} />
            <Text style={styles.disclaimerText}>You are not locked into these choices</Text>
          </View>
          
          <Text style={styles.sectionLabel}>Lesson types</Text>
          <View style={styles.optionsColumn}>
            {LESSON_TYPES.map(option => (
              <SelectableChip
                key={option.id}
                selected={data.lessonTypes.includes(option.id)}
                onPress={() => toggleOption("lessonTypes", option.id)}
                label={option.label}
                icon={option.icon}
              />
            ))}
          </View>
          
          <Text style={styles.sectionLabel}>Target audience</Text>
          <View style={styles.optionsColumn}>
            {TARGET_AUDIENCE.map(option => (
              <SelectableChip
                key={option.id}
                selected={data.targetAudience.includes(option.id)}
                onPress={() => toggleOption("targetAudience", option.id)}
                label={option.label}
                icon={option.icon}
              />
            ))}
          </View>
          
          <Text style={styles.sectionLabel}>Focus</Text>
          <View style={styles.optionsColumn}>
            {FOCUS_OPTIONS.map(option => (
              <SelectableChip
                key={option.id}
                selected={data.focus.includes(option.id)}
                onPress={() => toggleOption("focus", option.id)}
                label={option.label}
                icon={option.icon}
              />
            ))}
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomActions}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Pressable style={[styles.primaryButton, styles.primaryButtonFlex]} onPress={onNext}>
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </View>
    </View>
  );
}

function Step5Walkthrough({ data, setData, onNext, onBack }: StepProps) {
  const insets = useSafeAreaInsets();
  const [activeStep, setActiveStep] = useState(0);
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>Dashboard Walkthrough</Text>
          <Text style={styles.stepSubtitle}>Here&apos;s what you&apos;ll find in your dashboard</Text>
          
          <View style={styles.walkthroughContainer}>
            {WALKTHROUGH_STEPS.map((step, index) => (
              <Pressable
                key={index}
                style={[
                  styles.walkthroughStep,
                  activeStep === index ? styles.walkthroughStepActive : null,
                ]}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  setActiveStep(index);
                }}
              >
                <View style={[
                  styles.walkthroughIcon,
                  activeStep === index ? styles.walkthroughIconActive : null,
                ]}>
                  <Ionicons
                    name={step.icon as any}
                    size={24}
                    color={activeStep === index ? Colors.dark.buttonText : Colors.dark.textSecondary}
                  />
                </View>
                <View style={styles.walkthroughText}>
                  <Text style={[
                    styles.walkthroughTitle,
                    activeStep === index ? styles.walkthroughTitleActive : null,
                  ]}>
                    {step.title}
                  </Text>
                  <Text style={styles.walkthroughDescription}>{step.description}</Text>
                </View>
                {activeStep === index ? (
                  <Ionicons name="chevron-forward" size={20} color={Colors.dark.primary} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomActions}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Pressable style={[styles.primaryButton, styles.primaryButtonFlex]} onPress={onNext}>
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </View>
    </View>
  );
}

function Step6Feedback({ data, setData, onNext, onBack }: StepProps) {
  const insets = useSafeAreaInsets();
  
  const toggleExpectation = (id: string) => {
    setData(prev => {
      const current = prev.expectations;
      if (id === "all") {
        if (current.includes("all")) {
          return { ...prev, expectations: [] };
        }
        return { ...prev, expectations: ["all"] };
      }
      if (current.includes(id)) {
        return { ...prev, expectations: current.filter(item => item !== id && item !== "all") };
      }
      return { ...prev, expectations: [...current.filter(item => item !== "all"), id] };
    });
  };
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
          <Text style={styles.stepTitle}>Help us improve</Text>
          <Text style={styles.stepSubtitle}>What are you hoping this app will help you with?</Text>
          
          <View style={styles.optionsColumn}>
            {EXPECTATIONS.map(option => (
              <SelectableChip
                key={option.id}
                selected={data.expectations.includes(option.id)}
                onPress={() => toggleExpectation(option.id)}
                label={option.label}
              />
            ))}
          </View>
          
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Anything confusing so far? (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              value={data.additionalFeedback}
              onChangeText={(text) => setData(prev => ({ ...prev, additionalFeedback: text }))}
              placeholder="Share your thoughts..."
              placeholderTextColor={Colors.dark.textSecondary}
              multiline
              numberOfLines={4}
            />
          </View>
        </Animated.View>
      </ScrollView>
      
      <View style={styles.bottomActions}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={20} color={Colors.dark.text} />
        </Pressable>
        <Pressable style={[styles.primaryButton, styles.primaryButtonFlex]} onPress={onNext}>
          <Text style={styles.primaryButtonText}>Continue</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </View>
    </View>
  );
}

function Step7Finish({ data, onComplete, onBack }: StepProps & { onComplete: () => void }) {
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.stepContainer, { paddingTop: insets.top + Spacing.xl }]}>
      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.finishContent}>
        <View style={styles.finishIconContainer}>
          <Ionicons name="checkmark-circle" size={80} color={Colors.dark.primary} />
        </View>
        
        <Text style={styles.finishTitle}>Your academy is ready</Text>
        <Text style={styles.finishSubtitle}>
          Everything you see is real and editable.{"\n"}
          Welcome to Glow Up Sports!
        </Text>
        
        <View style={styles.academySummary}>
          <View style={styles.summaryRow}>
            <Ionicons name="business-outline" size={20} color={Colors.dark.primary} />
            <Text style={styles.summaryText}>{data.academyName}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Ionicons name="location-outline" size={20} color={Colors.dark.primary} />
            <Text style={styles.summaryText}>{data.location}</Text>
          </View>
        </View>
      </Animated.View>
      
      <View style={styles.bottomAction}>
        <Pressable style={styles.primaryButton} onPress={onComplete}>
          <Text style={styles.primaryButtonText}>Go to Academy Dashboard</Text>
          <Ionicons name="arrow-forward" size={20} color={Colors.dark.buttonText} />
        </Pressable>
      </View>
    </View>
  );
}

const TOTAL_STEPS = 7;

export default function AcademyOnboardingScreen({ navigation }: any) {
  const [currentStep, setCurrentStep] = useState(0);
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  
  const [data, setData] = useState<OnboardingData>({
    academyName: "",
    country: "",
    city: "",
    location: "",
    sport: "tennis",
    sports: ["tennis"],
    theme: "dark",
    accentColor: "green",
    lessonTypes: [],
    targetAudience: [],
    focus: [],
    expectations: [],
    additionalFeedback: "",
  });
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  
  const completeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/owner/onboarding/complete", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me"] });
      navigation.replace("OwnerMain");
    },
  });
  
  const goNext = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS - 1));
  };
  
  const goBack = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };
  
  const handleComplete = () => {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeMutation.mutate();
  };
  
  const stepProps: StepProps = {
    data,
    setData,
    onNext: goNext,
    onBack: goBack,
  };
  
  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <Step1Welcome {...stepProps} onLogout={logout} />;
      case 1:
        return <Step2Identity {...stepProps} showCountryPicker={showCountryPicker} setShowCountryPicker={setShowCountryPicker} showCityPicker={showCityPicker} setShowCityPicker={setShowCityPicker} />;
      case 2:
        return <Step3Style {...stepProps} />;
      case 3:
        return <Step4Type {...stepProps} />;
      case 4:
        return <Step5Walkthrough {...stepProps} />;
      case 5:
        return <Step6Feedback {...stepProps} />;
      case 6:
        return <Step7Finish {...stepProps} onComplete={handleComplete} />;
      default:
        return null;
    }
  };
  
  return (
    <LinearGradient
      colors={[Colors.dark.backgroundRoot, Colors.dark.backgroundDefault]}
      style={styles.container}
    >
      {currentStep > 0 && currentStep < TOTAL_STEPS - 1 ? (
        <View style={styles.progressWrapper}>
          <ProgressBar currentStep={currentStep - 1} totalSteps={TOTAL_STEPS - 2} />
        </View>
      ) : null}
      {renderStep()}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  progressWrapper: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: Spacing.xl,
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.backgroundTertiary,
  },
  progressDotActive: {
    backgroundColor: Colors.dark.primary,
    width: 24,
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  scrollContent: {
    flex: 1,
    marginTop: Spacing.lg,
  },
  welcomeContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  welcomeIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  reassuranceBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  reassuranceText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  stepSubtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    color: Colors.dark.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textInputMultiline: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  sportBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignSelf: "flex-start",
    gap: Spacing.sm,
  },
  sportBadgeText: {
    fontSize: 16,
    color: Colors.dark.text,
    fontWeight: "500" as const,
  },
  hintText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.sm,
  },
  previewCard: {
    backgroundColor: Backgrounds.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  previewLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  previewContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  previewIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  previewTextContainer: {
    flex: 1,
  },
  previewName: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  previewLocation: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  previewHeader: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  previewHeaderText: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: "600" as const,
  },
  previewThemeSample: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.md,
  },
  previewAccentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  previewSampleText: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  previewSampleSubtext: {
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  themeOptions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  themeOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.backgroundSecondary,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  themeOptionActive: {
    borderColor: Colors.dark.primary,
  },
  themeLabel: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    fontWeight: "500" as const,
  },
  themeLabelActive: {
    color: Colors.dark.primary,
  },
  colorOptions: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  colorOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "transparent",
  },
  colorOptionActive: {
    borderColor: Colors.dark.text,
  },
  disclaimerBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0, 212, 255, 0.1)",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  disclaimerText: {
    fontSize: 14,
    color: Colors.dark.xpCyan,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: Colors.dark.text,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  optionsColumn: {
    gap: Spacing.sm,
  },
  selectableChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  selectableChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(46, 204, 64, 0.1)",
  },
  chipIcon: {
    marginRight: Spacing.md,
  },
  chipLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.text,
  },
  chipLabelActive: {
    color: Colors.dark.primary,
  },
  walkthroughContainer: {
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  walkthroughStep: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Backgrounds.card,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  walkthroughStepActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: "rgba(46, 204, 64, 0.1)",
  },
  walkthroughIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundTertiary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  walkthroughIconActive: {
    backgroundColor: Colors.dark.primary,
  },
  walkthroughText: {
    flex: 1,
  },
  walkthroughTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  walkthroughTitleActive: {
    color: Colors.dark.primary,
  },
  walkthroughDescription: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: 2,
  },
  finishContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  finishIconContainer: {
    marginBottom: Spacing.xl,
  },
  finishTitle: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: Colors.dark.text,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  finishSubtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  academySummary: {
    backgroundColor: Backgrounds.card,
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
    marginTop: Spacing.lg,
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  summaryText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  bottomAction: {
    paddingVertical: Spacing.xl,
    paddingBottom: Spacing["2xl"],
  },
  bottomActions: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
    paddingBottom: Spacing["2xl"],
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  primaryButtonFlex: {
    flex: 1,
  },
  primaryButtonDisabled: {
    backgroundColor: Colors.dark.disabled,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.dark.buttonText,
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.dark.backgroundSecondary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  dropdownButtonDisabled: {
    opacity: 0.5,
  },
  dropdownButtonText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  dropdownButtonPlaceholder: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  pickerModalContent: {
    backgroundColor: Colors.dark.backgroundSecondary,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: "70%",
    paddingBottom: Spacing.xl,
  },
  pickerModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  pickerModalTitle: {
    fontSize: 18,
    fontWeight: "600" as const,
    color: Colors.dark.text,
  },
  pickerSearchInput: {
    backgroundColor: Colors.dark.backgroundTertiary,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    margin: Spacing.lg,
    marginTop: Spacing.sm,
    fontSize: 16,
    color: Colors.dark.text,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  pickerItemSelected: {
    backgroundColor: "rgba(46, 204, 64, 0.1)",
  },
  pickerItemText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  pickerItemTextSelected: {
    color: Colors.dark.primary,
    fontWeight: "500" as const,
  },
  pickerEmptyText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    padding: Spacing.xl,
  },
  logoutContainer: {
    position: "absolute",
    top: 10,
    right: 0,
    zIndex: 10,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  logoutText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
});
