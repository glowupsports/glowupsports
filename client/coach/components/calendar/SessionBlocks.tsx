import React from "react";
import {
  View,
  Text,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LinearGradient } from "expo-linear-gradient";
import { GlowColors } from "@/constants/theme";


export function dimColors(colors: string[]): string[] {
  return colors.map(c => {
    const hex = c.replace('#', '');
    const r = Math.round(parseInt(hex.substring(0, 2), 16) * 0.4);
    const g = Math.round(parseInt(hex.substring(2, 4), 16) * 0.4);
    const b = Math.round(parseInt(hex.substring(4, 6), 16) * 0.4);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  });
}

export function DraggableSessionBlock({ session, top, height, isPast, isActive, gradientColors, sessionLabel, formattedTime, formattedEndTime, hourHeight, courtLaneWidth, onTap, onLongPress, onDragEnd, onDragUpdate, hasConflict, onHoverIn, onHoverOut, onWebPress }: any) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .minDistance(10)
    .onStart(() => {
      isDragging.value = true;
      startX.value = translateX.value;
      startY.value = translateY.value;
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
      if (onDragUpdate) {
        runOnJS(onDragUpdate)(translateY.value, translateX.value, true);
      }
    })
    .onEnd(() => {
      isDragging.value = false;
      if (onDragEnd) {
        runOnJS(onDragEnd)(translateY.value, translateX.value);
      }
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      if (onDragUpdate) {
        runOnJS(onDragUpdate)(0, 0, false);
      }
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (Platform.OS !== 'web' && onTap) runOnJS(onTap)();
  });

  const longPressGesture = Gesture.LongPress()
    .minDuration(600)
    .onEnd(() => {
      if (onLongPress) runOnJS(onLongPress)();
    });

  const composedGesture = Gesture.Race(panGesture, Gesture.Exclusive(longPressGesture, tapGesture));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    zIndex: isDragging.value ? 100 : 1,
    opacity: isDragging.value ? 0.85 : 1,
  }));

  const displayColors = isPast ? dimColors(gradientColors) : gradientColors;

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top,
            left: 2,
            right: 2,
            height: height - 2,
            borderRadius: 6,
            overflow: 'hidden',
            borderWidth: hasConflict ? 2 : 1,
            borderColor: hasConflict ? '#FF4444' : 'rgba(255,255,255,0.08)',
            ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.35)', cursor: 'pointer' } as any : {}),
          },
          animatedStyle,
        ]}
        {...(Platform.OS === 'web' ? {
          onMouseEnter: onHoverIn,
          onMouseLeave: onHoverOut,
          onClick: (e: any) => { e.stopPropagation(); if (onWebPress) onWebPress(e.clientX, e.clientY); },
        } as any : {})}
      >
        <LinearGradient
          colors={displayColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, borderLeftWidth: 3, borderLeftColor: isActive ? '#00E676' : gradientColors[0] }}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0.0)', 'rgba(255,255,255,0.06)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ flex: 1, padding: 4 }}
          >
            {isActive ? (
              <View style={{ position: 'absolute', top: 2, right: 2 }}>
                <PulsingDot />
              </View>
            ) : null}
            <Text style={{ color: Colors.dark.buttonText, fontSize: 10, fontWeight: '700', lineHeight: 12 }} numberOfLines={height >= 50 ? 2 : 1}>
              {sessionLabel}
            </Text>
            {height > 30 ? (
              <Text style={{ color: 'rgba(0,0,0,0.65)', fontSize: 9 }} numberOfLines={1}>
                {formattedEndTime ? `${formattedTime}–${formattedEndTime}` : formattedTime}
              </Text>
            ) : null}
          </LinearGradient>
        </LinearGradient>
      </Animated.View>
    </GestureDetector>
  );
}

export function WeekDraggableSessionBlock({ session, top, height, isPast, isActive, gradientColors, sessionLabel, formattedTime, hourHeight, dayColumnWidth, onTap, onLongPress, onDragEnd }: any) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(400)
    .minDistance(10)
    .onStart(() => {
      isDragging.value = true;
      startX.value = translateX.value;
      startY.value = translateY.value;
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
    })
    .onUpdate((e) => {
      translateX.value = startX.value + e.translationX;
      translateY.value = startY.value + e.translationY;
    })
    .onEnd(() => {
      isDragging.value = false;
      if (onDragEnd) {
        runOnJS(onDragEnd)(translateY.value, translateX.value);
      }
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (onTap) runOnJS(onTap)();
  });

  const longPressGesture = Gesture.LongPress()
    .minDuration(600)
    .onEnd(() => {
      if (onLongPress) runOnJS(onLongPress)();
    });

  const composedGesture = Gesture.Race(panGesture, Gesture.Exclusive(longPressGesture, tapGesture));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    zIndex: isDragging.value ? 100 : 1,
    opacity: isDragging.value ? 0.85 : 1,
  }));

  const displayColors = isPast ? dimColors(gradientColors) : gradientColors;

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top,
            left: 1,
            right: 1,
            height: height - 1,
            borderRadius: 4,
            overflow: 'hidden',
          },
          animatedStyle,
        ]}
      >
        <LinearGradient
          colors={displayColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, padding: 2 }}
        >
          {isActive ? (
            <View style={{ position: 'absolute', top: 1, right: 1 }}>
              <PulsingDot />
            </View>
          ) : null}
          <Text style={{ color: Colors.dark.buttonText, fontSize: 8, fontWeight: '600' }} numberOfLines={1}>
            {sessionLabel}
          </Text>
          {height > 24 ? (
            <Text style={{ color: 'rgba(0,0,0,0.6)', fontSize: 7 }} numberOfLines={1}>
              {formattedTime}
            </Text>
          ) : null}
        </LinearGradient>
      </Animated.View>
    </GestureDetector>
  );
}

export function PulsingDot() {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  React.useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(0.3, { duration: 800 }), withTiming(1, { duration: 800 })), -1, true);
    scale.value = withRepeat(withSequence(withTiming(1.4, { duration: 800 }), withTiming(1, { duration: 800 })), -1, true);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: GlowColors.primary, marginRight: -4 }, animatedStyle]} />
  );
}

