import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { getApiUrl } from "@/lib/query-client";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  GlowColors,
  TextColors,
  Spacing,
  BorderRadius,
  Typography,
Backgrounds, Colors, } from "@/constants/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface IntroSlide {
  icon: string;
  iconColor: string;
  title: string;
  description: string;
}

interface WelcomeIntroModalProps {
  role: string;
  slides: IntroSlide[];
  onComplete: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function WelcomeIntroModal({
  role,
  slides,
  onComplete,
}: WelcomeIntroModalProps) {
  const [visible, setVisible] = useState(false);
  const [checked, setChecked] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const buttonScale = useSharedValue(1);

  const stateKey = `welcome_seen_${role}`;
  const localStorageKey = `@glow_welcome_seen_${role}`;

  useEffect(() => {
    checkIfSeen();
  }, [role]);

  const checkIfSeen = async () => {
    try {
      const localSeen = await AsyncStorage.getItem(localStorageKey);
      if (localSeen === "true") {
        setChecked(true);
        return;
      }

      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        setChecked(true);
        return;
      }
      const apiUrl = getApiUrl();
      const response = await fetch(new URL('/api/user/onboarding-state', apiUrl).toString(), {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.state && data.state[stateKey] === true) {
          await AsyncStorage.setItem(localStorageKey, "true");
          setChecked(true);
          return;
        }
      }
      setVisible(true);
    } catch (error) {
      console.warn("Failed to check welcome state, defaulting to hidden:", error);
    } finally {
      setChecked(true);
    }
  };

  const markAsSeen = async () => {
    await AsyncStorage.setItem(localStorageKey, "true").catch(() => {});
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;
      const apiUrl = getApiUrl();
      await fetch(new URL('/api/user/onboarding-state', apiUrl).toString(), {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ key: stateKey, value: true }),
      });
    } catch (error) {
      console.warn("Failed to save welcome seen state to server:", error);
    }
  };

  const handleComplete = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markAsSeen();
    setVisible(false);
    onComplete();
  }, [onComplete, stateKey]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentIndex < slides.length - 1) {
      const nextIndex = currentIndex + 1;
      scrollRef.current?.scrollTo({
        x: nextIndex * SCREEN_WIDTH,
        animated: true,
      });
      setCurrentIndex(nextIndex);
    } else {
      handleComplete();
    }
  }, [currentIndex, slides.length, handleComplete]);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleComplete();
  }, [handleComplete]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.round(offsetX / SCREEN_WIDTH);
      if (index !== currentIndex && index >= 0 && index < slides.length) {
        setCurrentIndex(index);
      }
    },
    [currentIndex, slides.length]
  );

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handleButtonPressIn = () => {
    buttonScale.value = withSpring(0.95, { damping: 15 });
  };

  const handleButtonPressOut = () => {
    buttonScale.value = withSpring(1, { damping: 15 });
  };

  const isLastSlide = currentIndex === slides.length - 1;

  if (!checked || !visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {currentIndex < slides.length - 1 ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.skipContainer}>
            <Pressable onPress={handleSkip} hitSlop={12} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          scrollEventThrottle={16}
          bounces={false}
          style={styles.scrollView}
        >
          {slides.map((slide, index) => (
            <View key={index} style={styles.slideContainer}>
              <LinearGradient
                colors={[`${slide.iconColor}15`, `${slide.iconColor}05`, "transparent"]}
                style={styles.slideGradient}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.6 }}
              />
              <Animated.View
                entering={FadeInDown.duration(500).delay(200)}
                style={styles.slideContent}
              >
                <View style={styles.illustrationArea}>
                  <View style={[styles.iconCircle, { backgroundColor: `${slide.iconColor}20` }]}>
                    <View style={[styles.iconInner, { backgroundColor: `${slide.iconColor}30` }]}>
                      <Ionicons
                        name={slide.icon as keyof typeof Ionicons.glyphMap}
                        size={48}
                        color={slide.iconColor}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.textContainer}>
                  <Text style={styles.slideTitle}>{slide.title}</Text>
                  <Text style={styles.slideDescription}>{slide.description}</Text>
                </View>
              </Animated.View>
            </View>
          ))}
        </ScrollView>

        <Animated.View entering={FadeInUp.duration(400).delay(300)} style={styles.bottomContainer}>
          <View style={styles.dotsContainer}>
            {slides.map((_, index) => {
              const isActive = index === currentIndex;
              return (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    isActive ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              );
            })}
          </View>

          <AnimatedPressable
            style={[styles.nextButton, buttonAnimatedStyle]}
            onPress={handleNext}
            onPressIn={handleButtonPressIn}
            onPressOut={handleButtonPressOut}
          >
            <Text style={styles.nextButtonText}>
              {isLastSlide ? "Get Started" : "Next"}
            </Text>
            {!isLastSlide ? (
              <Ionicons name="arrow-forward" size={18} color={Colors.dark.buttonText} />
            ) : (
              <Ionicons name="checkmark-circle" size={18} color={Colors.dark.buttonText} />
            )}
          </AnimatedPressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Backgrounds.card,
  },
  skipContainer: {
    position: "absolute",
    top: 56,
    right: Spacing.xl,
    zIndex: 10,
  },
  skipButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  skipText: {
    ...Typography.small,
    fontWeight: "600",
    color: TextColors.muted,
  },
  scrollView: {
    flex: 1,
  },
  slideContainer: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  slideGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "60%",
  },
  slideContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
    paddingTop: 60,
  },
  illustrationArea: {
    marginBottom: Spacing["3xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: "center",
    alignItems: "center",
  },
  iconInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  textContainer: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  slideTitle: {
    ...Typography.h1,
    color: TextColors.primary,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  slideDescription: {
    ...Typography.body,
    color: TextColors.secondary,
    textAlign: "center",
    lineHeight: 24,
  },
  bottomContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 48,
    alignItems: "center",
    gap: Spacing.xl,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  dot: {
    borderRadius: BorderRadius.full,
  },
  dotActive: {
    width: 24,
    height: 8,
    backgroundColor: GlowColors.primary,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: TextColors.disabled,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: GlowColors.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing["3xl"],
    borderRadius: BorderRadius.md,
    width: "100%",
  },
  nextButtonText: {
    ...Typography.h4,
    color: Colors.dark.buttonText,
  },
});

export default WelcomeIntroModal;
