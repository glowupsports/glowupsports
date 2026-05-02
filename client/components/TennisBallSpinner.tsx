import React, { useEffect } from "react";
import { View, StyleProp, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

const SIZE_MAP = {
  small: 20,
  large: 36,
};

interface TennisBallSpinnerProps {
  size?: "small" | "large";
  color?: string;
  style?: StyleProp<ViewStyle>;
}

export function TennisBallSpinner({
  size = "large",
  color = "#C8FF3D",
  style,
}: TennisBallSpinnerProps) {
  const px = SIZE_MAP[size];
  const rotation = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false
    );
    const bounceAmp = size === "small" ? 3 : 6;
    translateY.value = withRepeat(
      withSequence(
        withTiming(-bounceAmp, { duration: 380, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
  }, [size]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
    ],
  }));

  const r = px / 2;
  const strokeW = Math.max(1, px * 0.07);

  const ballColor = color;
  const seamColor = "rgba(255,255,255,0.75)";

  const ctrl1 = r * 0.55;

  return (
    <View style={[{ width: px, height: px }, style]}>
      <Animated.View style={[{ width: px, height: px }, animatedStyle]}>
        <Svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
          <Circle cx={r} cy={r} r={r - strokeW / 2} fill={ballColor} />
          <Path
            d={`M ${r},${strokeW / 2} C ${r - ctrl1},${r} ${r - ctrl1},${px - strokeW / 2} ${r},${px - strokeW / 2}`}
            fill="none"
            stroke={seamColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
          <Path
            d={`M ${r},${strokeW / 2} C ${r + ctrl1},${r} ${r + ctrl1},${px - strokeW / 2} ${r},${px - strokeW / 2}`}
            fill="none"
            stroke={seamColor}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default TennisBallSpinner;
