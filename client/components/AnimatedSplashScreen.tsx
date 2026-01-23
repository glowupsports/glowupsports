import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/theme";

SplashScreen.preventAutoHideAsync();

interface AnimatedSplashScreenProps {
  isReady: boolean;
  onComplete: () => void;
  children: React.ReactNode;
}

export function AnimatedSplashScreen({ isReady, onComplete, children }: AnimatedSplashScreenProps) {
  const [showSplash, setShowSplash] = useState(true);
  const hasHiddenNativeSplash = useRef(false);
  
  const logoScale = useSharedValue(0.8);
  const logoOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const containerOpacity = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    logoScale.value = withSequence(
      withTiming(1.1, { duration: 400, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 200, easing: Easing.inOut(Easing.quad) })
    );
    textOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
    
    pulseScale.value = withSequence(
      withDelay(600, withTiming(1.05, { duration: 800 })),
      withTiming(1, { duration: 800 })
    );
  }, []);

  useEffect(() => {
    if (isReady && !hasHiddenNativeSplash.current) {
      hasHiddenNativeSplash.current = true;
      
      SplashScreen.hideAsync();
      
      setTimeout(() => {
        containerOpacity.value = withTiming(0, { duration: 400 }, () => {
          runOnJS(setShowSplash)(false);
          runOnJS(onComplete)();
        });
      }, 800);
    }
  }, [isReady]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value * pulseScale.value }],
    opacity: logoOpacity.value,
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <View style={styles.container}>
      {children}
      
      {showSplash && (
        <Animated.View style={[StyleSheet.absoluteFill, containerAnimatedStyle]}>
          <LinearGradient
            colors={[Colors.dark.backgroundRoot, "#0D1117", Colors.dark.backgroundRoot]}
            style={styles.gradient}
          >
            <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
              <View style={styles.iconGlow} />
              <Image
                source={require("../../assets/images/icon.png")}
                style={styles.logo}
                contentFit="contain"
              />
            </Animated.View>

            <Animated.View style={[styles.textContainer, textAnimatedStyle]}>
              <Text style={styles.appName}>GLOW UP</Text>
              <Text style={styles.tagline}>SPORTS</Text>
            </Animated.View>

            <Animated.View style={[styles.loadingContainer, textAnimatedStyle]}>
              <View style={styles.loadingDots}>
                <LoadingDot delay={0} />
                <LoadingDot delay={150} />
                <LoadingDot delay={300} />
              </View>
            </Animated.View>
          </LinearGradient>
        </Animated.View>
      )}
    </View>
  );
}

function LoadingDot({ delay }: { delay: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    const animate = () => {
      opacity.value = withDelay(
        delay,
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        )
      );
    };
    animate();
    const interval = setInterval(animate, 1200);
    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
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
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.dark.xpCyan,
    opacity: 0.15,
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 28,
  },
  textContainer: {
    alignItems: "center",
    marginTop: 24,
  },
  appName: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.dark.text,
    letterSpacing: 4,
  },
  tagline: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.dark.xpCyan,
    letterSpacing: 8,
    marginTop: 4,
  },
  loadingContainer: {
    position: "absolute",
    bottom: 100,
  },
  loadingDots: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.xpCyan,
  },
});
