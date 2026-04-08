import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors, Backgrounds, Typography, Spacing, BorderRadius, GlowColors } from "@/constants/theme";
import { useCoach } from "@/coach/context/CoachContext";
import { apiRequest } from "@/lib/query-client";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface FreelanceLicenseWizardProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const TOTAL_SLIDES = 4;

export function FreelanceLicenseWizard({ visible, onClose, onSuccess }: FreelanceLicenseWizardProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { coach } = useCoach();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [businessName, setBusinessName] = useState("");
  const [tagline, setTagline] = useState("");
  const [bio, setBio] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: freelanceData } = useQuery<{
    hasFreelanceLicense: boolean;
    freelanceAcademy: { id: string; name: string } | null;
    profile: { businessName: string | null; slug: string | null } | null;
  }>({
    queryKey: ["/api/coach/freelance-profile"],
    enabled: visible && !!coach?.id,
  });

  const activateMutation = useMutation({
    mutationFn: async (data: {
      businessName: string;
      tagline?: string;
      bio?: string;
      contactEmail?: string;
      contactPhone?: string;
      website?: string;
    }) => {
      return apiRequest("POST", "/api/coach/freelance-license", data);
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["/api/coach/freelance-profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coach/academies"] });
      onSuccess?.();
      handleClose();
    },
    onError: (error: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error("Failed to activate freelance license:", error);
      setErrorMessage(error?.message || "Failed to activate freelance license. Please try again.");
    },
  });

  useEffect(() => {
    if (visible) {
      setCurrentSlide(0);
    }
  }, [visible]);

  useEffect(() => {
    if (coach?.name && !businessName) {
      setBusinessName(`${coach.name} Tennis`);
    }
  }, [coach?.name]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleNext = () => {
    if (currentSlide < TOTAL_SLIDES - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentSlide(currentSlide + 1);
    } else {
      handleActivate();
    }
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleActivate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setErrorMessage(null);
    activateMutation.mutate({
      businessName: businessName.trim() || `${coach?.name || "Coach"} Tennis`,
      tagline: tagline.trim() || undefined,
      bio: bio.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      website: website.trim() || undefined,
    });
  };

  const canProceed = () => {
    switch (currentSlide) {
      case 0: return true;
      case 1: return businessName.trim().length > 0;
      case 2: return true;
      case 3: return true;
      default: return true;
    }
  };

  if (!visible) return null;

  const renderSlide = () => {
    switch (currentSlide) {
      case 0:
        return (
          <Animated.View 
            key="slide-0" 
            entering={SlideInRight.duration(200)} 
            exiting={SlideOutLeft.duration(200)}
            style={styles.slideContent}
          >
            <View style={styles.introContainer}>
              <LinearGradient
                colors={[Colors.dark.primary + "40", Colors.dark.xpCyan + "30"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.introIconGradient}
              >
                <Ionicons name="ribbon" size={48} color={Colors.dark.primary} />
              </LinearGradient>
              
              <Text style={styles.introTitle}>Go Freelance</Text>
              <Text style={styles.introSubtitle}>
                Create your own personal tennis academy and build your independent coaching brand.
              </Text>
              
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
                  </View>
                  <Text style={styles.benefitText}>Your own branded academy</Text>
                </View>
                <View style={styles.benefitItem}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
                  </View>
                  <Text style={styles.benefitText}>Set your own rates & schedules</Text>
                </View>
                <View style={styles.benefitItem}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
                  </View>
                  <Text style={styles.benefitText}>Keep working with other academies</Text>
                </View>
                <View style={styles.benefitItem}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name="checkmark" size={16} color={Colors.dark.primary} />
                  </View>
                  <Text style={styles.benefitText}>Unified calendar across all work</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        );

      case 1:
        return (
          <Animated.View 
            key="slide-1" 
            entering={SlideInRight.duration(200)} 
            exiting={SlideOutLeft.duration(200)}
            style={styles.slideContent}
          >
            <KeyboardAwareScrollViewCompat
              style={styles.formScrollView}
              contentContainerStyle={styles.formScrollContent}
            >
              <Text style={styles.slideTitle}>Your Brand</Text>
              <Text style={styles.slideSubtitle}>
                Choose a name for your freelance academy
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Business Name *</Text>
                <TextInput
                  style={styles.textInput}
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="e.g., John's Tennis Academy"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tagline (optional)</Text>
                <TextInput
                  style={styles.textInput}
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="e.g., Excellence in every stroke"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bio (optional)</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell players about your coaching philosophy..."
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </KeyboardAwareScrollViewCompat>
          </Animated.View>
        );

      case 2:
        return (
          <Animated.View 
            key="slide-2" 
            entering={SlideInRight.duration(200)} 
            exiting={SlideOutLeft.duration(200)}
            style={styles.slideContent}
          >
            <KeyboardAwareScrollViewCompat
              style={styles.formScrollView}
              contentContainerStyle={styles.formScrollContent}
            >
              <Text style={styles.slideTitle}>Contact Info</Text>
              <Text style={styles.slideSubtitle}>
                How can players reach you? (all optional)
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Contact Email</Text>
                <TextInput
                  style={styles.textInput}
                  value={contactEmail}
                  onChangeText={setContactEmail}
                  placeholder="coaching@email.com"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.textInput}
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  placeholder="+1 234 567 8900"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Website</Text>
                <TextInput
                  style={styles.textInput}
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://yoursite.com"
                  placeholderTextColor={Colors.dark.tabIconDefault}
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </View>
            </KeyboardAwareScrollViewCompat>
          </Animated.View>
        );

      case 3:
        return (
          <Animated.View 
            key="slide-3" 
            entering={SlideInRight.duration(200)} 
            exiting={SlideOutLeft.duration(200)}
            style={styles.slideContent}
          >
            <View style={styles.confirmContainer}>
              <LinearGradient
                colors={[Colors.dark.primary + "30", Colors.dark.xpCyan + "20"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.confirmCard}
              >
                <View style={styles.confirmHeader}>
                  <View style={styles.confirmIconContainer}>
                    <Ionicons name="ribbon" size={32} color={Colors.dark.primary} />
                  </View>
                  <Text style={styles.confirmTitle}>{businessName || "Your Academy"}</Text>
                  {tagline ? <Text style={styles.confirmTagline}>{tagline}</Text> : null}
                </View>

                <View style={styles.confirmDetails}>
                  {bio ? (
                    <View style={styles.confirmDetail}>
                      <Ionicons name="document-text-outline" size={16} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.confirmDetailText} numberOfLines={2}>{bio}</Text>
                    </View>
                  ) : null}
                  {contactEmail ? (
                    <View style={styles.confirmDetail}>
                      <Ionicons name="mail-outline" size={16} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.confirmDetailText}>{contactEmail}</Text>
                    </View>
                  ) : null}
                  {contactPhone ? (
                    <View style={styles.confirmDetail}>
                      <Ionicons name="call-outline" size={16} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.confirmDetailText}>{contactPhone}</Text>
                    </View>
                  ) : null}
                  {website ? (
                    <View style={styles.confirmDetail}>
                      <Ionicons name="globe-outline" size={16} color={Colors.dark.tabIconDefault} />
                      <Text style={styles.confirmDetailText}>{website}</Text>
                    </View>
                  ) : null}
                </View>
              </LinearGradient>

              <Text style={styles.confirmNote}>
                By activating, you'll create your own freelance academy. You can still work with other academies - your calendar stays unified.
              </Text>
            </View>
          </Animated.View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <Pressable style={styles.overlay} onPress={handleClose} />

        <View 
          style={[styles.modal, { paddingBottom: insets.bottom + Spacing.lg }]}
        >
          <LinearGradient
            colors={[Colors.dark.backgroundSecondary, Colors.dark.backgroundRoot]}
            style={styles.modalGradient}
          >
            <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
              <Pressable style={styles.closeButton} onPress={handleClose}>
                <Ionicons name="close" size={24} color={Colors.dark.text} />
              </Pressable>
              <Text style={styles.headerTitle}>Freelance License</Text>
              <View style={styles.closeButton} />
            </View>

            <View style={styles.progressContainer}>
              {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
                <View 
                  key={i} 
                  style={[
                    styles.progressDot,
                    i === currentSlide && styles.progressDotActive,
                    i < currentSlide && styles.progressDotComplete,
                  ]}
                />
              ))}
            </View>

            <View style={styles.content}>
              {renderSlide()}
            </View>

            {errorMessage ? (
              <View style={styles.errorBanner}>
                <Ionicons name="warning" size={16} color={Colors.dark.error} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            <View style={styles.footer}>
              {currentSlide > 0 ? (
                <Pressable style={styles.backButton} onPress={handleBack}>
                  <Ionicons name="chevron-back" size={20} color={Colors.dark.text} />
                  <Text style={styles.backButtonText}>Back</Text>
                </Pressable>
              ) : (
                <View style={styles.backButton} />
              )}

              <Pressable
                style={[
                  styles.nextButton,
                  !canProceed() && styles.nextButtonDisabled,
                  currentSlide === TOTAL_SLIDES - 1 && styles.activateButton,
                ]}
                onPress={handleNext}
                disabled={!canProceed() || activateMutation.isPending}
              >
                {activateMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.dark.buttonText} />
                ) : (
                  <>
                    <Text style={[
                      styles.nextButtonText,
                      currentSlide === TOTAL_SLIDES - 1 && styles.activateButtonText,
                    ]}>
                      {currentSlide === TOTAL_SLIDES - 1 ? "Activate License" : "Next"}
                    </Text>
                    {currentSlide < TOTAL_SLIDES - 1 ? (
                      <Ionicons name="chevron-forward" size={20} color={Colors.dark.text} />
                    ) : null}
                  </>
                )}
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Backgrounds.overlay,
  },
  modal: {
    maxHeight: "90%",
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: "hidden",
  },
  modalGradient: {
    flex: 1,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.headerBorder,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    ...Typography.h3,
    color: Colors.dark.text,
    fontWeight: "700",
  },
  progressContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
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
  progressDotComplete: {
    backgroundColor: Colors.dark.primary + "60",
  },
  content: {
    flex: 1,
    minHeight: 400,
  },
  slideContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.headerBorder,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    padding: Spacing.sm,
    minWidth: 80,
  },
  backButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.dark.backgroundTertiary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    ...Typography.body,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  activateButton: {
    backgroundColor: Colors.dark.primary,
  },
  activateButtonText: {
    color: Colors.dark.buttonText,
  },

  introContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  introIconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  introTitle: {
    ...Typography.h1,
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  introSubtitle: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  benefitsList: {
    width: "100%",
    gap: Spacing.md,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  benefitIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.dark.primary + "20",
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    ...Typography.body,
    color: Colors.dark.text,
  },

  formScrollView: {
    flex: 1,
  },
  formScrollContent: {
    paddingBottom: Spacing.xl,
  },
  slideTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    marginBottom: Spacing.xs,
  },
  slideSubtitle: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  textInput: {
    backgroundColor: Colors.dark.backgroundDefault,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Typography.body,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.headerBorder,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },

  confirmContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  confirmCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.dark.primary + "30",
  },
  confirmHeader: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  confirmIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.primary + "25",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  confirmTitle: {
    ...Typography.h2,
    color: Colors.dark.text,
    textAlign: "center",
  },
  confirmTagline: {
    ...Typography.body,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: Spacing.xs,
  },
  confirmDetails: {
    gap: Spacing.sm,
  },
  confirmDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  confirmDetailText: {
    ...Typography.body,
    color: Colors.dark.text,
    flex: 1,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.error + "15",
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.dark.error,
    flex: 1,
  },
  confirmNote: {
    ...Typography.caption,
    color: Colors.dark.tabIconDefault,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
});
