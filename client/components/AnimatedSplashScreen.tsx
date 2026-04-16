import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  withSpring,
  withRepeat,
  Easing,
  runOnJS,
  interpolate,
} from "react-native-reanimated";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Colors } from "@/constants/theme";

SplashScreen.preventAutoHideAsync();

const { width, height } = Dimensions.get("window");

const SYSTEM_MESSAGES = [
  "INITIALIZING GLOW PROTOCOL...",
  "SCANNING PLAYER DATABASE...",
  "CALIBRATING GLOW RANK...",
  "LOADING QUEST ENGINE...",
  "SYNCING ACADEMY NETWORK...",
  "COURT SYSTEMS ONLINE.",
];

interface AnimatedSplashScreenProps {
  isReady: boolean;
  onComplete: () => void;
  children: React.ReactNode;
}

export function AnimatedSplashScreen({ isReady, onComplete, children }: AnimatedSplashScreenProps) {
  const [showSplash, setShowSplash] = useState(true);
  const [messageIdx, setMessageIdx] = useState(0);
  const hasHiddenNativeSplash = useRef(false);

  useEffect(() => {
    if (!showSplash) return;
    const interval = setInterval(() => {
      setMessageIdx(prev => (prev + 1) % SYSTEM_MESSAGES.length);
    }, 380);
    return () => clearInterval(interval);
  }, [showSplash]);
  
  const logoScale = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  const logoRotate = useSharedValue(-15);
  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(30);
  const containerOpacity = useSharedValue(1);
  const glowScale = useSharedValue(0.5);
  const glowOpacity = useSharedValue(0);
  const ringScale = useSharedValue(0.8);
  const ringOpacity = useSharedValue(0);
  const progressWidth = useSharedValue(0);
  const particleOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    logoScale.value = withSpring(1, { damping: 14, stiffness: 130 });
    logoRotate.value = withSpring(0, { damping: 16, stiffness: 100 });
    
    glowOpacity.value = withDelay(120, withTiming(0.6, { duration: 300 }));
    glowScale.value = withDelay(120, withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    ));
    
    ringOpacity.value = withDelay(200, withTiming(0.3, { duration: 250 }));
    ringScale.value = withDelay(200, withRepeat(
      withSequence(
        withTiming(1.3, { duration: 2000, easing: Easing.out(Easing.quad) }),
        withTiming(0.8, { duration: 0 })
      ),
      -1,
      false
    ));
    
    textOpacity.value = withDelay(250, withTiming(1, { duration: 280 }));
    textTranslateY.value = withDelay(250, withSpring(0, { damping: 16, stiffness: 120 }));
    
    particleOpacity.value = withDelay(150, withTiming(1, { duration: 250 }));
    
    // Progress bar starts immediately and fills in 700ms
    progressWidth.value = withTiming(100, { duration: 700, easing: Easing.inOut(Easing.cubic) });
  }, []);

  useEffect(() => {
    if (isReady && !hasHiddenNativeSplash.current) {
      hasHiddenNativeSplash.current = true;
      
      SplashScreen.hideAsync();
      
      setTimeout(() => {
        logoScale.value = withTiming(1.5, { duration: 200 });
        containerOpacity.value = withTiming(0, { duration: 280 }, () => {
          runOnJS(setShowSplash)(false);
          runOnJS(onComplete)();
        });
      }, 200);
    }
  }, [isReady]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: logoScale.value },
      { rotate: `${logoRotate.value}deg` },
    ],
    opacity: logoOpacity.value,
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: interpolate(ringScale.value, [0.8, 1.3], [0.4, 0]),
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }],
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const particleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: particleOpacity.value,
  }));

  return (
    <View style={styles.container}>
      {children}
      
      {showSplash && (
        <Animated.View style={[StyleSheet.absoluteFill, containerAnimatedStyle]}>
          <LinearGradient
            colors={["#0A0F14", "#0D1820", "#0A1015", "#050A0D"]}
            locations={[0, 0.3, 0.7, 1]}
            style={styles.gradient}
          >
            <Animated.View style={[styles.particleContainer, particleAnimatedStyle]}>
              <FloatingParticle delay={0} x={width * 0.2} y={height * 0.2} />
              <FloatingParticle delay={200} x={width * 0.8} y={height * 0.15} />
              <FloatingParticle delay={400} x={width * 0.15} y={height * 0.7} />
              <FloatingParticle delay={600} x={width * 0.85} y={height * 0.65} />
              <FloatingParticle delay={800} x={width * 0.5} y={height * 0.85} />
              <FloatingParticle delay={300} x={width * 0.3} y={height * 0.4} />
              <FloatingParticle delay={500} x={width * 0.7} y={height * 0.45} />
            </Animated.View>

            <View style={styles.logoWrapper}>
              <Animated.View style={[styles.ring, ringAnimatedStyle]} />
              <Animated.View style={[styles.glow, glowAnimatedStyle]} />
              <Animated.View style={[styles.glowSecondary, glowAnimatedStyle]} />
              
              <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
                <View style={styles.logoInnerGlow} />
                <Image
                  source={require("../../assets/images/icon.png")}
                  style={styles.logo}
                  contentFit="contain"
                />
              </Animated.View>
            </View>

            <Animated.View style={[styles.textContainer, textAnimatedStyle]}>
              <Text style={styles.appName}>GLOW UP</Text>
              <View style={styles.taglineContainer}>
                <View style={styles.taglineLine} />
                <Text style={styles.tagline}>SPORTS</Text>
                <View style={styles.taglineLine} />
              </View>
            </Animated.View>

            <View style={styles.loadingContainer}>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressBar, progressAnimatedStyle]}>
                  <LinearGradient
                    colors={[Colors.dark.primary, Colors.dark.xpCyan, Colors.dark.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>
              <Text style={styles.loadingText}>{SYSTEM_MESSAGES[messageIdx]}</Text>
            </View>
          </LinearGradient>
        </Animated.View>
      )}
    </View>
  );
}

function FloatingParticle({ delay, x, y }: { delay: number; x: number; y: number }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(0.6, { duration: 600 }));
    scale.value = withDelay(delay, withTiming(1, { duration: 600 }));
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-20, { duration: 2000 + Math.random() * 1000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2000 + Math.random() * 1000, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
    left: x,
    top: y,
  }));

  return (
    <Animated.View style={[styles.particle, animatedStyle]}>
      <LinearGradient
        colors={[Colors.dark.xpCyan, Colors.dark.primary]}
        style={styles.particleGradient}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  particleContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  particle: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  particleGradient: {
    flex: 1,
    borderRadius: 3,
  },
  logoWrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: 220,
    height: 220,
  },
  ring: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: Colors.dark.xpCyan,
  },
  glow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.dark.primary,
    opacity: 0.3,
  },
  glowSecondary: {
    position: "absolute",
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: Colors.dark.xpCyan,
    opacity: 0.1,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  logoInnerGlow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 32,
    backgroundColor: Colors.dark.primary,
    opacity: 0.4,
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 28,
  },
  textContainer: {
    alignItems: "center",
    marginTop: 32,
  },
  appName: {
    fontSize: 36,
    fontWeight: "900",
    color: Colors.dark.text,
    letterSpacing: 6,
    textShadowColor: Colors.dark.xpCyan,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  taglineContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 12,
  },
  taglineLine: {
    width: 40,
    height: 1,
    backgroundColor: Colors.dark.xpCyan,
    opacity: 0.5,
  },
  tagline: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.dark.xpCyan,
    letterSpacing: 10,
  },
  loadingContainer: {
    position: "absolute",
    bottom: 80,
    alignItems: "center",
    width: width * 0.6,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 2,
    overflow: "hidden",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 11,
    color: Colors.dark.primary,
    letterSpacing: 2.5,
    fontWeight: "600",
    textTransform: "uppercase",
    opacity: 0.85,
  },
});
